import { Router } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
const router = Router();
const prisma = new PrismaClient();
const clean = (v?: string | null) => (v ?? '').trim();
const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

function paginate<T>(arr: T[], page: number, per: number): T[] {
  const start = (page - 1) * per;
  return arr.slice(start, start + per);
}

router.get('/investors', async (req, res) => {
  const { page = '1', search = '', filters = '{}', itemsPerPage = '20' } = req.query;

  try {
    // Safe parse filters
    const parsedFilters: Record<string, any> = (() => {
      try { return JSON.parse(String(filters || '{}')); } catch { return {}; }
    })();

    const pageNumber = Number.parseInt(String(page), 10) || 1;
    const itemsPerPageNumber = Number.parseInt(String(itemsPerPage), 10) || 20;

    // ---- Where clause built for new schema ----
    const whereClause: Prisma.InvestorWhereInput = {};

    // Search across name and companyName (case-insensitive contains)
    if (typeof search === 'string' && search.trim() !== '') {
      const q = search.trim();
      whereClause.OR = [
        { name:        { contains: q, mode: Prisma.QueryMode.insensitive } },
        { companyName: { contains: q, mode: Prisma.QueryMode.insensitive } },
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

    const [investors, totalCount] = await Promise.all([
      prisma.investor.findMany({
        where: whereClause,
        skip: (pageNumber - 1) * itemsPerPageNumber,
        take: itemsPerPageNumber,
        orderBy: [{ id: 'asc' }],
        include: {
          emails: true,
          pastInvestments: { include: { pastInvestment: true } },
          markets: { include: { market: true } },
        },
        omit: {
          createdAt: true,
          updatedAt: true,
          externalId: true,
          sourceData: true,
          avatar: true
        },
      }),
      prisma.investor.count({ where: whereClause }),
    ]);

    res.json({
      investors,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalCount / itemsPerPageNumber),
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
    const [allStages, allTypes, allMarkets, allPastInvestments] = await Promise.all([
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
      investmentFocuses: allMarkets,
      pastInvestments: allPastInvestments,
    });
  } catch (error) {
    console.error('Error fetching investment filters:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/investors/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const investor = await prisma.investor.findUnique({
      where: { id },
      include: {
        emails: true,
        pastInvestments: { include: { pastInvestment: true } },
        markets: { include: { market: true } },
      },
    });

    if (!investor) {
      return res.status(404).json({ error: 'Investor not found' });
    }

    res.json({ investor });
  } catch (error) {
    console.error('Error fetching investor details:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
