// Subscription plan configuration
export interface SubscriptionPlan {
  name: string;
  price: number;
  limits: {
    investorsPerMonth: number;
    emailsPerMonth: number;
    aiDraftsPerDay: number;
    investorsPerDay?: number; // For free trial
    emailsPerDay?: number; // For free trial
    followUpEmailsPerMonth?: number; // For starter plan
  };
  features: {
    showFullContactInfo: boolean;
    advancedFilters: boolean;
    prioritySupport: boolean;
    customIntegrations: boolean;
    canDownloadCSV: boolean;
  };
}

export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlan> = {
  FREE: {
    name: 'Free Trial',
    price: 0,
    limits: {
      investorsPerDay: 25,
      emailsPerDay: 3,
      aiDraftsPerDay: 3,
      investorsPerMonth: 25, // Not applicable for daily limits
      emailsPerMonth: 0, // Not applicable for daily limits
    },
    features: {
      showFullContactInfo: false,
      advancedFilters: false,
      prioritySupport: false,
      customIntegrations: false,
      canDownloadCSV: false,
    },
  },
  STARTER: {
    name: 'Starter',
    price: 66,
    limits: {
      investorsPerMonth: 125,
      emailsPerMonth: 125,
      followUpEmailsPerMonth: 5,
      aiDraftsPerDay: 5,
    },
    features: {
      showFullContactInfo: true,
      advancedFilters: true,
      prioritySupport: true,
      customIntegrations: false,
      canDownloadCSV: true,
    },
  },
  PRO: {
    name: 'Pro',
    price: 99,
    limits: {
      investorsPerMonth: 500,
      emailsPerMonth: 500,
      aiDraftsPerDay: 5,
      followUpEmailsPerMonth: 500,
    },
    features: {
      showFullContactInfo: true,
      advancedFilters: true,
      prioritySupport: true,
      customIntegrations: false,
      canDownloadCSV: true,
    },
  },
  SCALE: {
    name: 'Scale',
    price: 179,
    limits: {
      investorsPerMonth: 1000,
      emailsPerMonth: 1000,
      aiDraftsPerDay: 25,
      followUpEmailsPerMonth: 1000,
    },
    features: {
      showFullContactInfo: true,
      advancedFilters: true,
      prioritySupport: true,
      customIntegrations: true,
      canDownloadCSV: true,
    },
  },
};

export const DEFAULT_PLAN = 'FREE';

// Helper function to get plan limits
export function getPlanLimits(planName: string): SubscriptionPlan['limits'] {
  const plan = SUBSCRIPTION_PLANS[planName.toUpperCase()];
  return plan?.limits || SUBSCRIPTION_PLANS[DEFAULT_PLAN].limits;
}

// Helper function to check if plan has feature
export function hasFeature(planName: string, feature: keyof SubscriptionPlan['features']): boolean {
  const plan = SUBSCRIPTION_PLANS[planName.toUpperCase()];
  return plan?.features[feature] || false;
}
