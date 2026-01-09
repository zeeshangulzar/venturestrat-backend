// src/routes/shortlist.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { validateSubscriptionUsage, trackUsage } from '../middleware/subscriptionValidation.js';
import { scheduleGmailReminder, scheduleFirstEmailReminder } from '../services/userLifecycle.js';
import { getPlanLimits } from '../config/subscriptionPlans.js';

const router = Router();
const prisma = new PrismaClient();

const hasValidGoogleToken = async (userId: string): Promise<boolean> => {
  const providers = ['google', 'oauth_google'];
  for (const provider of providers) {
    try {
      const googleTokens = await clerkClient.users.getUserOauthAccessToken(userId, provider as any);
      const tokenData = googleTokens?.data?.[0];
      if (!tokenData?.token) continue;
      const expiresAt = (tokenData as any)?.expires_at ?? (tokenData as any)?.expiresAt ?? null;
      const expiryMs = expiresAt ? (expiresAt > 1e12 ? expiresAt : expiresAt * 1000) : null;
      if (expiryMs && Date.now() >= expiryMs) continue;
      return true;
    } catch (err) {
      continue;
    }
  }
  return false;
};

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

    const existingCount = await prisma.shortlist.count({ where: { userId: user.id } });

    // Validate subscription for adding investor to CRM
    const validation = await validateSubscriptionUsage(userId, 'add_investor');
    if (!validation.allowed) {
      return res.status(403).json({ 
        error: 'Subscription limit reached',
        reason: validation.reason,
        currentUsage: validation.currentUsage,
        limits: validation.limits
      });
    }

    const shortlist = await prisma.shortlist.create({
      data: {
        userId: user.id,
        investorId,
      },
    });

    // Track usage after successful addition
    await trackUsage(userId, 'add_investor');

    const firstName = (user.firstname || user.lastname || '').trim().split(/\s+/)[0] || '';

    // If this is the first shortlist and no Google token, schedule Gmail reminder
    if (existingCount === 0) {
      try {
        const hasToken = await hasValidGoogleToken(userId);
        if (!hasToken) {
          await scheduleGmailReminder({
            userId,
            email: user.email,
            userName: firstName,
            companyName: user.publicMetaData as any,
          });
          console.log(`Scheduled Gmail reminder for user ${userId} after first shortlist`);
        } else {
          const messageCount = await prisma.message.count({ where: { userId: user.id } });
          if (messageCount === 0) {
            await scheduleFirstEmailReminder({
              userId,
              email: user.email,
              userName: firstName,
              companyName: user.publicMetaData as any,
            });
            console.log(`Scheduled first email reminder for user ${userId} after first shortlist`);
          }
        }
      } catch (schedErr) {
        console.error(`Failed to schedule Gmail reminder for user ${userId}:`, schedErr);
      }
    }

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

// GET /shortlists/:userId/latest - Latest shortlisted investors capped by plan limit (for CSV export)
router.get('/shortlists/:userId/latest', async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionPlan: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const planLimits = getPlanLimits(user.subscriptionPlan || 'FREE');
    const limit =
      (typeof planLimits.investorsPerMonth === 'number' && planLimits.investorsPerMonth > 0
        ? planLimits.investorsPerMonth
        : undefined) ??
      (typeof planLimits.investorsPerDay === 'number' && planLimits.investorsPerDay > 0
        ? planLimits.investorsPerDay
        : undefined);
    console.log(`Applying limit of ${limit} for user ${userId} based on plan ${user.subscriptionPlan}`);

    const shortlists = await prisma.shortlist.findMany({
      where: { userId },
      include: {
        investor: {
          include: {
            emails: true,
          },
        },
      },
      orderBy: {
        // Use shortlist creation order proxy (newest first) so the latest entries are exported
        id: 'desc',
      },
      take: limit,
    });

    const investors = shortlists.map((shortlist) => ({
      ...shortlist.investor,
      status: shortlist.status,
      shortlistId: shortlist.id,
    }));

    res.json({
      investors,
      limitApplied: limit ?? null,
      totalReturned: investors.length,
    });
  } catch (error) {
    console.error('Error fetching latest shortlisted investors:', error);
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
