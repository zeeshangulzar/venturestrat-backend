import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import sgMail from '@sendgrid/mail';
import { google } from 'googleapis';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { cleanEmailBody, generateEmailHTML, detectGoogleFonts } from '../routes/message.js';

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

// Set up SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

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

      let previousMessage = message.previousMessage ?? null;

      if (message.previousMessageId && !previousMessage) {
        previousMessage = await prisma.message.findUnique({
          where: { id: message.previousMessageId },
          select: previousMessageSelect,
        });
        message = { ...message, previousMessage: previousMessage ?? undefined } as typeof message;
      }

      if (!message.previousMessageId && !previousMessage) {
        const fallbackPrevious = await prisma.message.findFirst({
          where: {
            userId,
            investorId,
            status: { in: ['SENT', 'ANSWERED'] },
            id: { not: message.id },
          },
          orderBy: { updatedAt: 'desc' },
          select: previousMessageSelect,
        });

        if (fallbackPrevious) {
          const merged = mergeReferences(
            message.gmailReferences,
            fallbackPrevious.gmailReferences,
            fallbackPrevious.gmailMessageId,
          );

          await prisma.message.update({
            where: { id: message.id },
            data: {
              previousMessageId: fallbackPrevious.id,
              ...(message.threadId ? {} : { threadId: fallbackPrevious.threadId }),
              ...(message.gmailReferences ? {} : { gmailReferences: merged }),
            },
          });

          message = {
            ...message,
            previousMessageId: fallbackPrevious.id,
            previousMessage: fallbackPrevious,
            threadId: message.threadId ?? fallbackPrevious.threadId ?? null,
            gmailReferences: message.gmailReferences ?? merged ?? null,
          } as typeof message;
          previousMessage = fallbackPrevious;
        }
      }

      const mergedReferences = mergeReferences(
        message.gmailReferences,
        previousMessage?.gmailReferences,
        previousMessage?.gmailMessageId,
      );

      const effectiveThreadId = threadId || message.threadId || previousMessage?.threadId || null;

      const messageContext = {
        ...message,
        threadId: effectiveThreadId,
        gmailReferences: mergedReferences ?? null,
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
          console.log('No Microsoft OAuth tokens found, will use SendGrid fallback...');
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
        // Use SendGrid fallback
        sendResult = await sendViaSendGrid(messageContext);
      }

      const finalReferences = mergeReferences(mergedReferences, sendResult.messageId);

      // Update message status and metadata
      await prisma.message.update({
        where: { id: messageId },
        data: {
          status: 'SENT',
          ...(sendResult.threadId ? { threadId: sendResult.threadId } : {}),
          ...(sendResult.messageId ? { gmailMessageId: sendResult.messageId } : {}),
          ...(finalReferences !== null ? { gmailReferences: finalReferences } : {}),
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

async function sendViaSendGrid(message: any): Promise<{ threadId: string | null; messageId: string | null }> {
  const cleanBody = cleanEmailBody(message.body);
  const googleFonts = detectGoogleFonts(cleanBody);
  const htmlContent = generateEmailHTML(cleanBody, googleFonts);

  const emailData = {
    to: Array.isArray(message.to) ? message.to : [message.to],
    ...(message.cc && message.cc.length > 0 && { cc: message.cc }),
    from: {
      email: 'info@venturestrat.ai',
      name: `${message.user.firstname} ${message.user.lastname}`,
    },
    replyTo: message.from,
    subject: message.subject,
    html: htmlContent,
  };

  const { referencesHeader, parentMessageId } = parseReferences(message.gmailReferences);
  const headers: Record<string, string> = {};

  if (parentMessageId) {
    headers['In-Reply-To'] = parentMessageId;
  }

  if (referencesHeader) {
    headers['References'] = referencesHeader;
  }

  if (Object.keys(headers).length > 0) {
    (emailData as any).headers = headers;
  }

  await sgMail.send(emailData);

  return {
    threadId: message.threadId || null,
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

