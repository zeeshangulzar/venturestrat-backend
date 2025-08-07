import { Router } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
const router = Router();
const prisma = new PrismaClient();

router.get('/investors', async (req, res) => {
  const { page = '1', search = '', filters = '{}', itemsPerPage = '20' } = req.query;

  try {
    const parsedFilters = JSON.parse(filters as string);

    const pageNumber = parseInt(String(page), 10);  // Convert to string first
    const itemsPerPageNumber = parseInt(String(itemsPerPage), 10);  // Convert to string first

    const whereClause: any = {};

    if (search && typeof search === 'string' && search.trim() !== '') {
      whereClause.name = {
        contains: search.trim(),
        mode: Prisma.QueryMode.insensitive,
      };
    }

    const addressFilter: any = {};
    if (parsedFilters.city) addressFilter.city = parsedFilters.city;
    if (parsedFilters.state) addressFilter.state = parsedFilters.state;
    if (parsedFilters.country) addressFilter.country = parsedFilters.country;

    if (Object.keys(addressFilter).length > 0) {
      whereClause.address = addressFilter;
    }

    if (parsedFilters.investmentStage?.length) {
      whereClause.stages = {
        some: {
          stage: {
            title: {
              in: parsedFilters.investmentStage
            }
          }
        }
      };
    }

    if (parsedFilters.investmentType?.length) {
      whereClause.investorTypes = {
        some: {
          investorType: {
            title: {
              in: parsedFilters.investmentType
            }
          }
        }
      };
    }

    if (parsedFilters.investmentFocus?.length) {
      whereClause.markets = {
        some: {
          market: {
            title: {
              in: parsedFilters.investmentFocus
            }
          }
        }
      };
    }

    const investors = await prisma.investor.findMany({
      where: whereClause,
      skip: (pageNumber - 1) * itemsPerPageNumber,
      take: itemsPerPageNumber,
      include: {
        address: true,
        company: true,
        emails: true,
        pastInvestments: {
          include: {
            pastInvestment: true
          }
        },
        investorTypes: {
          include: {
            investorType: true
          }
        },
        stages: {
          include: {
            stage: true
          }
        },
        markets: {
          include: {
            market: true
          }
        }
      },
    });

    const totalCount = await prisma.investor.count({
      where: whereClause,
    });

    res.json({
      investors,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalCount / itemsPerPageNumber),
        totalItems: totalCount,
        itemsPerPage: itemsPerPageNumber,
      }
    });
  } catch (error) {
    console.error('Error fetching investors:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/investment-filters', async (req, res) => {
  try {
    const { search = '', type = '', page = '1', itemsPerPage = '20' } = req.query;

    const pageNumber = parseInt(String(page), 10); // Convert to string first
    const itemsPerPageNumber = parseInt(String(itemsPerPage), 10); // Convert to string first

    const skip = (pageNumber - 1) * itemsPerPageNumber;
    const take = itemsPerPageNumber;

    const searchWhereClause = search
      ? {
          title: {
            contains: typeof search === 'string' ? search.trim() : '',
            mode: Prisma.QueryMode.insensitive, // Correct mode type
          },
        }
      : {};

    let stages, investmentTypes, investmentFocuses, pastInvestments;

    if (type === 'investmentStages' || !type) {
      stages = await prisma.stage.findMany({
        where: searchWhereClause,
        skip: skip,
        take: take,
      });
    }

    if (type === 'investmentTypes' || !type) {
      investmentTypes = await prisma.investorType.findMany({
        where: searchWhereClause,
        skip: skip,
        take: take,
      });
    }

    if (type === 'investmentFocuses' || !type) {
      investmentFocuses = await prisma.market.findMany({
        where: searchWhereClause,
        skip: skip,
        take: take,
      });
    }

    if (type === 'pastInvestments' || !type) {
      pastInvestments = await prisma.pastInvestment.findMany({
        where: searchWhereClause,
        skip: skip,
        take: take,
      });
    }

    res.json({
      stages: stages ? stages.map((stage: { title: string }) => stage.title) : [],
      investmentTypes: investmentTypes ? investmentTypes.map((type: { title: string }) => type.title) : [],
      investmentFocuses: investmentFocuses ? investmentFocuses.map((focus: { title: string }) => focus.title) : [],
      pastInvestments: pastInvestments
        ? pastInvestments.map((investment: { title: string }) => investment.title)
        : [],
    });
  } catch (error) {
    console.error('Error fetching investment filters:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
