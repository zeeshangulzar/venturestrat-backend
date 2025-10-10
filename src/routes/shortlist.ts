// src/routes/shortlist.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// POST /shortlist
router.post('/shortlist', async (req, res) => {
  const { userId, email, investorId } = req.body;
  console.log('Received shortlist request:', { userId, email, investorId });

  if (!userId || !email || !investorId) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    // Check if user exists (should be created via Clerk webhook)
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found. Please ensure you are authenticated.' });
    }

    // Check for existing shortlist
    const existingShortlist = await prisma.shortlist.findUnique({
      where: {
        userId_investorId: {
          userId: user.id,
          investorId,
        },
      },
    });

    if (existingShortlist) {
      return res.status(400).json({ message: 'Investor already shortlisted' });
    }

    const shortlist = await prisma.shortlist.create({
      data: {
        userId: user.id,
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

// NEW ROUTE: GET /user/:userId/details - Get user details with shortlisted investors
router.get('/user/:userId/details', async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        shortlists: {
          include: {
            investor: {
              include: {
                emails: true,
                messages: {
                  where: { userId, status: 'DRAFT' }
                }
              },
            },
          },
          orderBy: {
            investor: {
              createdAt: 'desc',
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'No Investors Found' });
    }

    // Extract just the investors from the shortlists
    const shortlistedInvestors = user.shortlists.map(shortlist => {
      const investor = shortlist.investor;
      const { messages, ...restInvestor } = investor;

      return {
        ...restInvestor,
        status: shortlist.status,
        shortlistId: shortlist.id,
        hasDraft: messages.length > 0,
      };
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      },
      shortlistedInvestors,
      totalShortlisted: shortlistedInvestors.length,
    });

  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.put('/shortlist/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const updatedShortlist = await prisma.shortlist.update({
      where: { id },
      data: { status },
    });

    res.json({
      message: 'Shortlist status updated successfully',
      shortlist: updatedShortlist,
    });
  } catch (error) {
    console.error('Error updating shortlist status:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
