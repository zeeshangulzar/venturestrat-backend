import Stripe from 'stripe';

type PlanKey = 'FREE' | 'STARTER' | 'PRO' | 'SCALE';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

const stripeClient = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2024-06-20',
    })
  : null;

const planPriceMap: Record<PlanKey, string | undefined> = {
  FREE: process.env.STRIPE_FREE_PRICE_ID,
  STARTER: process.env.STRIPE_STARTER_PRICE_ID,
  PRO: process.env.STRIPE_PRO_PRICE_ID,
  SCALE: process.env.STRIPE_SCALE_PRICE_ID,
};

const assertStripeClient = (): Stripe => {
  if (!stripeClient) {
    throw new Error('Stripe client is not configured. Please set STRIPE_SECRET_KEY.');
  }

  return stripeClient;
};

const getPriceIdForPlan = (plan: PlanKey): string => {
  const priceId = planPriceMap[plan];
  if (!priceId) {
    throw new Error(`Missing Stripe price ID for plan ${plan}. Please set STRIPE_${plan}_PRICE_ID.`);
  }
  return priceId;
};

export const stripeService = {
  isEnabled: (): boolean => Boolean(stripeClient),

  getPriceId: (plan: PlanKey): string => getPriceIdForPlan(plan),

  async ensureCustomer(params: {
    userId: string;
    email: string;
    name?: string | null;
    existingCustomerId?: string | null;
  }): Promise<string> {
    const stripe = assertStripeClient();

    if (params.existingCustomerId) {
      return params.existingCustomerId;
    }

    const customer = await stripe.customers.create({
      email: params.email,
      name: params.name ?? undefined,
      metadata: {
        userId: params.userId,
      },
    });

    return customer.id;
  },

  async createSubscription(params: {
    userId: string;
    customerId: string;
    plan: PlanKey;
  }): Promise<Stripe.Subscription> {
    const stripe = assertStripeClient();
    const priceId = getPriceIdForPlan(params.plan);

    return stripe.subscriptions.create({
      customer: params.customerId,
      items: [
        {
          price: priceId,
        },
      ],
      metadata: {
        userId: params.userId,
        plan: params.plan,
      }
    });
  },

  async updateSubscription(params: {
    subscriptionId: string;
    plan: PlanKey;
  }): Promise<Stripe.Subscription> {
    const stripe = assertStripeClient();
    const priceId = getPriceIdForPlan(params.plan);

    const subscription = await stripe.subscriptions.retrieve(params.subscriptionId);
    const subscriptionItem = subscription.items.data[0];

    if (!subscriptionItem) {
      throw new Error('Subscription has no items to update');
    }

    return stripe.subscriptions.update(params.subscriptionId, {
      cancel_at_period_end: false,
      proration_behavior: 'create_prorations',
      items: [
        {
          id: subscriptionItem.id,
          price: priceId,
        },
      ],
      metadata: {
        ...(subscription.metadata || {}),
        plan: params.plan,
      }
    });
  },

  async retrieveSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    const stripe = assertStripeClient();
    return stripe.subscriptions.retrieve(subscriptionId);
  },

  async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    const stripe = assertStripeClient();
    return stripe.subscriptions.cancel(subscriptionId);
  },

  async createSetupIntent(params: {
    customerId: string;
  }): Promise<Stripe.SetupIntent> {
    const stripe = assertStripeClient();
    return stripe.setupIntents.create({
      customer: params.customerId,
      payment_method_types: ['card'],
    });
  },

  async attachPaymentMethodToCustomer(params: {
    customerId: string;
    paymentMethodId: string;
    makeDefault?: boolean;
  }): Promise<void> {
    const stripe = assertStripeClient();

    await stripe.paymentMethods.attach(params.paymentMethodId, {
      customer: params.customerId,
    });

    if (params.makeDefault) {
      await stripe.customers.update(params.customerId, {
        invoice_settings: {
          default_payment_method: params.paymentMethodId,
        },
      });
    }
  },

  async retrievePaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    const stripe = assertStripeClient();
    return stripe.paymentMethods.retrieve(paymentMethodId);
  },
};

export type StripePlanKey = PlanKey;
