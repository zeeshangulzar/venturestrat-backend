import sgMail from '@sendgrid/mail';
import buildWelcomeEmail, { WelcomeEmailParams } from './WelcomeEmail.js';
import buildCompleteOnboardingEmail, { CompleteOnboardingParams } from './CompleteOnboarding.js';
import buildShortlistReminderEmail, { ShortlistReminderParams } from './ShortlistReminder.js';
import buildOnboardingReminderEmail, { OnboardingReminderParams } from './OnboardingReminder.js';
import buildGmailReminderEmail, { GmailReminderParams } from './GmailReminder.js';
import buildFirstEmailReminderEmail, { FirstEmailReminderParams } from './FirstEmailReminder.js';
import buildTrialReminderEmail, { TrialReminderParams } from './TrialReminder.js';
import buildTrialEndingReminderEmail, { TrialEndingReminderParams } from './TrialEndingReminder.js';
import buildTrialExpiredReminderEmail, { TrialExpiredReminderParams } from './TrialExpiredReminder.js';
import buildReengagementReminderEmail, { ReengagementReminderParams } from './ReengagementReminder.js';
import buildUpgradePlanReminderEmail, { UpgradePlanReminderParams } from './UpgradePlanReminder.js';

const sendgridApiKey = process.env.SENDGRID_API_KEY;
const defaultFromAddress = process.env.SENDGRID_FROM_ADDRESS || 'support@venturestrat.ai';

if (!sendgridApiKey) {
  console.warn('SENDGRID_API_KEY is not set; transactional emails will be skipped.');
} else {
  sgMail.setApiKey(sendgridApiKey);
}

const sanitizeHeaderValue = (value: string): string => value.replace(/[^\x20-\x7E]/g, '').trim();

const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  preheader: string,
  templateKey: string
) => {
  if (!sendgridApiKey) return;
  const safePreheader = sanitizeHeaderValue(preheader) || 'Notification';

  await sgMail.send({
    to,
    from: { name: 'VentureStrat', email: defaultFromAddress },
    subject,
    html,
    headers: {
      'X-Entity-Ref-ID': safePreheader,
    },
    customArgs: {
      template: templateKey,
      banner: preheader,
    },
  });
};

export const sendWelcomeEmail = async (email: string, params: WelcomeEmailParams) => {
  const { subject, html, preheader } = buildWelcomeEmail(params);
  await sendEmail(email, subject, html, preheader, 'welcome');
};

export const sendCompleteOnboardingEmail = async (email: string, params: CompleteOnboardingParams) => {
  const { subject, html, preheader } = buildCompleteOnboardingEmail(params);
  await sendEmail(email, subject, html, preheader, 'complete_onboarding');
};

export const sendShortlistReminderEmail = async (email: string, params: ShortlistReminderParams) => {
  // Disbale for now enable when we complete it.
  // const { subject, html, preheader } = buildShortlistReminderEmail(params);
  // await sendEmail(email, subject, html, preheader, 'shortlist_investor_reminder');
};

export const sendOnboardingReminderEmail = async (email: string, params: OnboardingReminderParams) => {
  const { subject, html, preheader } = buildOnboardingReminderEmail(params);
  await sendEmail(email, subject, html, preheader, 'onboarding_reminder');
};

export const sendGmailReminderEmail = async (email: string, params: GmailReminderParams) => {
  const { subject, html, preheader } = buildGmailReminderEmail(params);
  await sendEmail(email, subject, html, preheader, 'gmail_integration_reminder');
};

export const sendFirstEmailReminderEmail = async (email: string, params: FirstEmailReminderParams) => {
  const { subject, html, preheader } = buildFirstEmailReminderEmail(params);
  await sendEmail(email, subject, html, preheader, 'first_email_reminder');
};

export const sendTrialReminderEmail = async (email: string, params: TrialReminderParams) => {
  const { subject, html, preheader } = buildTrialReminderEmail(params);
  await sendEmail(email, subject, html, preheader, 'trial_expiring_reminder');
};

export const sendTrialEndingReminderEmail = async (email: string, params: TrialEndingReminderParams) => {
  const { subject, html, preheader } = buildTrialEndingReminderEmail(params);
  await sendEmail(email, subject, html, preheader, 'trial_end_reminder');
};

export const sendTrialExpiredReminderEmail = async (email: string, params: TrialExpiredReminderParams) => {
  const { subject, html, preheader } = buildTrialExpiredReminderEmail(params);
  await sendEmail(email, subject, html, preheader, 'trial_expired_reminder');
};

export const sendReengagementReminderEmail = async (email: string, params: ReengagementReminderParams) => {
  const { subject, html, preheader } = buildReengagementReminderEmail(params);
  await sendEmail(email, subject, html, preheader, 'reengagement_reminder');
};

export const sendUpgradePlanReminderEmail = async (email: string, params: UpgradePlanReminderParams) => {
  // We will enable this when we have the content ready.
  // const { subject, html, preheader } = buildUpgradePlanReminderEmail(params);
  // await sendEmail(email, subject, html, preheader, 'upgrade_plan_reminder');
};

export {
  buildWelcomeEmail,
  buildCompleteOnboardingEmail,
  buildShortlistReminderEmail,
  buildOnboardingReminderEmail,
  buildGmailReminderEmail,
  buildFirstEmailReminderEmail,
  buildTrialReminderEmail,
  buildTrialEndingReminderEmail,
  buildTrialExpiredReminderEmail,
  buildReengagementReminderEmail,
  buildUpgradePlanReminderEmail,
};
