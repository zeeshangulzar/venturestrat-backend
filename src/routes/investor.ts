import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  const { page = 1, search = '', filters = '{}', itemsPerPage = 20 } = req.query;
  const parsedFilters = JSON.parse(filters as string);
  const pageNumber = parseInt(page as string, 10);
  const itemsPerPageNumber = parseInt(itemsPerPage as string, 10);

  try {
    const whereClause: any = {
      name: {
        contains: search as string,
        mode: 'insensitive',
      },
      city: parsedFilters.city || undefined,
      state: parsedFilters.state || undefined,
      country: parsedFilters.country || undefined,
      investment_stage: parsedFilters.investmentStage?.length
        ? { in: parsedFilters.investmentStage }
        : undefined,
      investment_type: parsedFilters.investmentType?.length
        ? { in: parsedFilters.investmentType }
        : undefined,
    };

    if (parsedFilters.investmentFocus?.length) {
      whereClause.OR = parsedFilters.investmentFocus.map((focus: string) => ({
        investment_focus: {
          contains: focus,
          mode: 'insensitive',
        },
      }));
    }

    const investors = await prisma.investor.findMany({
      where: whereClause,
      skip: (pageNumber - 1) * itemsPerPageNumber,
      take: itemsPerPageNumber,
    });

    res.json(investors);
  } catch (error) {
    console.error('Error fetching investors:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
