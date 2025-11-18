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
  };
  features: {
    showFullContactInfo: boolean;
    advancedFilters: boolean;
    prioritySupport: boolean;
    customIntegrations: boolean;
  };
}

export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlan> = {
  FREE: {
    name: 'Free Trial',
    price: 0,
    limits: {
      investorsPerDay: 5,
      emailsPerDay: 1,
      aiDraftsPerDay: 1,
      investorsPerMonth: 0, // Not applicable for daily limits
      emailsPerMonth: 0, // Not applicable for daily limits
    },
    features: {
      showFullContactInfo: false,
      advancedFilters: false,
      prioritySupport: false,
      customIntegrations: false,
    },
  },
  PREMIUM: {
    name: 'Premium',
    price: 99,
    limits: {
      investorsPerMonth: 150,
      emailsPerMonth: 150,
      aiDraftsPerDay: 5,
    },
    features: {
      showFullContactInfo: true,
      advancedFilters: true,
      prioritySupport: true,
      customIntegrations: false,
    },
  },
  EXCLUSIVE: {
    name: 'Exclusive',
    price: 249,
    limits: {
      investorsPerMonth: 750,
      emailsPerMonth: 750,
      aiDraftsPerDay: 25,
    },
    features: {
      showFullContactInfo: true,
      advancedFilters: true,
      prioritySupport: true,
      customIntegrations: true,
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
