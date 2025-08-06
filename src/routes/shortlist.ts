// src/routes/shortlist.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// POST /shortlist
router.post('/shortlist', async (req, res) => {
  const { userId, email, investorId } = req.body;

  if (!userId || !email || !investorId) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    // Find or create the user
    let user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          id: userId,
          email,
        },
      });
    }

    // Check for existing shortlist
    const existingShortlist = await prisma.shortlist.findUnique({
      where: {
        userId_investorId: {
          userId,
          investorId,
        },
      },
    });

    if (existingShortlist) {
      return res.status(400).json({ message: 'Investor already shortlisted' });
    }

    const shortlist = await prisma.shortlist.create({
      data: {
        userId,
        investorId,
      },
    });

    res.status(201).json(shortlist);
  } catch (error) {
    console.error('Error adding to shortlist:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


router.get('/shortlists/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const shortlists = await prisma.shortlist.findMany({
      where: {
        userId,
      },
      include: {
        investor: true,
      },
    });

    res.json(shortlists);
  } catch (error) {
    console.error('Error fetching shortlists:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
