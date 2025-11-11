import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { google } from 'googleapis';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { cleanEmailBody, sendViaSendgridFallback } from '../routes/message.js';

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
          effectiveThreadId
        );
      } else if (microsoftTokens?.data && microsoftTokens.data.length > 0) {
        sendResult = await sendViaMicrosoftGraph(
          microsoftTokens.data[0].token,
          messageContext,
          effectiveThreadId
        );
      } else {
        const mergedReferences = mergeReferences(
          referencesFromPrev,
          messageContext.gmailReferences,
        );

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
async function sendViaGmail(accessToken: string, message: any, threadId?: string | null): Promise<{ threadId: string | null; messageId: string | null }> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth });

  const cleanedBody = cleanEmailBody(message.body);
  const toRecipients = Array.isArray(message.to) ? message.to : [message.to];
  const ccRecipients = Array.isArray(message.cc) ? message.cc : [];
  const existingThreadId = threadId || message.threadId || null;
  const { referencesHeader, parentMessageId } = parseReferences(message.gmailReferences);
  const messageIdHeader = generateMessageId();

  const headerLines = [
    `To: ${toRecipients.join(', ')}`,
    ...(ccRecipients.length > 0 ? [`Cc: ${ccRecipients.join(', ')}`] : []),
    `From: ${message.user.firstname} ${message.user.lastname} <${message.from}>`,
    `Subject: ${message.subject}`,
    `Message-ID: ${messageIdHeader}`,
    ...(parentMessageId ? [`In-Reply-To: ${parentMessageId}`] : []),
    ...(referencesHeader ? [`References: ${referencesHeader}`] : []),
  ];

  const emailContent = [
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    cleanedBody,
  ];

  const rawMessage = [...headerLines, ...emailContent].join('\r\n');
  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const requestBody: any = { raw: encodedMessage };
  if (existingThreadId) {
    requestBody.threadId = existingThreadId;
  }

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody,
  });

  return {
    threadId: response.data.threadId || existingThreadId || null,
    messageId: messageIdHeader,
  };
}

async function sendViaMicrosoftGraph(accessToken: string, message: any, threadId?: string | null): Promise<{ threadId: string | null; messageId: string | null }> {
  const cleanedBody = cleanEmailBody(message.body);
  const toRecipients = Array.isArray(message.to) ? message.to : [message.to];
  const ccRecipients = Array.isArray(message.cc) ? message.cc : [];
  const effectiveThreadId = threadId || message.threadId || null;
  const { referencesHeader, parentMessageId } = parseReferences(message.gmailReferences);

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
