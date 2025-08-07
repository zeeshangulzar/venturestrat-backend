import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();
const prisma = new PrismaClient();

// Backend - Fixed investor route with debug logging
router.get('/investors', async (req, res) => {
  const { page = 1, search = '', filters = '{}', itemsPerPage = 20 } = req.query;
  
  try {
    const parsedFilters = JSON.parse(filters as string);
    const pageNumber = parseInt(page as string, 10);
    const itemsPerPageNumber = parseInt(itemsPerPage as string, 10);

    const whereClause: any = {};

    // Only add search filter if search term exists
    if (search && search.trim() !== '') {
      whereClause.name = {
        contains: search as string,
        mode: 'insensitive',
      };
    }

    // Only add address filters if they exist
    const addressFilter: any = {};
    if (parsedFilters.city) addressFilter.city = parsedFilters.city;
    if (parsedFilters.state) addressFilter.state = parsedFilters.state;
    if (parsedFilters.country) addressFilter.country = parsedFilters.country;
    
    if (Object.keys(addressFilter).length > 0) {
      whereClause.address = addressFilter;
    }

    // Add investment stage filter
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

    // Add investor type filter
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

    // Add investment focus filter
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

    // Get total count for pagination
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
    const { search = '', type = '', page = 1, itemsPerPage = 20 } = req.query;

    // Ensure that page and itemsPerPage are integers
    const pageNumber = parseInt(page, 10);
    const itemsPerPageNumber = parseInt(itemsPerPage, 10);

    // Calculate pagination values
    const skip = (pageNumber - 1) * itemsPerPageNumber;
    const take = itemsPerPageNumber;

    // Create a base where clause for search functionality
    const searchWhereClause = search
      ? {
          title: {
            contains: search,
            mode: 'insensitive', // Case-insensitive search
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
      stages: stages ? stages.map((stage) => stage.title) : [],
      investmentTypes: investmentTypes ? investmentTypes.map((type) => type.title) : [],
      investmentFocuses: investmentFocuses ? investmentFocuses.map((focus) => focus.title) : [],
      pastInvestments: pastInvestments
        ? pastInvestments.map((investment) => investment.title)
        : [],
    });
  } catch (error) {
    console.error('Error fetching investment filters:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
