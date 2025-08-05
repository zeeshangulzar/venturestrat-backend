// routes/investor.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient(); // Initialize Prisma Client

router.get('/', async (req, res) => {
  const { page = 1, search = '', filters = '{}', itemsPerPage = 20 } = req.query;
  const parsedFilters = JSON.parse(filters);

  try {
    const investors = await prisma.broker.findMany({
      where: {
        name: {
          contains: search,
          mode: 'insensitive',
        },
        city: parsedFilters.city || undefined,
        state: parsedFilters.state || undefined,
        country: parsedFilters.country || undefined,
        investment_stage: parsedFilters.investmentStage || undefined,
      },
      skip: (page - 1) * itemsPerPage,
      take: +itemsPerPage,
    });

    res.json(investors);
  } catch (error) {
    console.error('Error fetching investors:', error);  // More detailed logging
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
