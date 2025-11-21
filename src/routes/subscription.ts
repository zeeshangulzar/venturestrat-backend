import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { validateSubscriptionUsage, trackUsage, getSubscriptionInfo } from '../middleware/subscriptionValidation.js';

const router = Router();
const prisma = new PrismaClient();

// Get subscription info for a user
router.get('/subscription/info/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const subscriptionInfo = await getSubscriptionInfo(userId);
    
    if (!subscriptionInfo) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(subscriptionInfo);
  } catch (error) {
    console.error('Error fetching subscription info:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Check if user can perform an action
router.post('/subscription/validate', async (req, res) => {
  try {
    const { userId, action } = req.body;
    
    if (!userId || !action) {
      return res.status(400).json({ error: 'Missing userId or action' });
    }

    const validation = await validateSubscriptionUsage(userId, action);
    res.json(validation);
  } catch (error) {
    console.error('Error validating subscription:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Track usage after successful action
router.post('/subscription/track', async (req, res) => {
  try {
    const { userId, action } = req.body;
    
    if (!userId || !action) {
      return res.status(400).json({ error: 'Missing userId or action' });
    }

    await trackUsage(userId, action);
    res.json({ success: true });
  } catch (error) {
    console.error('Error tracking usage:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get usage statistics for a user
router.get('/subscription/usage/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    // Get today's usage
    const todayUsage = await prisma.usageTracking.findUnique({
      where: {
        userId_date: {
          userId,
          date: new Date(today.getFullYear(), today.getMonth(), today.getDate())
        }
      }
    });

    // Get monthly usage
    const monthlyUsage = await prisma.usageTracking.findFirst({
      where: {
        userId,
        month: currentMonth,
        year: currentYear
      }
    });

    // Get subscription info
    const subscriptionInfo = await getSubscriptionInfo(userId);

    res.json({
      today: {
        aiDraftsUsed: todayUsage?.aiDraftsUsed || 0,
        emailsSent: todayUsage?.emailsSent || 0,
        investorsAdded: todayUsage?.investorsAdded || 0
      },
      monthly: {
        emailsSent: monthlyUsage?.monthlyEmailsSent || 0,
        investorsAdded: monthlyUsage?.monthlyInvestorsAdded || 0,
        monthlyFollowUpEmailsSent: monthlyUsage?.monthlyFollowUpEmailsSent || 0
      },
      subscription: subscriptionInfo
    });
  } catch (error) {
    console.error('Error fetching usage stats:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
