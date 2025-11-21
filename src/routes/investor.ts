import { Router } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
const router = Router();
const prisma = new PrismaClient();
const clean = (v?: string | null) => (v ?? '').trim();
const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();
import { smartRefreshAvatarUrl } from '../utils/s3UrlHelpers';

/**
 * Returns investor with a fresh, signed avatar URL (and persists if it changed).
 */
async function withFreshAvatar<T extends { id: string; avatar: string | null }>(investor: T): Promise<T> {
  if (!investor?.avatar) return investor;

  const freshAvatarUrl = await smartRefreshAvatarUrl(investor.avatar);
  if (freshAvatarUrl !== investor.avatar) {
    await prisma.investor.update({
      where: { id: investor.id },
      data: { avatar: freshAvatarUrl },
    });
    return { ...investor, avatar: freshAvatarUrl };
  }

  return investor;
}


type InvestorScopeConfig = {
  orderBy: Prisma.InvestorOrderByWithRelationInput[];
  where?: Prisma.InvestorWhereInput;
};

const DEFAULT_SCOPE_KEY = 'DEFAULT';
const PRIORITY_COUNTRIES = [
  'United States',
  'Canada',
  'United Kingdom',
  'Singapore',
  'Australia',
];

// Session-scoped ordering options ensure users see a consistent list until they log out.
const INVESTOR_SCOPE_CONFIGS: Record<string, InvestorScopeConfig> = {
  [DEFAULT_SCOPE_KEY]: {
    orderBy: [{ id: 'asc' }],
  },
  UPDATED_RECENT: {
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  },
  EMAIL_HEAVY: {
    orderBy: [{ emails: { _count: 'desc' } }, { id: 'asc' }],
  },
  EMAIL_LIGHT: {
    orderBy: [{ emails: { _count: 'asc' } }, { id: 'asc' }],
  },
  NAME_ASC: {
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  },
  NAME_DESC: {
    orderBy: [{ name: 'desc' }, { id: 'asc' }],
  },
  COMPANY_ASC: {
    orderBy: [{ companyName: 'asc' }, { name: 'asc' }, { id: 'asc' }],
  },
  COUNTRY_ASC: {
    orderBy: [{ country: 'asc' }, { name: 'asc' }, { id: 'asc' }],
  },
  STATE_ASC: {
    orderBy: [{ state: 'asc' }, { name: 'asc' }, { id: 'asc' }],
  },
  CITY_ASC: {
    orderBy: [{ city: 'asc' }, { name: 'asc' }, { id: 'asc' }],
  },
};

function paginate<T>(arr: T[], page: number, per: number): T[] {
  const start = (page - 1) * per;
  return arr.slice(start, start + per);
}

router.get('/investors', async (req, res) => {
  const { page = '1', search = '', filters = '{}', itemsPerPage = '20' } = req.query;
  const scopeParam = typeof req.query.scope === 'string' ? req.query.scope : DEFAULT_SCOPE_KEY;

  try {
    // Safe parse filters
    const parsedFilters: Record<string, any> = (() => {
      try { return JSON.parse(String(filters || '{}')); } catch { return {}; }
    })();

    const pageNumber = Number.parseInt(String(page), 10) || 1;
    const itemsPerPageNumber = Number.parseInt(String(itemsPerPage), 10) || 20;

    const scopeKey = INVESTOR_SCOPE_CONFIGS[scopeParam] ? scopeParam : DEFAULT_SCOPE_KEY;
    const scopeConfig = INVESTOR_SCOPE_CONFIGS[scopeKey];
    console.info(`[investors] applying scope="${scopeKey}" page=${pageNumber} items=${itemsPerPageNumber}`);

    // ---- Where clause built for new schema ----
    const whereClause: Prisma.InvestorWhereInput = {};

    // Search across name (case-insensitive contains)
    if (typeof search === 'string' && search.trim() !== '') {
      const q = search.trim();
      whereClause.OR = [
        { name: { contains: q, mode: Prisma.QueryMode.insensitive } },
      ];
    }

    // Location filters (merged fields on Investor)
    const city    = clean(parsedFilters.city);
    const state   = clean(parsedFilters.state);
    const country = clean(parsedFilters.country);

    // Use equals for country to avoid "oman" matching "roman"
    if (country) {
      whereClause.country = { equals: country, mode: Prisma.QueryMode.insensitive };
    }
    if (city) {
      whereClause.city = { contains: city, mode: Prisma.QueryMode.insensitive };
    }
    if (state) {
      whereClause.state = { contains: state, mode: Prisma.QueryMode.insensitive };
    }

    // Stage (enum) — incoming strings mapped to StageEnum
    if (Array.isArray(parsedFilters.investmentStage) && parsedFilters.investmentStage.length) {
      whereClause.stages = { hasSome: parsedFilters.investmentStage as string[] };
    }

    // Investor Types (enum array)
    if (Array.isArray(parsedFilters.investmentType) && parsedFilters.investmentType.length) {
      whereClause.investorTypes = { hasSome: parsedFilters.investmentType as string[] };
    }

    // Markets (join table remains)
    if (Array.isArray(parsedFilters.investmentFocus) && parsedFilters.investmentFocus.length) {
      whereClause.markets = {
        some: {
          market: {
            title: { in: parsedFilters.investmentFocus as string[] },
          },
        },
      };
    }

    // Past Investments (join table remains)
    if (Array.isArray(parsedFilters.pastInvestment) && parsedFilters.pastInvestment.length) {
      whereClause.pastInvestments = {
        some: {
          pastInvestment: {
            title: { in: parsedFilters.pastInvestment as string[] },
          },
        },
      };
    }

    const effectiveWhere =
      scopeConfig.where
        ? { AND: [whereClause, scopeConfig.where] }
        : whereClause;

    // ---- Custom ordering logic to prioritize countries ----
    const priorityWhereClause: Prisma.InvestorWhereInput = {
      OR: PRIORITY_COUNTRIES.map(country => ({
        country: { equals: country, mode: Prisma.QueryMode.insensitive },
      })),
    };

    const priorityFilter: Prisma.InvestorWhereInput = {
      AND: [effectiveWhere, priorityWhereClause],
    };

    const nonPriorityWithCountryFilter: Prisma.InvestorWhereInput = {
      AND: [
        effectiveWhere,
        { NOT: priorityWhereClause },
        { country: { not: null } },
        { country: { not: '', mode: Prisma.QueryMode.insensitive } },
      ],
    };

    const noCountryFilter: Prisma.InvestorWhereInput = {
      AND: [
        effectiveWhere,
        {
          OR: [
            { country: null },
            { country: { equals: '', mode: Prisma.QueryMode.insensitive } },
          ],
        },
      ],
    };

    const [priorityCount, nonPriorityWithCountryCount, noCountryCount] = await Promise.all([
      prisma.investor.count({ where: priorityFilter }),
      prisma.investor.count({ where: nonPriorityWithCountryFilter }),
      prisma.investor.count({ where: noCountryFilter }),
    ]);

    const totalCount = priorityCount + nonPriorityWithCountryCount + noCountryCount;

    if (totalCount === 0) {
      return res.json({
        investors: [],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalItems: 0,
          itemsPerPage: itemsPerPageNumber,
        },
      });
    }

    const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPageNumber));
    const safePageNumber = Math.min(Math.max(pageNumber, 1), totalPages);

    const startIndex = (safePageNumber - 1) * itemsPerPageNumber;

    let remaining = itemsPerPageNumber;
    let skipCursor = startIndex;

    const allocate = (count: number) => {
      const skip = Math.min(skipCursor, count);
      const available = Math.max(count - skip, 0);
      const take = Math.min(remaining, available);
      skipCursor = Math.max(skipCursor - count, 0);
      remaining -= take;
      return { skip, take };
    };

    const { skip: prioritySkip, take: priorityTake } = allocate(priorityCount);
    const { skip: nonPrioritySkip, take: nonPriorityTake } = allocate(nonPriorityWithCountryCount);
    const { skip: noCountrySkip, take: noCountryTake } = allocate(noCountryCount);

    const investors: any[] = [];

    if (priorityTake > 0) {
      const priorityInvestors = await prisma.investor.findMany({
        where: priorityFilter,
        skip: prioritySkip,
        take: priorityTake,
        orderBy: scopeConfig.orderBy,
        distinct: ['id'],
        include: {
          emails: true,
          pastInvestments: { include: { pastInvestment: true } },
          markets: {
            where: { market: { isCountry: false } },
            include: { market: true },
          },
        },
        omit: {
          createdAt: true,
          updatedAt: true,
          externalId: true,
          sourceData: true
        },
      });
      investors.push(...priorityInvestors);
    }

    if (nonPriorityTake > 0) {
      const nonPriorityInvestors = await prisma.investor.findMany({
        where: nonPriorityWithCountryFilter,
        skip: nonPrioritySkip,
        take: nonPriorityTake,
        orderBy: scopeConfig.orderBy,
        distinct: ['id'],
        include: {
          emails: true,
          pastInvestments: { include: { pastInvestment: true } },
          markets: {
            where: { market: { isCountry: false } },
            include: { market: true },
          },
        },
        omit: {
          createdAt: true,
          updatedAt: true,
          externalId: true,
          sourceData: true
        },
      });
      investors.push(...nonPriorityInvestors);
    }

    if (noCountryTake > 0) {
      const noCountryInvestors = await prisma.investor.findMany({
        where: noCountryFilter,
        skip: noCountrySkip,
        take: noCountryTake,
        orderBy: scopeConfig.orderBy,
        distinct: ['id'],
        include: {
          emails: true,
          pastInvestments: { include: { pastInvestment: true } },
          markets: {
            where: { market: { isCountry: false } },
            include: { market: true },
          },
        },
        omit: {
          createdAt: true,
          updatedAt: true,
          externalId: true,
          sourceData: true
        },
      });
      investors.push(...noCountryInvestors);
    }

    const investorsWithFreshAvatars = await Promise.all(
      investors.map((inv) => withFreshAvatar(inv))
    );

    res.json({
      investors: investorsWithFreshAvatars,
      pagination: {
        currentPage: safePageNumber,
        totalPages,
        totalItems: totalCount,
        itemsPerPage: itemsPerPageNumber,
      },
    });
  } catch (error) {
    console.error('Error fetching investors:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/investment-filters', async (req, res) => {
  try {
    const { search = '' } = req.query;
    const q = norm(typeof search === 'string' ? search : '');

    // Get all filter values without pagination or search filtering
    const [allStages, allTypes, allMarkets] = await Promise.all([
      // ---- Stages: enum (no table) ----
      prisma.investor.findMany({
        distinct: ['stages'],
        select: { stages: true },
      }).then(stages => {
        const flatStages = stages.flatMap(inv => inv.stages || []);
        return [...new Set(flatStages)].sort();
      }),

      // ---- Investor Types ----
      prisma.investor.findMany({
        distinct: ['investorTypes'],
        select: { investorTypes: true },
      }).then(types => {
        const flatTypes = types.flatMap(inv => inv.investorTypes || []);
        return [...new Set(flatTypes)].sort();
      }),

      // ---- Markets: table ----
      prisma.market.findMany({
        where: { isCountry: false },
        orderBy: { title: 'asc' },
      }).then(markets => markets.map(m => m.title)),

      // ---- Past Investments: table with search filter ----
      prisma.pastInvestment.findMany({
        where: q ? { title: { contains: q, mode: Prisma.QueryMode.insensitive } } : {},
        take: 20,
        orderBy: { title: 'asc' },
      }).then(pastInvestments => pastInvestments.map(pi => pi.title)),
    ]);

    res.json({
      stages: allStages,
      investmentTypes: allTypes,
      investmentFocuses: allMarkets
    });
  } catch (error) {
    console.error('Error fetching investment filters:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/investors/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const investorRecord = await prisma.investor.findUnique({
      where: { id },
      include: {
        emails: true,
        pastInvestments: { include: { pastInvestment: true } },
        markets: {
          where: { market: { isCountry: false } },
          include: { market: true },
        },
      },
    });

    if (!investorRecord) {
      return res.status(404).json({ error: 'Investor not found' });
    }

    const investor = await withFreshAvatar(investorRecord);

    res.json({ investor });
  } catch (error) {
    console.error('Error fetching investor details:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
