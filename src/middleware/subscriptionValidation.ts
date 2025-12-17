import { PrismaClient } from '@prisma/client';
import { SUBSCRIPTION_PLANS, getPlanLimits } from '../config/subscriptionPlans.js';

const prisma = new PrismaClient();

export interface SubscriptionValidationResult {
  allowed: boolean;
  reason?: string;
  currentUsage: {
    aiDraftsUsed: number;
    emailsSent: number;
    investorsAdded: number;
    monthlyEmailsSent?: number;
    monthlyInvestorsAdded?: number;
    followUpEmailsPerMonth?: number;
  };
  limits: {
    aiDraftsPerDay: number;
    emailsPerDay?: number;
    investorsPerDay?: number;
    emailsPerMonth?: number;
    investorsPerMonth?: number;
  };
}

export async function validateSubscriptionUsage(
  userId: string,
  action: 'ai_draft' | 'send_email' | 'add_investor' | 'download_csv' | 'follow_up_email'
): Promise<SubscriptionValidationResult> {
  try {
    // Get user subscription plan
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionPlan: true, subscriptionCurrentPeriodEnd: true }
    });

    if (!user) {
      return {
        allowed: false,
        reason: 'User not found',
        currentUsage: { aiDraftsUsed: 0, emailsSent: 0, investorsAdded: 0 },
        limits: { aiDraftsPerDay: 0 }
      };
    }

    const planName = user.subscriptionPlan;
    const planLimits = getPlanLimits(planName);
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

    // Get monthly usage (for premium/exclusive plans)
    const monthlyUsage = await prisma.usageTracking.findFirst({
      where: {
        userId,
        month: currentMonth,
        year: currentYear
      }
    });

    const currentUsage = {
      aiDraftsUsed: todayUsage?.aiDraftsUsed || 0,
      emailsSent: todayUsage?.emailsSent || 0,
      investorsAdded: todayUsage?.investorsAdded || 0,
      monthlyEmailsSent: monthlyUsage?.monthlyEmailsSent || 0,
      monthlyInvestorsAdded: monthlyUsage?.monthlyInvestorsAdded || 0,
      monthlyFollowUpEmailsSent: monthlyUsage?.monthlyFollowUpEmailsSent || 0,
    };

    // Check limits based on action
    let allowed = true;
    let reason = '';
    const trialExpired =
      user.subscriptionPlan === 'FREE' &&
      user.subscriptionCurrentPeriodEnd &&
      user.subscriptionCurrentPeriodEnd <= new Date();

    if(trialExpired){
      allowed = false;
      reason = `New users on the Free plan can only use the service for 3 days. Please upgrade to continue using the service.`;
    } else if (action === 'ai_draft') {
        if (currentUsage.aiDraftsUsed >= planLimits.aiDraftsPerDay) {
          allowed = false;
          reason = `Daily AI draft limit reached (${planLimits.aiDraftsPerDay}/day)`;
        }
    } else if (action === 'send_email') {
        if (planName === 'FREE') {
          if (currentUsage.emailsSent >= (planLimits.emailsPerDay || 0)) {
            allowed = false;
            reason = `Daily email limit reached (${planLimits.emailsPerDay}/day)`;
          }
        } else {
          if (currentUsage.monthlyEmailsSent >= (planLimits.emailsPerMonth || 0)) {
            allowed = false;
            reason = `Monthly email limit reached (${planLimits.emailsPerMonth}/month)`;
          }
        }
    } else if (action === 'add_investor') {
        if (planName === 'FREE') {
          if (currentUsage.investorsAdded >= (planLimits.investorsPerDay || 0)) {
            allowed = false;
            reason = `Daily investor limit reached (${planLimits.investorsPerDay}/day)`;
          }
        } else {
          if (currentUsage.monthlyInvestorsAdded >= (planLimits.investorsPerMonth || 0)) {
            allowed = false;
            reason = `Monthly investor limit reached (${planLimits.investorsPerMonth}/month)`;
          }
        }
    } else if (action === 'download_csv') {
      const plan = SUBSCRIPTION_PLANS[planName];
      console.log('Download CSV:', planName, plan.features.canDownloadCSV);
      if (!plan.features.canDownloadCSV) {
        allowed = false;
        reason = 'Your plan does not allow CSV downloads.';
      }
    } else if (action === 'follow_up_email') {
      console.log('Follow-up Email:, plan name, monthlyFollowUpEmailsSent, followUpEmailsPerMonth', planName, currentUsage.monthlyFollowUpEmailsSent, planLimits.followUpEmailsPerMonth);
      if (planName === 'STARTER' && (currentUsage.monthlyFollowUpEmailsSent >= (planLimits.followUpEmailsPerMonth || 0))) {
        allowed = false;
        reason = 'Follow-up emails are not available on your current plan.';
      }
    }

    return {
      allowed,
      reason,
      currentUsage,
      limits: planLimits
    };
  } catch (error) {
    console.error('Error validating subscription usage:', error);
    return {
      allowed: false,
      reason: 'Validation error',
      currentUsage: { aiDraftsUsed: 0, emailsSent: 0, investorsAdded: 0 },
      limits: { aiDraftsPerDay: 0 }
    };
  }
}

export async function trackUsage(
  userId: string,
  action: 'ai_draft' | 'send_email' | 'add_investor' | 'download_csv' | 'follow_up_email'
): Promise<void> {
  try {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    const dateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Get or create today's usage record
    const existingUsage = await prisma.usageTracking.findUnique({
      where: {
        userId_date: {
          userId,
          date: dateOnly
        }
      }
    });

    if (existingUsage) {
      // Update existing record
      await prisma.usageTracking.update({
        where: { id: existingUsage.id },
        data: {
          aiDraftsUsed: action === 'ai_draft' ? existingUsage.aiDraftsUsed + 1 : existingUsage.aiDraftsUsed,
          emailsSent: action === 'send_email' ? existingUsage.emailsSent + 1 : existingUsage.emailsSent,
          investorsAdded: action === 'add_investor' ? existingUsage.investorsAdded + 1 : existingUsage.investorsAdded,
          monthlyEmailsSent: action === 'send_email' ? existingUsage.monthlyEmailsSent + 1 : existingUsage.monthlyEmailsSent,
          monthlyInvestorsAdded: action === 'add_investor' ? existingUsage.monthlyInvestorsAdded + 1 : existingUsage.monthlyInvestorsAdded,
          monthlyFollowUpEmailsSent: action === 'follow_up_email' ? existingUsage.monthlyFollowUpEmailsSent + 1 : existingUsage.monthlyFollowUpEmailsSent,
        }
      });
      console.log(`Tracked usage for user ${userId}: action=${action} and updated existing record.${existingUsage.id}`);
    } else {
      // Create new record
      const newUsage = await prisma.usageTracking.create({
        data: {
          userId,
          date: dateOnly,
          month: currentMonth,
          year: currentYear,
          aiDraftsUsed: action === 'ai_draft' ? 1 : 0,
          emailsSent: action === 'send_email' ? 1 : 0,
          investorsAdded: action === 'add_investor' ? 1 : 0,
          monthlyEmailsSent: action === 'send_email' ? 1 : 0,
          monthlyInvestorsAdded: action === 'add_investor' ? 1 : 0,
          monthlyFollowUpEmailsSent: action === 'follow_up_email' ? 1 : 0,
        }
      });
      console.log(`Tracked usage for user ${userId}: action=${action} and updated existing record.${newUsage.id}`);
    }
  } catch (error) {
    console.error('Error tracking usage:', error);
  }
}

export async function getSubscriptionInfo(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionPlan: true,
        subscriptionStatus: true,
        subscriptionCurrentPeriodEnd: true
      }
    });

    if (!user) return null;

    const planName = user.subscriptionPlan || 'FREE';
    const plan = SUBSCRIPTION_PLANS[planName];

    return {
      plan: planName,
      planName: plan.name,
      price: plan.price,
      limits: plan.limits,
      features: plan.features,
      status: user.subscriptionStatus,
      currentPeriodEnd: user.subscriptionCurrentPeriodEnd
    };
  } catch (error) {
    console.error('Error getting subscription info:', error);
    return null;
  }
}
