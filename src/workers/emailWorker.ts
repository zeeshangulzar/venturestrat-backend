import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { google } from 'googleapis';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { cleanEmailBody, sendViaSendgridFallback } from '../routes/message.js';
import { sendShortlistReminderEmail, sendOnboardingReminderEmail, sendGmailReminderEmail, sendFirstEmailReminderEmail, sendTrialReminderEmail, sendTrialEndingReminderEmail, sendTrialExpiredReminderEmail, sendReengagementReminderEmail, sendUpgradePlanReminderEmail } from '../templates/index.js';
import { validateSubscriptionUsage } from '../middleware/subscriptionValidation.js';
import { buildSenderDisplayName } from '../routes/message.js';

const prisma = new PrismaClient();

const previousMessageSelect = {
  id: true,
  threadId: true,
  gmailMessageId: true,
  gmailReferences: true,
} as const;

const MESSAGE_ID_DOMAIN = process.env.EMAIL_MESSAGE_ID_DOMAIN || 'venturestrat.ai';

function generateMessageId(): string {
  const timestampPart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `<${timestampPart}-${randomPart}@${MESSAGE_ID_DOMAIN}>`;
}

function parseReferences(value?: string | null): {
  referencesHeader?: string;
  parentMessageId?: string;
  referenceIds: string[];
} {
  const trimmed = value?.trim();
  if (!trimmed) {
    return { referenceIds: [] };
  }

  const referenceIds = trimmed.split(/\s+/).filter(Boolean);
  if (referenceIds.length === 0) {
    return { referenceIds: [] };
  }

  return {
    referencesHeader: referenceIds.join(' '),
    parentMessageId: referenceIds[referenceIds.length - 1],
    referenceIds,
  };
}

function mergeReferences(...refs: (string | null | undefined)[]): string | null {
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const ref of refs) {
    if (!ref) continue;
    const parts = ref.trim().split(/\s+/).filter(Boolean);
    for (const part of parts) {
      if (!seen.has(part)) {
        seen.add(part);
        ordered.push(part);
      }
    }
  }

  return ordered.length ? ordered.join(' ') : null;
}

async function hasValidGoogleToken(userId: string): Promise<boolean> {
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
}

// Redis connection configuration
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  ...(process.env.REDIS_URL ? { url: process.env.REDIS_URL } : {}),
  maxRetriesPerRequest: null,
};

// Create worker
const emailWorker = new Worker(
  'email-queue',
  async (job: Job) => {
    if (job.name === 'gmail-reminder') {
      const { userId } = job.data as any;
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            email: true,
            firstname: true,
            lastname: true,
            publicMetaData: true,
          },
        });

        if (!user || !user.email) {
          console.warn(`Skipping Gmail reminder for user ${userId} - user/email missing`);
          return;
        }

        const hasToken = await hasValidGoogleToken(userId);
        if (hasToken) {
          console.log(`Skipping Gmail reminder for user ${userId} - Google already connected`);
          return;
        }

        const shortlistCount = await prisma.shortlist.count({ where: { userId } });
        if (shortlistCount < 1) {
          console.log(`Skipping Gmail reminder for user ${userId} - no shortlists found`);
          return;
        }

        const name = [user.firstname, user.lastname].filter(Boolean).join(' ');
        const companyName =
          (user.publicMetaData as any)?.companyName ||
          (user.publicMetaData as any)?.company_name ||
          'your company';

        await sendGmailReminderEmail(user.email, {
          userName: name || 'there',
          companyName,
          shortlistCount,
        });
        console.log(`Gmail reminder sent to ${user.email}`);
      } catch (error) {
        console.error(`Error processing Gmail reminder for user ${userId}:`, error);
        throw error;
      }
      return;
    }

    if (job.name === 'trial-reminder') {
      const { userId } = job.data as any;
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            email: true,
            firstname: true,
            lastname: true,
            publicMetaData: true,
            subscriptionPlan: true,
            onboardingComplete: true,
          },
        });

        if (!user || !user.email) {
          console.warn(`Skipping trial reminder for user ${userId} - user/email missing`);
          return;
        }

        if (!user.onboardingComplete) {
          console.log(`Skipping trial reminder for user ${userId} - onboarding incomplete`);
          return;
        }

        if (user.subscriptionPlan !== 'FREE') {
          console.log(`Skipping trial reminder for user ${userId} - not on free plan`);
          return;
        }

        const shortlistCount = await prisma.shortlist.count({ where: { userId } });
        if (shortlistCount <= 1) {
          console.log(`Skipping trial reminder for user ${userId} - shortlist count <= 1`);
          return;
        }

        const messageCount = await prisma.message.count({ where: { userId } });
        if (messageCount > 0) {
          console.log(`Skipping trial reminder for user ${userId} - messages already sent`);
          return;
        }

        const name = [user.firstname, user.lastname].filter(Boolean).join(' ');
        const companyName =
          (user.publicMetaData as any)?.companyName ||
          (user.publicMetaData as any)?.company_name ||
          'your company';

        await sendTrialReminderEmail(user.email, {
          userName: name || 'there',
          companyName,
          shortlistCount,
        });
        console.log(`Trial reminder sent to ${user.email}`);
      } catch (error) {
        console.error(`Error processing trial reminder for user ${userId}:`, error);
        throw error;
      }
      return;
    }

    if (job.name === 'trial-ending-reminder') {
      const { userId } = job.data as any;
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            email: true,
            firstname: true,
            lastname: true,
            publicMetaData: true,
            subscriptionPlan: true,
          },
        });

        if (!user || !user.email) {
          console.warn(`Skipping trial ending reminder for user ${userId} - user/email missing`);
          return;
        }

        if (user.subscriptionPlan !== 'FREE') {
          console.log(`Skipping trial ending reminder for user ${userId} - not on free plan`);
          return;
        }

        const name = [user.firstname, user.lastname].filter(Boolean).join(' ');
        const companyName =
          (user.publicMetaData as any)?.companyName ||
          (user.publicMetaData as any)?.company_name ||
          'your company';

        await sendTrialEndingReminderEmail(user.email, {
          userName: name || 'there',
          companyName,
        });
        console.log(`Trial ending reminder sent to ${user.email}`);
      } catch (error) {
        console.error(`Error processing trial ending reminder for user ${userId}:`, error);
        throw error;
      }
      return;
    }

    if (job.name === 'trial-expired-reminder') {
      const { userId } = job.data as any;
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            email: true,
            firstname: true,
            lastname: true,
            publicMetaData: true,
            subscriptionPlan: true,
          },
        });

        if (!user || !user.email) {
          console.warn(`Skipping trial expired reminder for user ${userId} - user/email missing`);
          return;
        }

        if (user.subscriptionPlan !== 'FREE') {
          console.log(`Skipping trial expired reminder for user ${userId} - not on free plan`);
          return;
        }

        const shortlistCount = await prisma.shortlist.count({ where: { userId } });

        const name = [user.firstname, user.lastname].filter(Boolean).join(' ');
        const companyName =
          (user.publicMetaData as any)?.companyName ||
          (user.publicMetaData as any)?.company_name ||
          'your company';

        await sendTrialExpiredReminderEmail(user.email, {
          userName: name || 'there',
          companyName,
          shortlistCount,
        });
        console.log(`Trial expired reminder sent to ${user.email}`);
      } catch (error) {
        console.error(`Error processing trial expired reminder for user ${userId}:`, error);
        throw error;
      }
      return;
    }

    if (job.name === 'upgrade-plan-reminder') {
      const { userId, planName, email, userName, companyName } = job.data as any;
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            email: true,
            firstname: true,
            lastname: true,
            publicMetaData: true,
            subscriptionPlan: true,
          },
        });

        const targetEmail = email || user?.email;

        if (!user || !targetEmail) {
          console.warn(`Skipping upgrade reminder for user ${userId} - user/email missing`);
          return;
        }

        if (user.subscriptionPlan === 'FREE') {
          console.log(`Skipping upgrade reminder for user ${userId} - user still on free plan`);
          return;
        }

        const name = userName || [user.firstname, user.lastname].filter(Boolean).join(' ');
        const company =
          companyName ||
          (user.publicMetaData as any)?.companyName ||
          (user.publicMetaData as any)?.company_name ||
          'your company';

        await sendUpgradePlanReminderEmail(targetEmail, {
          userName: name || 'there',
          planName: planName || user.subscriptionPlan,
          companyName: company,
        });
        console.log(`Upgrade plan reminder sent to ${user.email}`);
      } catch (error) {
        console.error(`Error processing upgrade reminder for user ${userId}:`, error);
        throw error;
      }
      return;
    }

    if (job.name === 'reengagement-reminder') {
      const { userId } = job.data as any;
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            email: true,
            firstname: true,
            lastname: true,
            onboardingComplete: true,
            publicMetaData: true,
          },
        });

        if (!user || !user.email) {
          console.warn(`Skipping reengagement reminder for user ${userId} - user/email missing`);
          return;
        }

        const clerkUser = await clerkClient.users.getUser(userId);
        const lastSignIn = (clerkUser as any)?.lastSignInAt || (clerkUser as any)?.last_sign_in_at || null;
        const lastActive = (clerkUser as any)?.lastActiveAt || (clerkUser as any)?.last_active_at || null;
        const lastSeenMsRaw = lastActive || lastSignIn;
        const lastSeenMs = typeof lastSeenMsRaw === 'number'
          ? (lastSeenMsRaw > 1e12 ? lastSeenMsRaw : lastSeenMsRaw * 1000)
          : null;

        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const seenRecently = lastSeenMs ? lastSeenMs >= sevenDaysAgo : false;

        // Only send if onboarding incomplete OR not seen in 7 days
        if (user.onboardingComplete && seenRecently) {
          console.log(`Skipping reengagement reminder for user ${userId} - active recently and onboarding complete`);
          return;
        }

        const name = [user.firstname, user.lastname].filter(Boolean).join(' ');
        const companyName =
          (user.publicMetaData as any)?.companyName ||
          (user.publicMetaData as any)?.company_name ||
          'your company';

        await sendReengagementReminderEmail(user.email, {
          userName: name || 'there',
          companyName,
        });
        console.log(`Reengagement reminder sent to ${user.email}`);
      } catch (error) {
        console.error(`Error processing reengagement reminder for user ${userId}:`, error);
        throw error;
      }
      return;
    }

    if (job.name === 'first-email-reminder') {
      const { userId } = job.data as any;
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            email: true,
            firstname: true,
            lastname: true,
            publicMetaData: true,
          },
        });

        if (!user || !user.email) {
          console.warn(`Skipping first email reminder for user ${userId} - user/email missing`);
          return;
        }

        const hasToken = await hasValidGoogleToken(userId);
        if (!hasToken) {
          console.log(`Skipping first email reminder for user ${userId} - no Google connection`);
          return;
        }

        const messageCount = await prisma.message.count({ where: { userId } });
        if (messageCount > 0) {
          console.log(`Skipping first email reminder for user ${userId} - message already exists`);
          return;
        }

        const shortlistCount = await prisma.shortlist.count({ where: { userId } });
        if (shortlistCount < 1) {
          console.log(`Skipping first email reminder for user ${userId} - no shortlist found`);
          return;
        }

        const name = [user.firstname, user.lastname].filter(Boolean).join(' ');
        const companyName =
          (user.publicMetaData as any)?.companyName ||
          (user.publicMetaData as any)?.company_name ||
          'your company';

        await sendFirstEmailReminderEmail(user.email, {
          userName: name || 'there',
          companyName,
          shortlistCount,
        });
        console.log(`First email reminder sent to ${user.email}`);
      } catch (error) {
        console.error(`Error processing first email reminder for user ${userId}:`, error);
        throw error;
      }
      return;
    }

    if (job.name === 'onboarding-reminder') {
      const { userId } = job.data as any;
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            email: true,
            firstname: true,
            lastname: true,
            publicMetaData: true,
            onboardingComplete: true,
          },
        });

        if (!user || !user.email) {
          console.warn(`Skipping onboarding reminder for user ${userId} - user/email missing`);
          return;
        }

        if (user.onboardingComplete) {
          console.log(`Skipping onboarding reminder for user ${userId} - onboarding already complete`);
          return;
        }

        const name = [user.firstname, user.lastname].filter(Boolean).join(' ');
        const companyName =
          (user.publicMetaData as any)?.companyName ||
          (user.publicMetaData as any)?.company_name ||
          'your company';

        await sendOnboardingReminderEmail(user.email, {
          userName: name || 'there',
          companyName,
        });
        console.log(`Onboarding reminder sent to ${user.email}`);
      } catch (error) {
        console.error(`Error processing onboarding reminder for user ${userId}:`, error);
        throw error;
      }
      return;
    }

    if (job.name === 'shortlist-reminder') {
      const { userId } = job.data as any;
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            email: true,
            firstname: true,
            lastname: true,
            publicMetaData: true,
            onboardingComplete: true,
          },
        });

        if (!user || !user.email) {
          console.warn(`Skipping reminder for user ${userId} - user/email missing`);
          return;
        }

        if (!user.onboardingComplete) {
          console.log(`Skipping reminder for user ${userId} - onboarding not complete`);
          return;
        }

        const hasShortlist = await prisma.shortlist.findFirst({
          where: { userId },
        });

        if (hasShortlist) {
          console.log(`Skipping reminder for user ${userId} - shortlist exists`);
          return;
        }

        const name = [user.firstname, user.lastname].filter(Boolean).join(' ');
        const companyName =
          (user.publicMetaData as any)?.companyName ||'your company';

        await sendShortlistReminderEmail(user.email, {
          userName: name || 'there',
          companyName,
        });
        console.log(`Shortlist reminder sent to ${user.email}`);
      } catch (error) {
        console.error(`Error processing shortlist reminder for user ${userId}:`, error);
        throw error;
      }
      return;
    }

    console.log(`Processing scheduled email job ${job.id}`);
    
  const {
    messageId,
    userId,
    investorId,
    to,
    cc,
    subject,
    from,
    body,
    attachments,
    threadId,
    previousMessageId,
  } = job.data;

    try {
      // Get the message to update
      let message = await prisma.message.findUnique({
        where: { id: messageId },
        include: {
          user: true,
          previousMessage: { select: previousMessageSelect },
        },
      });

      if (!message) {
        throw new Error(`Message ${messageId} not found`);
      }

      const validation = await validateSubscriptionUsage(message.userId, 'follow_up_email');
      if (!validation.allowed) { 
        throw {
          error: 'Subscription limit reached',
          reason: validation.reason,
          currentUsage: validation.currentUsage,
          limits: validation.limits
        };
      }
      const previousMessage = message.previousMessage ?? (message.previousMessageId
        ? await prisma.message.findUnique({ where: { id: message.previousMessageId }, select: previousMessageSelect })
        : null);

      // Only use previous message for reply context; do not mutate current message
      const referencesFromPrev = mergeReferences(
        previousMessage?.gmailReferences,
        previousMessage?.gmailMessageId,
      );

      const effectiveThreadId = previousMessage?.threadId || threadId || message.threadId || null;

      const messageContext = {
        ...message,
        threadId: effectiveThreadId,
        gmailReferences: referencesFromPrev ?? null,
      } as typeof message;

      const attachmentLinks = Array.isArray(attachments)
        ? attachments
            .map((att: any) => ({
              filename: att?.filename || att?.name || 'attachment',
              type: att?.type || att?.contentType || 'application/octet-stream',
              size: Number(att?.size) || 0,
              url: att?.url ?? null,
            }))
            .filter((att) => !!att.url)
        : [];

      // Get OAuth tokens
      let googleTokens;
      let microsoftTokens;

      try {
        googleTokens = await clerkClient.users.getUserOauthAccessToken(
          userId,
          'oauth_google'
        );
      } catch (error) {
        console.log('No Google OAuth tokens found, checking Microsoft...');
      }

      if (!googleTokens?.data || googleTokens.data.length === 0) {
        try {
          microsoftTokens = await clerkClient.users.getUserOauthAccessToken(
            userId,
            'oauth_microsoft'
          );
        } catch (error) {
          console.log('No Microsoft OAuth tokens found, will use Nodemailer fallback...');
        }
      }

      let sendResult: { threadId: string | null; messageId: string | null } = {
        threadId: effectiveThreadId,
        messageId: null,
      };

      // Send email using the appropriate service
      if (googleTokens?.data && googleTokens.data.length > 0) {
        sendResult = await sendViaGmail(
          googleTokens.data[0].token,
          messageContext,
          attachmentLinks,
          effectiveThreadId,
          referencesFromPrev
        );
      } else if (microsoftTokens?.data && microsoftTokens.data.length > 0) {
        sendResult = await sendViaMicrosoftGraph(
          microsoftTokens.data[0].token,
          messageContext,
          attachmentLinks,
          effectiveThreadId,
          referencesFromPrev
        );
      } else {
        const mergedReferences = mergeReferences(
          referencesFromPrev,
          messageContext.gmailReferences,
        );

        const fallbackMessage = {
          ...messageContext,
          gmailReferences: mergedReferences ?? messageContext.gmailReferences,
        };

        sendResult = await sendViaSendgridFallback(
          fallbackMessage,
          attachmentLinks,
          mergedReferences ?? undefined,
        );
      }

      // Update message status only (do not persist threading metadata)
      await prisma.message.update({
        where: { id: messageId },
        data: {
          status: 'SENT',
        },
      });

      // Update shortlist status if needed
      const shortlist = await prisma.shortlist.findFirst({
        where: { userId, investorId },
      });

      if (shortlist && shortlist.status !== 'CONTACTED') {
        await prisma.shortlist.update({
          where: { id: shortlist.id },
          data: { status: 'CONTACTED' },
        });
      }

      console.log(`Scheduled email sent successfully for message ${messageId}`);
    } catch (error) {
      console.error(`Error processing scheduled email for message ${messageId}:`, error);
      
      // Update message status to FAILED
      await prisma.message.update({
        where: { id: messageId },
        data: { status: 'FAILED' },
      });

      throw error; // Re-throw to trigger retry mechanism
    }
  },
  {
    connection,
    concurrency: 5, // Process up to 5 emails at once
  }
);

// Email sending functions (simplified versions from message.ts)
async function sendViaGmail(
  accessToken: string,
  message: any,
  attachmentLinks: any[],
  replyThreadId?: string | null,
  mergedReferences?: string | null
): Promise<{ threadId: string | null; messageId: string | null }> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth });

  const toRecipients = Array.isArray(message.to) ? message.to : [message.to];
  const ccRecipients = Array.isArray(message.cc) ? message.cc : [];
  const effectiveThreadId = replyThreadId || message.threadId || null;
  const mergedRefs = mergedReferences ?? message.gmailReferences;
  const { referencesHeader, parentMessageId } = parseReferences(mergedRefs);
  const messageIdHeader = generateMessageId();

  // Build MIME with attachments
  const boundary = `----=_Part_${Math.random().toString(16).slice(2)}`;
  const lines: string[] = [];

  lines.push('MIME-Version: 1.0');
  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  lines.push(`To: ${toRecipients.join(', ')}`);
  if (ccRecipients.length) lines.push(`Cc: ${ccRecipients.join(', ')}`);
  const senderName = buildSenderDisplayName(message.user, message.from);
  const encodedSenderName = senderName.replace(/"/g, '\\"');
  lines.push(`From: "${encodedSenderName}" <${message.from}>`);
  if (replyThreadId) lines.push(`Thread-Id: ${replyThreadId}`);
  if (parentMessageId) lines.push(`In-Reply-To: ${parentMessageId}`);
  if (referencesHeader) lines.push(`References: ${referencesHeader}`);
  lines.push(`Subject: ${message.subject}`);
  lines.push(`Message-ID: ${messageIdHeader}`);
  lines.push('');

  // Body part
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/html; charset="UTF-8"');
  lines.push('Content-Transfer-Encoding: 7bit');
  lines.push('');
  lines.push(cleanEmailBody(message.body));
  lines.push('');

  // Attachments
  for (const att of attachmentLinks || []) {
    if (!att?.url) continue;
    const filename = att.filename || att.name || 'attachment';
    const type = att.type || att.contentType || 'application/octet-stream';
    const size = Number(att.size) || 0;
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${type}; name="${filename}"`);
    lines.push('Content-Transfer-Encoding: base64');
    lines.push(`Content-Disposition: attachment; filename="${filename}"`);
    lines.push('');
    lines.push(Buffer.from(`URL:${att.url}`).toString('base64')); // placeholder, backend should embed actual data if needed
    lines.push('');
  }

  lines.push(`--${boundary}--`);

  const rawMessage = lines.join('\r\n');
  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const requestBody: any = { raw: encodedMessage };
  if (effectiveThreadId) {
    requestBody.threadId = effectiveThreadId;
  }

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody,
  });

  return {
    threadId: response.data.threadId || effectiveThreadId || null,
    messageId: messageIdHeader,
  };
}

async function sendViaMicrosoftGraph(
  accessToken: string,
  message: any,
  attachmentLinks: any[],
  threadId?: string | null,
  mergedReferences?: string | null
): Promise<{ threadId: string | null; messageId: string | null }> {
  const cleanedBody = cleanEmailBody(message.body);
  const toRecipients = Array.isArray(message.to) ? message.to : [message.to];
  const ccRecipients = Array.isArray(message.cc) ? message.cc : [];
  const effectiveThreadId = threadId || message.threadId || null;
  const { referencesHeader, parentMessageId } = parseReferences(mergedReferences ?? message.gmailReferences);

  const emailMessage: any = {
    message: {
      subject: message.subject,
      body: {
        contentType: 'HTML',
        content: cleanedBody,
      },
      from: {
        emailAddress: {
          address: message.from,
          name: `${message.user.firstname} ${message.user.lastname}`,
        },
      },
      toRecipients: toRecipients.map((email: string) => ({
        emailAddress: { address: email },
      })),
      ...(ccRecipients.length > 0 && {
        ccRecipients: ccRecipients.map((email: string) => ({
          emailAddress: { address: email },
        })),
      }),
    },
    saveToSentItems: true,
  };

  const internetHeaders: Array<{ name: string; value: string }> = [];

  if (parentMessageId) {
    internetHeaders.push({ name: 'In-Reply-To', value: parentMessageId });
  }

  if (referencesHeader) {
    internetHeaders.push({ name: 'References', value: referencesHeader });
  }

  if (internetHeaders.length > 0) {
    emailMessage.message.internetMessageHeaders = internetHeaders;
  }

  await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailMessage),
  });

  return {
    threadId: effectiveThreadId,
    messageId: null,
  };
}

// Handle worker events
emailWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

export default emailWorker;
