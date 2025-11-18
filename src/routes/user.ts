// routes/user.ts
import { Router } from 'express';
import { PrismaClient, SubscriptionPlan, User } from '@prisma/client';
import multer from 'multer';
import type Stripe from 'stripe';
import { stripeService } from '../services/stripeService.js';
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

    let paymentMethodSummary = null;

    if (stripeService.isEnabled() && paymentMethodToPersist) {
      try {
        const paymentMethod = await stripeService.retrievePaymentMethod(paymentMethodToPersist);
        paymentMethodSummary = mapPaymentMethodSummary(paymentMethod);
      } catch (paymentMethodError) {
        console.warn(`Failed to fetch payment method for user ${userId}:`, paymentMethodError);
      }
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
