// routes/user.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import { uploadPublicFile, getSignedUrlForAsset } from '../services/storage.js';
import sharp from 'sharp';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { google } from 'googleapis';

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

// GET /user/:userId/status - token/scope status for integrations
router.get('/user/:userId/status', async (req, res) => {
  const { userId } = req.params;
  try {
    const normalizeExpiry = (value?: number | null) => {
      if (!value) return null;
      const ms = value > 1e12 ? value : value * 1000;
      return ms;
    };

    const response = {
      google: { hasToken: false, expiresAt: null as number | null, isExpired: false },
      microsoft: { hasToken: false, expiresAt: null as number | null, isExpired: false },
    };

    try {
      const googleTokens = await clerkClient.users.getUserOauthAccessToken(userId, 'oauth_google');
      const googleTokenData = googleTokens?.data?.[0];
      const googleExpiryMs = normalizeExpiry(
        (googleTokenData as any)?.expires_at ?? (googleTokenData as any)?.expiresAt ?? null
      );
      const googleHasToken = Boolean(googleTokenData?.token);
      let googleIsExpired = !googleHasToken || Boolean(googleExpiryMs && Date.now() >= googleExpiryMs);

      // Validate token with Google if present
      if (googleHasToken && !googleIsExpired) {
        try {
          const oauth2 = new google.auth.OAuth2();
          await oauth2.getTokenInfo(googleTokenData!.token as string);
        } catch (tokenErr) {
          console.warn('Google token appears invalid on validation:', tokenErr);
          googleIsExpired = true;
        }
      }

      response.google = {
        hasToken: googleHasToken,
        expiresAt: googleExpiryMs,
        isExpired: googleIsExpired,
      };
    } catch (err) {
      console.warn('Failed to fetch Google token for status route:', err);
      response.google = { hasToken: false, expiresAt: Date.now() - 1000, isExpired: true };
    }

    try {
      const microsoftTokens = await clerkClient.users.getUserOauthAccessToken(userId, 'oauth_microsoft');
      const microsoftTokenData = microsoftTokens?.data?.[0];
      const microsoftExpiryMs = normalizeExpiry(
        (microsoftTokenData as any)?.expires_at ?? (microsoftTokenData as any)?.expiresAt ?? null
      );
      const microsoftHasToken = Boolean(microsoftTokenData?.token);
      const microsoftIsExpired = !microsoftHasToken || Boolean(microsoftExpiryMs && Date.now() >= microsoftExpiryMs);
      response.microsoft = {
        hasToken: microsoftHasToken,
        expiresAt: microsoftExpiryMs,
        isExpired: microsoftIsExpired,
      };
    } catch (err) {
      console.warn('Failed to fetch Microsoft token for status route:', err);
      response.microsoft = { hasToken: false, expiresAt: Date.now() - 1000, isExpired: true };
    }

    res.json(response);
  } catch (error) {
    console.error('Error fetching user integration status:', error);
    res.json({
      google: { hasToken: false, expiresAt: null, isExpired: false },
      microsoft: { hasToken: false, expiresAt: null, isExpired: false },
    });
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

    let uploadBuffer = file.buffer;
    let uploadMime = file.mimetype;
    let uploadName = file.originalname;

    // Convert SVG to PNG to improve email client compatibility
    if (file.mimetype === 'image/svg+xml') {
      try {
        uploadBuffer = await sharp(file.buffer).png().toBuffer();
        uploadMime = 'image/png';
        uploadName = file.originalname.replace(/\.\w+$/, '') + '.png';
      } catch (err) {
        console.warn('Failed to convert SVG to PNG, uploading original SVG:', err);
      }
    }

    // Upload to B2
    const fileKey = `logos/logo-${Date.now()}-${uploadName}`;
    
    await uploadPublicFile(uploadBuffer, fileKey, uploadMime);
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
