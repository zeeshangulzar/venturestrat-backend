// routes/user.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.post('/createOrFindUser', async (req, res) => {
  const { userId, email } = req.body;

  try {
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (existingUser) {
      return res.status(200).json(existingUser);
    }

    const newUser = await prisma.user.create({
      data: {
        id: userId,
        email: email,
      },
    });

    res.status(201).json(newUser);
  } catch (error) {
    console.error('Error creating or finding user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PUT /user/:userId - Update user information
router.put('/user/:userId', async (req, res) => {
  const { userId } = req.params;
  const { firstname, lastname, role, onboardingComplete, publicMetaData } = req.body;
  console.log('Update request body:', req.body);

  try {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user with provided fields
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(firstname !== undefined && { firstname }),
        ...(lastname !== undefined && { lastname }),
        ...(role !== undefined && { role }),
        ...(onboardingComplete !== undefined && { onboardingComplete }),
        ...(publicMetaData !== undefined && { publicMetaData }),
      },
    });

    res.json({
      message: 'User updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        firstname: updatedUser.firstname,
        lastname: updatedUser.lastname,
        role: updatedUser.role,
        onboardingComplete: updatedUser.onboardingComplete,
        publicMetaData: updatedUser.publicMetaData,
        createdAt: updatedUser.createdAt,
      },
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /user/:userId - Get user by ID
router.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        shortlists: {
          include: {
            investor: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstname: user.firstname,
        lastname: user.lastname,
        role: user.role,
        onboardingComplete: user.onboardingComplete,
        publicMetaData: user.publicMetaData,
        createdAt: user.createdAt,
      },
      shortlistedInvestors: user.shortlists.map(shortlist => shortlist.investor),
      totalShortlisted: user.shortlists.length,
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
