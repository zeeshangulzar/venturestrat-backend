// routes/user.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import { uploadPublicFile, getSignedUrlForAsset } from '../services/storage.js';

const router = Router();
const prisma = new PrismaClient();

// Configure multer for logo uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for logos
  },
});

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

// GET /users - Get all users
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: limit,
      }),
      prisma.user.count()
    ]);

    const totalPages = Math.ceil(totalCount / limit);
    
    res.json({
      users,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PUT /user/:userId - Update user information
router.put('/user/:userId', async (req, res) => {
  const { userId } = req.params;
  const { firstname, lastname, role, onboardingComplete, publicMetaData, companyWebsite, companyLogo } = req.body;
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
        ...(companyWebsite !== undefined && { companyWebsite }),
        ...(companyLogo !== undefined && { companyLogo }),
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
        companyWebsite: updatedUser.companyWebsite,
        companyLogo: updatedUser.companyLogo,
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
        companyWebsite: user.companyWebsite,
        companyLogo: user.companyLogo,
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

// POST /user/upload-logo - Upload company logo
router.post('/user/upload-logo', upload.single('logo'), async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Handle file upload (assuming multer middleware is set up)
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.file;
    
    // Validate file type
    if (!file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'File must be an image' });
    }

    // Upload to B2
    const fileKey = `logos/logo-${Date.now()}-${file.originalname}`;
    
    await uploadPublicFile(file.buffer, fileKey, file.mimetype);
    const logoUrl = await getSignedUrlForAsset(fileKey);

    // Update user with new logo URL
    await prisma.user.update({
      where: { id: userId },
      data: { companyLogo: logoUrl }
    });

    res.json({
      message: 'Logo uploaded successfully',
      logoUrl
    });

  } catch (error) {
    console.error('Error uploading logo:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
