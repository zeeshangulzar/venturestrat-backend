// routes/user.ts
import { Router } from 'express';
import { PrismaClient, SubscriptionPlan, User } from '@prisma/client';
import multer from 'multer';
import type Stripe from 'stripe';
import { stripeService } from '../services/stripeService.js';
import { uploadPublicFile, getSignedUrlForAsset } from '../services/storage.js';
import sharp from 'sharp';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { google } from 'googleapis';
import { scheduleUpgradePlanReminder } from '../services/userLifecycle.js';

const router = Router();
const prisma = new PrismaClient();

// Configure multer for logo uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for logos
  },
});

const buildSubscriptionResponse = (user: User) => ({
  plan: user.subscriptionPlan,
  status: user.subscriptionStatus,
  currentPeriodEnd: user.subscriptionCurrentPeriodEnd,
  stripeCustomerId: user.stripeCustomerId,
  stripeSubscriptionId: user.stripeSubscriptionId,
  stripePaymentMethodId: user.stripePaymentMethodId,
});

const mapPaymentMethodSummary = (paymentMethod: Stripe.PaymentMethod | null) => {
  if (!paymentMethod || paymentMethod.type !== 'card' || !paymentMethod.card) {
    return null;
  }

  const { brand, last4, exp_month, exp_year } = paymentMethod.card;

  return {
    id: paymentMethod.id,
    brand,
    last4,
    expMonth: exp_month ?? undefined,
    expYear: exp_year ?? undefined,
  };
};

const resetUsageForCurrentPeriod = async (userId: string) => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  await prisma.usageTracking.updateMany({
    where: {
      userId,
      month: currentMonth,
      year: currentYear,
    },
    data: {
      aiDraftsUsed: 0,
      emailsSent: 0,
      investorsAdded: 0,
      monthlyEmailsSent: 0,
      monthlyInvestorsAdded: 0,
      monthlyFollowUpEmailsSent: 0,
    },
  });
};

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

    const mergedPublicMeta =
      publicMetaData !== undefined
        ? {
            ...(existingUser.publicMetaData as any),
            ...(publicMetaData as any),
          }
        : undefined;

    // Update user with provided fields
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(firstname !== undefined && { firstname }),
        ...(lastname !== undefined && { lastname }),
        ...(role !== undefined && { role }),
        ...(onboardingComplete !== undefined && { onboardingComplete }),
        ...(mergedPublicMeta !== undefined && { publicMetaData: mergedPublicMeta }),
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
        stripeCustomerId: updatedUser.stripeCustomerId,
        stripeSubscriptionId: updatedUser.stripeSubscriptionId,
        stripePaymentMethodId: updatedUser.stripePaymentMethodId,
        subscriptionPlan: updatedUser.subscriptionPlan,
        subscriptionStatus: updatedUser.subscriptionStatus,
        subscriptionCurrentPeriodEnd: updatedUser.subscriptionCurrentPeriodEnd,
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
        stripeCustomerId: user.stripeCustomerId,
        stripeSubscriptionId: user.stripeSubscriptionId,
        stripePaymentMethodId: user.stripePaymentMethodId,
        subscriptionPlan: user.subscriptionPlan,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd,
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

router.get('/user/:userId/subscription', async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let paymentMethodSummary = null;

    if (stripeService.isEnabled() && user.stripePaymentMethodId) {
      try {
        const paymentMethod = await stripeService.retrievePaymentMethod(user.stripePaymentMethodId);
        paymentMethodSummary = mapPaymentMethodSummary(paymentMethod);
      } catch (paymentMethodError) {
        console.warn(`Failed to fetch payment method for user ${userId}:`, paymentMethodError);
      }
    }

    return res.json({
      subscription: buildSubscriptionResponse(user),
      paymentMethod: paymentMethodSummary,
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/user/:userId/subscription', async (req, res) => {
  const { userId } = req.params;
  const { plan, paymentMethodId } = req.body as { plan?: string; paymentMethodId?: string };

  const normalizedPlan = typeof plan === 'string' ? plan.toUpperCase() : '';

  if (!Object.values(SubscriptionPlan).includes(normalizedPlan as SubscriptionPlan)) {
    return res.status(400).json({ error: 'Invalid subscription plan' });
  }

  if (!stripeService.isEnabled()) {
    return res.status(503).json({ error: 'Stripe is not configured' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetPlan = normalizedPlan as SubscriptionPlan;
    const previousPlan = user.subscriptionPlan;

    const customerId = await stripeService.ensureCustomer({
      userId,
      email: user.email,
      name: [user.firstname, user.lastname].filter(Boolean).join(' ') || null,
      existingCustomerId: user.stripeCustomerId,
    });

    let paymentMethodToPersist = user.stripePaymentMethodId ?? null;


    if (paymentMethodId) {
      try {
        await stripeService.attachPaymentMethodToCustomer({
          customerId,
          paymentMethodId,
          makeDefault: true,
        });
        paymentMethodToPersist = paymentMethodId;
      } catch (attachError) {
        console.error(`Failed to attach payment method for user ${userId}:`, attachError);
        return res.status(400).json({ error: 'Unable to attach payment method' });
      }
    }

    let subscription: Stripe.Subscription;

    if (user.stripeSubscriptionId) {
      if (targetPlan !== user.subscriptionPlan) {
        subscription = await stripeService.updateSubscription({
          subscriptionId: user.stripeSubscriptionId,
          plan: targetPlan,
        });
      } else {
        subscription = await stripeService.retrieveSubscription(user.stripeSubscriptionId);
      }
    } else {
      subscription = await stripeService.createSubscription({
        userId,
        customerId,
        plan: targetPlan,
      });
    }

    const defaultPaymentMethodId =
      typeof subscription.default_payment_method === 'string'
        ? subscription.default_payment_method
        : subscription.default_payment_method?.id ?? null;

    if (!paymentMethodToPersist && defaultPaymentMethodId) {
      paymentMethodToPersist = defaultPaymentMethodId;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        subscriptionPlan: targetPlan,
        subscriptionStatus: subscription.status,
        subscriptionCurrentPeriodEnd: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : null,
        stripePaymentMethodId: paymentMethodToPersist,
      },
    });

    if (previousPlan !== targetPlan) {
      try {
        await resetUsageForCurrentPeriod(userId);
      } catch (usageError) {
        console.error(`Failed to reset usage after plan change for user ${userId}:`, usageError);
      }
    }

    let paymentMethodSummary = null;

    if (stripeService.isEnabled() && paymentMethodToPersist) {
      try {
        const paymentMethod = await stripeService.retrievePaymentMethod(paymentMethodToPersist);
        paymentMethodSummary = mapPaymentMethodSummary(paymentMethod);
      } catch (paymentMethodError) {
        console.warn(`Failed to fetch payment method for user ${userId}:`, paymentMethodError);
      }
    }

    if (previousPlan === SubscriptionPlan.FREE && targetPlan !== SubscriptionPlan.FREE) {
      const firstName = (user.firstname || user.lastname || '').trim().split(/\s+/)[0] || '';
      scheduleUpgradePlanReminder({
        userId,
        email: user.email,
        userName: firstName,
        companyName: user.publicMetaData as any,
        planName: targetPlan,
      })
        .then(() => console.log(`Scheduled upgrade plan email for user ${userId}`))
        .catch((err) => console.error(`Failed to schedule upgrade plan email for user ${userId}:`, err));
    }

    return res.json({
      subscription: buildSubscriptionResponse(updatedUser),
      paymentMethod: paymentMethodSummary,
    });
  } catch (error) {
    console.error(`Error updating subscription for user ${userId}:`, error);
    return res.status(500).json({ error: 'Unable to update subscription' });
  }
});

router.post('/user/:userId/subscription/intent', async (req, res) => {
  const { userId } = req.params;

  if (!stripeService.isEnabled()) {
    return res.status(503).json({ error: 'Stripe is not configured' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const customerId = await stripeService.ensureCustomer({
      userId,
      email: user.email,
      name: [user.firstname, user.lastname].filter(Boolean).join(' ') || null,
      existingCustomerId: user.stripeCustomerId,
    });

    if (!user.stripeCustomerId || user.stripeCustomerId !== customerId) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          stripeCustomerId: customerId,
        },
      });
    }

    const intent = await stripeService.createSetupIntent({
      customerId,
    });

    return res.json({
      clientSecret: intent.client_secret,
      stripeCustomerId: customerId,
    });
  } catch (error) {
    console.error(`Error creating setup intent for user ${userId}:`, error);
    return res.status(500).json({ error: 'Unable to prepare payment method' });
  }
});

export default router;
