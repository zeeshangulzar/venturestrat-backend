import { sendWelcomeEmail, sendShortlistReminderEmail } from '../templates/index.js';
import { emailQueue } from '../services/emailQueue.js';
import { Job } from 'bullmq';
import { sendOnboardingReminderEmail } from '../templates/index.js';
import { sendGmailReminderEmail } from '../templates/index.js';
import { sendFirstEmailReminderEmail } from '../templates/index.js';
import { sendTrialReminderEmail } from '../templates/index.js';
import { sendTrialEndingReminderEmail } from '../templates/index.js';
import { sendTrialExpiredReminderEmail } from '../templates/index.js';
import { sendReengagementReminderEmail } from '../templates/index.js';
import { sendUpgradePlanReminderEmail } from '../templates/index.js';

type UserSetupParams = {
  userId: string;
  email: string;
  userName: string;
  companyName?: string | null;
};

const SHORTLIST_REMINDER_JOB_PREFIX = 'shortlist-reminder-';
const REMINDER_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours
const ONBOARDING_REMINDER_JOB_PREFIX = 'onboarding-reminder-';
const ONBOARDING_REMINDER_DELAY_MS = 6 * 60 * 60 * 1000; // 6 hours
const GMAIL_REMINDER_JOB_PREFIX = 'gmail-reminder-';
const GMAIL_REMINDER_DELAY_MS = 60 * 60 * 1000; // 1 hour
const FIRST_EMAIL_REMINDER_JOB_PREFIX = 'first-email-reminder-';
const FIRST_EMAIL_REMINDER_DELAY_MS = 10 * 60 * 1000; // 10 minutes
const TRIAL_REMINDER_JOB_PREFIX = 'trial-reminder-';
const TRIAL_REMINDER_DELAY_MS = 48 * 60 * 60 * 1000; // 48 hours
const TRIAL_ENDING_REMINDER_JOB_PREFIX = 'trial-ending-reminder-';
const TRIAL_ENDING_REMINDER_DELAY_MS = 60 * 60 * 60 * 1000; // 60 hours
const TRIAL_EXPIRED_REMINDER_JOB_PREFIX = 'trial-expired-reminder-';
const TRIAL_EXPIRED_REMINDER_DELAY_MS = 96 * 60 * 60 * 1000; // 96 hours
const REENGAGEMENT_REMINDER_JOB_PREFIX = 'reengagement-reminder-';
const REENGAGEMENT_REMINDER_DELAY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const UPGRADE_PLAN_REMINDER_JOB_PREFIX = 'upgrade-plan-reminder-';
const UPGRADE_PLAN_REMINDER_DELAY_MS = 2 * 60 * 1000; // 2 minutes

export const scheduleShortlistReminder = async ({
  userId,
}: UserSetupParams): Promise<Job | null> => {
  const jobId = `${SHORTLIST_REMINDER_JOB_PREFIX}${userId}`;

  // Remove any existing scheduled reminder for this user to avoid duplicates
  try {
    const existing = await emailQueue.getJob(jobId);
    if (existing) {
      await existing.remove();
    }
  } catch {
    // noop
  }

  const delay = REMINDER_DELAY_MS;
  return emailQueue.add(
    'shortlist-reminder',
    { userId },
    {
      delay,
      jobId,
      removeOnComplete: true,
      attempts: 2,
    }
  );
};

export const scheduleOnboardingReminder = async ({ userId }: UserSetupParams): Promise<Job | null> => {
  const jobId = `${ONBOARDING_REMINDER_JOB_PREFIX}${userId}`;

  try {
    const existing = await emailQueue.getJob(jobId);
    if (existing) {
      await existing.remove();
    }
  } catch {
    // noop
  }

  const delay = ONBOARDING_REMINDER_DELAY_MS;
  return emailQueue.add(
    'onboarding-reminder',
    { userId },
    {
      delay,
      jobId,
      removeOnComplete: true,
      attempts: 2,
    }
  );
};

export const scheduleGmailReminder = async ({ userId }: UserSetupParams): Promise<Job | null> => {
  const jobId = `${GMAIL_REMINDER_JOB_PREFIX}${userId}`;

  try {
    const existing = await emailQueue.getJob(jobId);
    if (existing) {
      await existing.remove();
    }
  } catch {
    // noop
  }

  const delay = GMAIL_REMINDER_DELAY_MS;
  return emailQueue.add(
    'gmail-reminder',
    { userId },
    {
      delay,
      jobId,
      removeOnComplete: true,
      attempts: 2,
    }
  );
};

export const scheduleFirstEmailReminder = async ({ userId }: UserSetupParams): Promise<Job | null> => {
  const jobId = `${FIRST_EMAIL_REMINDER_JOB_PREFIX}${userId}`;

  try {
    const existing = await emailQueue.getJob(jobId);
    if (existing) {
      await existing.remove();
    }
  } catch {
    // noop
  }

  const delay = FIRST_EMAIL_REMINDER_DELAY_MS;
  return emailQueue.add(
    'first-email-reminder',
    { userId },
    {
      delay,
      jobId,
      removeOnComplete: true,
      attempts: 2,
    }
  );
};

export const scheduleTrialReminder = async ({ userId }: UserSetupParams): Promise<Job | null> => {
  const jobId = `${TRIAL_REMINDER_JOB_PREFIX}${userId}`;

  try {
    const existing = await emailQueue.getJob(jobId);
    if (existing) {
      await existing.remove();
    }
  } catch {
    // noop
  }

  const delay = TRIAL_REMINDER_DELAY_MS;
  return emailQueue.add(
    'trial-reminder',
    { userId },
    {
      delay,
      jobId,
      removeOnComplete: true,
      attempts: 2,
    }
  );
};

export const scheduleTrialEndingReminder = async ({ userId }: UserSetupParams): Promise<Job | null> => {
  const jobId = `${TRIAL_ENDING_REMINDER_JOB_PREFIX}${userId}`;

  try {
    const existing = await emailQueue.getJob(jobId);
    if (existing) {
      await existing.remove();
    }
  } catch {
    // noop
  }

  const delay = TRIAL_ENDING_REMINDER_DELAY_MS;
  return emailQueue.add(
    'trial-ending-reminder',
    { userId },
    {
      delay,
      jobId,
      removeOnComplete: true,
      attempts: 2,
    }
  );
};

export const scheduleTrialExpiredReminder = async ({ userId }: UserSetupParams): Promise<Job | null> => {
  const jobId = `${TRIAL_EXPIRED_REMINDER_JOB_PREFIX}${userId}`;

  try {
    const existing = await emailQueue.getJob(jobId);
    if (existing) {
      await existing.remove();
    }
  } catch {
    // noop
  }

  const delay = TRIAL_EXPIRED_REMINDER_DELAY_MS;
  return emailQueue.add(
    'trial-expired-reminder',
    { userId },
    {
      delay,
      jobId,
      removeOnComplete: true,
      attempts: 2,
    }
  );
};

export const scheduleReengagementReminder = async ({ userId }: UserSetupParams): Promise<Job | null> => {
  const jobId = `${REENGAGEMENT_REMINDER_JOB_PREFIX}${userId}`;

  try {
    const existing = await emailQueue.getJob(jobId);
    if (existing) {
      await existing.remove();
    }
  } catch {
    // noop
  }

  const delay = REENGAGEMENT_REMINDER_DELAY_MS;
  return emailQueue.add(
    'reengagement-reminder',
    { userId },
    {
      delay,
      jobId,
      removeOnComplete: true,
      attempts: 2,
    }
  );
};

export const scheduleUpgradePlanReminder = async ({
  userId,
  planName,
  email,
  userName,
  companyName,
}: UserSetupParams & { planName: string }): Promise<Job | null> => {
  const jobId = `${UPGRADE_PLAN_REMINDER_JOB_PREFIX}${userId}`;

  try {
    const existing = await emailQueue.getJob(jobId);
    if (existing) {
      await existing.remove();
    }
  } catch {
    // noop
  }

  const delay = UPGRADE_PLAN_REMINDER_DELAY_MS;
  return emailQueue.add(
    'upgrade-plan-reminder',
    { userId, planName, email, userName, companyName },
    {
      delay,
      jobId,
      removeOnComplete: true,
      attempts: 2,
    }
  );
};
export const setupUserLifecycle = async ({
  userId,
  email,
  userName,
  companyName,
}: UserSetupParams) => {
  // Fire the welcome email immediately
  try {
    await sendWelcomeEmail(email, { userName });
    console.log(`Welcome email sent to ${email}`);
  } catch (error) {
    console.error(`Failed to send welcome email to ${email}:`, error);
  }

  // Schedule onboarding reminder in 6 hours
  try {
    await scheduleOnboardingReminder({ userId, email, userName, companyName });
    console.log(`Onboarding reminder scheduled for user ${userId}`);
  } catch (error) {
    console.error(`Failed to schedule onboarding reminder for ${userId}:`, error);
  }

  // Schedule shortlist reminder in 24 hours
  try {
    await scheduleShortlistReminder({ userId, email, userName, companyName });
    console.log(`Shortlist reminder scheduled for user ${userId}`);
  } catch (error) {
    console.error(`Failed to schedule shortlist reminder for ${userId}:`, error);
  }

  // Schedule trial reminder in 48 hours
  try {
    await scheduleTrialReminder({ userId, email, userName, companyName });
    console.log(`Trial reminder scheduled for user ${userId}`);
  } catch (error) {
    console.error(`Failed to schedule trial reminder for ${userId}:`, error);
  }

  // Schedule trial ending reminder in 60 hours
  try {
    await scheduleTrialEndingReminder({ userId, email, userName, companyName });
    console.log(`Trial ending reminder scheduled for user ${userId}`);
  } catch (error) {
    console.error(`Failed to schedule trial ending reminder for ${userId}:`, error);
  }

  // Schedule trial expired reminder in 96 hours
  try {
    await scheduleTrialExpiredReminder({ userId, email, userName, companyName });
    console.log(`Trial expired reminder scheduled for user ${userId}`);
  } catch (error) {
    console.error(`Failed to schedule trial expired reminder for ${userId}:`, error);
  }

  // Schedule reengagement reminder in 7 days
  try {
    await scheduleReengagementReminder({ userId, email, userName, companyName });
    console.log(`Reengagement reminder scheduled for user ${userId}`);
  } catch (error) {
    console.error(`Failed to schedule reengagement reminder for ${userId}:`, error);
  }
};
