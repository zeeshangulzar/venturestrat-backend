// src/routes/webhooks.ts
import { Router } from 'express';
import { PrismaClient, MessageStatus } from '@prisma/client';
import { Webhook } from 'svix';
import { google } from 'googleapis';
import { clerkClient } from '@clerk/clerk-sdk-node';

const router = Router();
const prisma = new PrismaClient();

// Webhook secret from Clerk dashboard
const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;

// Verify webhook signature
const verifyWebhook = (payload: string, headers: any) => {
  if (!webhookSecret) {
    throw new Error('CLERK_WEBHOOK_SECRET is not set');
  }

  const svix = new Webhook(webhookSecret);
  try {
    return svix.verify(payload, headers);
  } catch (error) {
    throw new Error('Webhook verification failed');
  }
};

const extractEmailAddress = (value?: string | null): string | null => {
  if (!value) return null;
  const match = value.match(/<([^>]+)>/);
  const email = match ? match[1] : value;
  return email.trim();
};

const extractEmailAddresses = (value?: string | null): string[] => {
  if (!value) return [];
  return value
    .split(',')
    .map(part => extractEmailAddress(part))
    .filter((email): email is string => Boolean(email));
};

const extractLatestReplyBody = (rawBody: string): string => {
  if (!rawBody) return rawBody;

  const normalized = rawBody.replace(/\r\n/g, '\n');
  
  // Debug logging for your specific case
  console.log('Processing email body:', normalized);
  
  // Special handling for your specific case: "Okay getting it On Fri, Oct 17, 2025 at 10:24 AM Zeeshan Gulzar"
  if (normalized.includes('On ') && normalized.includes('AM') || normalized.includes('PM')) {
    console.log('Detected potential reply pattern, applying special cleanup...');
    
    // Try to find the "On ... AM/PM ..." pattern and remove everything from that point
    const replyPattern = /On .+ [AP]M .+$/im;
    const match = replyPattern.exec(normalized);
    if (match && match.index >= 0) {
      let cleaned = normalized.substring(0, match.index).trim();
      
      // Remove any trailing "wrote:" that might be left
      cleaned = cleaned.replace(/\s*wrote:\s*$/ims, '').trim();
      
      console.log('Special cleanup result:', cleaned);
      if (cleaned) {
        return cleaned;
      }
    }
  }
  
  // Enhanced markers for different email clients and reply formats
  const markers: RegExp[] = [
    // Gmail/Google format
    /^On .+ wrote:$/m,
    /^On .+ at .+ wrote:$/m,
    /^On .+ \d{4} at \d{1,2}:\d{2} [AP]M .+ wrote:$/m,
    
    // Outlook format
    /^From: .+$/m,
    /^Sent: .+$/m,
    /^To: .+$/m,
    /^Subject: .+$/m,
    /^Date: .+$/m,
    
    // Apple Mail format
    /^On .+ at .+ wrote:$/m,
    
    // Generic reply markers
    /^-{2,}\s*Original Message\s*-{2,}$/im,
    /^-{2,}\s*Forwarded Message\s*-{2,}$/im,
    /^> .*/m,
    /^>> .*/m,
    /^>>> .*/m,
    
    // Common reply separators
    /^-----Original Message-----/im,
    /^-----Forwarded Message-----/im,
    /^________________________________/m,
    /^_____________________________/m,
    
    // HTML reply markers
    /<div class="gmail_quote">/i,
    /<blockquote class="gmail_quote"/i,
    /<div class="moz-cite-prefix">/i,
    
    // Specific patterns for your case
    /On .+ at \d{1,2}:\d{2} [AP]M .+ wrote:/i,
    /On .+ \d{4} at \d{1,2}:\d{2} [AP]M .+ wrote:/i,
    
    // Patterns without "wrote:" - more flexible matching
    /On .+ at \d{1,2}:\d{2} [AP]M .+$/i,
    /On .+ \d{4} at \d{1,2}:\d{2} [AP]M .+$/i,
    /On .+ \d{1,2}:\d{2} [AP]M .+$/i,
    
    // Even more flexible - match any "On ... AM/PM ..." pattern
    /On .+ [AP]M .+$/i,
    /On .+ \d{1,2}:\d{2} [AP]M .+$/i
  ];

  let cutoff = normalized.length;
  let bestMatch = -1;
  
  for (const marker of markers) {
    const match = marker.exec(normalized);
    if (match && typeof match.index === 'number' && match.index >= 0 && match.index < cutoff) {
      cutoff = match.index;
      bestMatch = match.index;
    }
  }

  let trimmed = normalized.slice(0, cutoff).trim();

  // If we found a match, try to clean up the end of the trimmed content
  if (bestMatch >= 0) {
    // Remove any trailing quotes or common reply indicators
    trimmed = trimmed
      .replace(/\s*>\s*$/gm, '') // Remove trailing quote markers
      .replace(/\s*\|.*$/gm, '') // Remove trailing pipe separators
      .replace(/\s*--\s*$/gm, '') // Remove trailing dashes
      .trim();
  }

  // If no content after trimming, try to get the last meaningful line
  if (!trimmed) {
    const lines = normalized.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line && !line.match(/^(On |From:|Sent:|To:|Subject:|Date:)/i) && !line.match(/^>/)) {
        trimmed = line;
        break;
      }
    }
  }

  // Final cleanup - remove any remaining inline reply markers
  if (trimmed) {
    // Remove inline "On ... wrote:" patterns
    trimmed = trimmed.replace(/\s*On [^\n]*wrote:\s*$/ims, '').trim();
    
    // Remove "On ... AM/PM ..." patterns (without "wrote:")
    trimmed = trimmed.replace(/\s*On [^\n]*[AP]M [^\n]*$/ims, '').trim();
    
    // Remove any remaining quote markers at the end
    trimmed = trimmed.replace(/\s*>\s*$/gm, '').trim();
    
    // Additional cleanup for your specific case
    trimmed = trimmed.replace(/\s*On .+ \d{1,2}:\d{2} [AP]M .+$/ims, '').trim();
    trimmed = trimmed.replace(/\s*On .+ at \d{1,2}:\d{2} [AP]M .+$/ims, '').trim();
    
    // Remove standalone "wrote:" at the end
    trimmed = trimmed.replace(/\s*wrote:\s*$/ims, '').trim();
  }

  return trimmed || rawBody; // Fallback to original if all else fails
};

const decodeBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  return Buffer.from(padded, 'base64').toString('utf-8');
};

const extractBodyFromPayload = (payload: any): string => {
  if (!payload) return '';

  if (payload.body && payload.body.data) {
    try {
      return extractLatestReplyBody(decodeBase64Url(payload.body.data));
    } catch (error) {
      console.error('Error decoding payload body:', error);
    }
  }

  if (!payload.parts || !Array.isArray(payload.parts)) {
    return '';
  }

  let htmlBody = '';

  for (const part of payload.parts) {
    const mimeType = part.mimeType || '';
    const partBody = extractBodyFromPayload(part);

    if (!partBody) {
      continue;
    }

    if (mimeType === 'text/plain') {
      return partBody;
    }

    if (!htmlBody && mimeType === 'text/html') {
      htmlBody = partBody;
      continue;
    }

    return partBody;
  }

  return extractLatestReplyBody(htmlBody);
};

type GmailMessageDetails = {
  sender: string;
  subject: string;
  body: string;
  date: string;
  to: string[];
  cc?: string[];
  threadId?: string;
};

const isInsufficientScopeError = (error: any): boolean => {
  if (!error || typeof error !== 'object') return false;
  const message = (error as Error).message || '';
  const status = (error as any).code || (error as any).status;
  return (
    (status === 403 || status === '403') &&
    message.toLowerCase().includes('insufficient authentication scopes')
  );
};

// Function to resubscribe Gmail watch when scope errors occur
const resubscribeGmailWatch = async (userId: string): Promise<boolean> => {
  try {
    console.log(`Attempting to resubscribe Gmail watch for user: ${userId}`);
    
    // Get user's OAuth tokens
    const tokens = await clerkClient.users.getUserOauthAccessToken(userId, 'oauth_google');
    
    if (!tokens.data || tokens.data.length === 0) {
      console.log(`No Google OAuth tokens available for user ${userId} during resubscribe.`);
      return false;
    }

    const accessToken = tokens.data[0].token;
    const projectId = process.env.YOUR_PROJECT_ID;
    const topicName = process.env.YOUR_TOPIC_NAME;

    if (!projectId || !topicName) {
      console.error('Missing Gmail watch configuration for resubscribe');
      return false;
    }

    const fullTopicName = topicName.startsWith('projects/')
      ? topicName
      : `projects/${projectId}/topics/${topicName}`;

    // Create new Gmail watch
    const gmailResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/watch',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          topicName: fullTopicName,
          labelIds: ['INBOX'],
        }),
      },
    );

    if (!gmailResponse.ok) {
      const errorData = await gmailResponse.json().catch(() => ({}));
      console.error('Failed to resubscribe Gmail watch:', errorData);
      return false;
    }

    const gmailData = await gmailResponse.json();
    console.log('Gmail watch resubscribed successfully:', gmailData);

    // Update user metadata with new watch details
    await clerkClient.users.updateUserMetadata(userId, {
      publicMetadata: {
        gmailWatchInitialized: true,
        gmailWatchHistoryId: gmailData.historyId,
        gmailWatchExpiration: gmailData.expiration,
        gmailWatchLastResubscribe: new Date().toISOString(),
      },
    });

    return true;
  } catch (error) {
    console.error('Error resubscribing Gmail watch:', error);
    return false;
  }
};

const fetchGmailMessageDetails = async (
  emailAddress: string,
  historyId?: string
): Promise<GmailMessageDetails | null> => {
  try {
    const user = await prisma.user.findUnique({
      where: { email: emailAddress }
    });

    if (!user) {
      console.log(`No user found for Gmail address ${emailAddress}, skipping Gmail API fetch.`);
      return null;
    }

    const tokens = await clerkClient.users.getUserOauthAccessToken(user.id, 'oauth_google');

    if (!tokens.data || tokens.data.length === 0) {
      console.log(`No Google OAuth tokens available for user ${user.id}, skipping Gmail API fetch.`);
      return null;
    }

    const accessToken = tokens.data[0].token;
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth });

    const messageIds: string[] = [];

    if (historyId) {
      // Only fetch messages from the current historyId (new messages only)
      // Don't go back in history to avoid processing old messages
      try {
        const historyResponse = await gmail.users.history.list({
          userId: 'me',
          startHistoryId: historyId, // Use the exact historyId from the webhook
          historyTypes: ['messageAdded']
        });

        const history = historyResponse.data.history || [];
        console.log(`Found ${history.length} history entries for new messages`);
        
        for (const historyEntry of history) {
          const added = historyEntry.messagesAdded || [];
          for (const addedMessage of added) {
            const id = addedMessage.message?.id;
            if (id) {
              messageIds.push(id);
              console.log(`Added new message ID to processing queue: ${id}`);
            }
          }
        }
      } catch (historyError) {
        if (isInsufficientScopeError(historyError)) {
          console.warn('Gmail history fetch skipped due to insufficient scopes. Attempting resubscribe...');
          // Attempt to resubscribe Gmail watch
          const resubscribed = await resubscribeGmailWatch(user.id);
          if (resubscribed) {
            console.log('Gmail watch resubscribed successfully, retrying history fetch...');
            // Retry the history fetch after resubscription
            try {
              const retryHistoryResponse = await gmail.users.history.list({
                userId: 'me',
                startHistoryId: historyId, // Still use the original historyId
                historyTypes: ['messageAdded']
              });
              const retryHistory = retryHistoryResponse.data.history || [];
              for (const historyEntry of retryHistory) {
                const added = historyEntry.messagesAdded || [];
                for (const addedMessage of added) {
                  const id = addedMessage.message?.id;
                  if (id) {
                    messageIds.push(id);
                    console.log(`Added new message ID to processing queue after resubscribe: ${id}`);
                  }
                }
              }
            } catch (retryError) {
              console.error('Error retrying Gmail history fetch after resubscribe:', retryError);
            }
          }
        } else {
          console.error('Error fetching Gmail history:', historyError);
        }
      }
    }

    // If no messageIds from history, try to fetch the most recent message directly
    if (messageIds.length === 0) {
      console.log('No messages found in history, attempting to fetch the most recent message directly');
      try {
        const listResponse = await gmail.users.messages.list({
          userId: 'me',
          labelIds: ['INBOX'],
          maxResults: 1,
          q: 'newer_than:1h' // Only get messages from the last hour
        });

        const messages = listResponse.data.messages || [];
        for (const message of messages) {
          if (message.id) {
            messageIds.push(message.id);
            console.log(`Added recent message ID to processing queue: ${message.id}`);
          }
        }
      } catch (listError) {
        if (isInsufficientScopeError(listError)) {
          console.warn('Gmail message list skipped due to insufficient scopes. Attempting resubscribe...');
          const resubscribed = await resubscribeGmailWatch(user.id);
          if (resubscribed) {
            console.log('Gmail watch resubscribed successfully, retrying message list...');
            try {
              const retryListResponse = await gmail.users.messages.list({
                userId: 'me',
                labelIds: ['INBOX'],
                maxResults: 1,
                q: 'newer_than:1h'
              });
              const retryMessages = retryListResponse.data.messages || [];
              for (const message of retryMessages) {
                if (message.id) {
                  messageIds.push(message.id);
                  console.log(`Added recent message ID after resubscribe: ${message.id}`);
                }
              }
            } catch (retryError) {
              console.error('Error retrying Gmail message list after resubscribe:', retryError);
            }
          }
        } else {
          console.error('Error listing recent Gmail messages:', listError);
        }
      }
    }

    for (const id of messageIds) {
      try {
        const messageResponse = await gmail.users.messages.get({
          userId: 'me',
          id,
          format: 'full'
        });

        if (messageResponse.data.labelIds?.includes('DRAFT')) {
          console.log(`Skipping Gmail message ${id} because it is a draft.`);
          continue;
        }

        const payload = messageResponse.data.payload;
        if (!payload || !payload.headers) {
          continue;
        }

        const headers = payload.headers;
        const sender = headers.find((h: any) => h.name === 'From')?.value || '';
        const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
        const date = headers.find((h: any) => h.name === 'Date')?.value || '';
        const toHeader = headers.find((h: any) => h.name === 'To')?.value || '';
        const ccHeader = headers.find((h: any) => h.name === 'Cc')?.value || '';
        const body = extractBodyFromPayload(payload);
        const to = extractEmailAddresses(toHeader);
        const cc = extractEmailAddresses(ccHeader);

        if (!sender || to.length === 0) {
          continue;
        }

        return {
          sender,
          subject,
          body,
          date,
          to,
          cc: cc.length > 0 ? cc : undefined,
          threadId: messageResponse.data.threadId || undefined
        };
      } catch (messageError) {
        if (isInsufficientScopeError(messageError)) {
          console.warn(`Gmail message ${id} fetch skipped due to insufficient scopes. Attempting resubscribe...`);
          // Attempt to resubscribe Gmail watch
          const resubscribed = await resubscribeGmailWatch(user.id);
          if (resubscribed) {
            console.log('Gmail watch resubscribed successfully, retrying message fetch...');
            // Retry the message fetch after resubscription
            try {
              const retryMessageResponse = await gmail.users.messages.get({
                userId: 'me',
                id,
                format: 'full'
              });
              
              if (retryMessageResponse.data.labelIds?.includes('DRAFT')) {
                console.log(`Skipping Gmail message ${id} because it is a draft.`);
                continue;
              }

              const payload = retryMessageResponse.data.payload;
              if (!payload || !payload.headers) {
                continue;
              }

              const headers = payload.headers;
              const sender = headers.find((h: any) => h.name === 'From')?.value || '';
              const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
              const date = headers.find((h: any) => h.name === 'Date')?.value || '';
              const toHeader = headers.find((h: any) => h.name === 'To')?.value || '';
              const ccHeader = headers.find((h: any) => h.name === 'Cc')?.value || '';
              const body = extractBodyFromPayload(payload);
              const to = extractEmailAddresses(toHeader);
              const cc = extractEmailAddresses(ccHeader);

              if (!sender || to.length === 0) {
                continue;
              }

              return {
                sender,
                subject,
                body,
                date,
                to,
                cc: cc.length > 0 ? cc : undefined,
                threadId: retryMessageResponse.data.threadId || undefined
              };
            } catch (retryError) {
              console.error(`Error retrying Gmail message ${id} fetch after resubscribe:`, retryError);
            }
          }
          return null;
        }
        console.error(`Error fetching Gmail message ${id}:`, messageError);
      }
    }

    console.log('No suitable Gmail message details found after processing history/list responses.');
    return null;
  } catch (error) {
    console.error('Unexpected error fetching Gmail message details:', error);
    return null;
  }
};

// Handle Clerk webhooks
router.post('/webhooks/clerk', async (req, res) => {
  try {
    // Get the webhook headers
    const svix_id = req.headers['svix-id'] as string;
    const svix_timestamp = req.headers['svix-timestamp'] as string;
    const svix_signature = req.headers['svix-signature'] as string;

    if (!svix_id || !svix_timestamp || !svix_signature) {
      return res.status(400).json({ error: 'Missing svix headers' });
    }

    // Verify webhook signature
    const payload = JSON.stringify(req.body);
    const headers = {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    };

    let evt: any;
    try {
      evt = verifyWebhook(payload, headers);
    } catch (error) {
      console.error('Webhook verification failed:', error);
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const { id, email_addresses, first_name, last_name, public_metadata, ...attributes } = evt.data;
    const eventType = evt.type;

    console.log(`Processing webhook event: ${eventType}`, { 
      userId: id, 
      email: email_addresses?.[0]?.email_address,
      firstname: first_name,
      lastname: last_name,
      publicMetaData: public_metadata
    });

    switch (eventType) {
      case 'user.created':
        // Handle user creation
        if (email_addresses && email_addresses.length > 0) {
          const email = email_addresses[0].email_address;
          
          // Check if user already exists
          const existingUser = await prisma.user.findUnique({
            where: { id: id }
          });

          if (!existingUser) {
            await prisma.user.create({
              data: {
                id: id,
                email: email,
                firstname: first_name || null,
                lastname: last_name || null,
                role: "moderator", // Default role
                onboardingComplete: false, // Default onboarding status
                publicMetaData: public_metadata || null,
              },
            });
            console.log(`User created in database: ${id} (${email}) with role: moderator`);
          } else {
            console.log(`User already exists in database: ${id}`);
          }
        }
        break;
      case 'user.deleted':
        // Handle user deletion
        try {
          console.log(`Attempting to delete user and associated data: ${id}`);
          
          // First check if user exists
          const existingUser = await prisma.user.findUnique({
            where: { id: id },
            include: {
              shortlists: true,
              messages: true
            }
          });
          
          if (!existingUser) {
            console.log(`User ${id} not found in database, nothing to delete`);
            return;
          }
          
          console.log(`Found user ${id} with ${existingUser.shortlists.length} shortlists and ${existingUser.messages.length} messages`);
          
          // Delete all messages associated with this user first
          const deletedMessages = await prisma.message.deleteMany({
            where: { userId: id }
          });
          console.log(`Deleted ${deletedMessages.count} messages for user: ${id}`);
          
          // Then delete all shortlists associated with this user
          const deletedShortlists = await prisma.shortlist.deleteMany({
            where: { userId: id }
          });
          console.log(`Deleted ${deletedShortlists.count} shortlists for user: ${id}`);

          // Finally delete the user
          const deletedUser = await prisma.user.delete({
            where: { id: id }
          });
          console.log(`User deleted from database: ${id}`, deletedUser);
        } catch (error: any) {
          console.error(`Error deleting user ${id}:`, error);
          
          // If user doesn't exist, that's fine - just log it
          if (error.code === 'P2025') {
            console.log(`User ${id} not found in database for deletion`);
          } else {
            // For other errors, try to clean up associated data if user deletion fails
            try {
              const deletedMessages = await prisma.message.deleteMany({
                where: { userId: id }
              });
              console.log(`Cleaned up ${deletedMessages.count} orphaned messages for user: ${id}`);
              
              const deletedShortlists = await prisma.shortlist.deleteMany({
                where: { userId: id }
              });
              console.log(`Cleaned up ${deletedShortlists.count} orphaned shortlists for user: ${id}`);
            } catch (cleanupError) {
              console.error(`Error cleaning up associated data for user ${id}:`, cleanupError);
            }
          }
        }
        break;

      default:
        console.log(`Unhandled webhook event type: ${eventType}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Gmail notification webhook for handling replies (ANSWERED status)
router.post('/webhooks/gmail-notification', async (req, res) => {
  try {
    console.log('Gmail notification webhook received:', {
      headers: req.headers,
      body: req.body
    });

    // Gmail sends notifications in a specific format
    const { message } = req.body;
    
    if (!message) {
      console.log('No message data in Gmail notification webhook');
      return res.status(200).json({ success: true, message: 'No message data' });
    }

    // Extract message details
    const {
      data: messageData,
      messageId,
      publishTime,
      deliveryAttempt,
      subscription
    } = message;

    console.log('Gmail notification details:', {
      messageId,
      publishTime,
      deliveryAttempt,
      subscription
    });

    // Parse the base64 encoded message data
    let decodedData;
    try {
      const buffer = Buffer.from(messageData, 'base64');
      decodedData = JSON.parse(buffer.toString());
    } catch (parseError) {
      console.error('Error parsing Gmail notification data:', parseError);
      return res.status(400).json({ error: 'Invalid message data format' });
    }

    console.log('Decoded Gmail notification:', decodedData);

    // Extract email details from the decoded data
    const emailAddress = decodedData.emailAddress;
    const historyId = decodedData.historyId;
    const labelIds = decodedData.labelIds;
    const snippet = decodedData.snippet;
    let threadId = decodedData.threadId;
    let payload = decodedData.payload;

    console.log('Processing Gmail notification for new message:', {
      emailAddress,
      historyId,
      threadId,
      hasPayload: !!payload
    });

    if (Array.isArray(labelIds) && labelIds.includes('DRAFT')) {
      console.log('Skipping Gmail notification for draft message.');
      return res.status(200).json({
        success: true,
        message: 'Gmail notification processed - draft message skipped',
        skipped: true
      });
    }

    // Only process messages that are truly new (not from previous history)
    // This ensures we don't process old messages that might be in the notification
    if (!historyId) {
      console.log('No historyId provided, skipping to avoid processing old messages');
      return res.status(200).json({
        success: true,
        message: 'Gmail notification processed - no historyId, skipping old messages',
        skipped: true
      });
    }

    // Extract sender, subject, and body from payload
    let sender = '';
    let subject = '';
    let body = '';
    let date = '';
    let recipientAddresses: string[] = [];
    let ccAddresses: string[] = [];

    if (payload && payload.headers) {
      // Extract headers
      const headers = payload.headers;
      sender = headers.find((h: any) => h.name === 'From')?.value || '';
      subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
      date = headers.find((h: any) => h.name === 'Date')?.value || '';
      const toHeader = headers.find((h: any) => h.name === 'To')?.value || '';
      const ccHeader = headers.find((h: any) => h.name === 'Cc')?.value || '';
      recipientAddresses = extractEmailAddresses(toHeader);
      ccAddresses = extractEmailAddresses(ccHeader);
    } else if (emailAddress) {
      console.log('Payload missing from Gmail notification, attempting to fetch message details via Gmail API.');
      const gmailDetails = await fetchGmailMessageDetails(emailAddress, historyId);

      if (!gmailDetails) {
        console.log('Unable to fetch detailed Gmail message data, skipping processing for this notification.');
        return res.status(200).json({
          success: true,
          message: 'Gmail notification processed - unable to fetch message details',
          skipped: true
        });
      }

      sender = gmailDetails.sender;
      subject = gmailDetails.subject;
      body = gmailDetails.body;
      date = gmailDetails.date;
      recipientAddresses = gmailDetails.to;
      ccAddresses = gmailDetails.cc || [];
      threadId = gmailDetails.threadId ?? threadId;
    }

    if (emailAddress) {
      const normalizedEmailAddress = emailAddress.toLowerCase();
      const alreadyPresent = recipientAddresses.some((addr) => {
        const cleaned = extractEmailAddress(addr);
        return cleaned ? cleaned.toLowerCase() === normalizedEmailAddress : false;
      });
      if (!alreadyPresent) {
        recipientAddresses.unshift(emailAddress);
      }
    }

    // Extract body from payload parts
    if (!body && payload && payload.body && payload.body.data) {
      try {
        const rawBody = decodeBase64Url(payload.body.data);
        console.log('Raw email body before extraction:', rawBody.substring(0, 200) + '...');
        body = extractLatestReplyBody(rawBody);
        console.log('Extracted email body after processing:', body);
      } catch (error) {
        console.error('Error decoding email body:', error);
      }
    } else if (!body && payload && payload.parts) {
      // Handle multipart messages
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body && part.body.data) {
          try {
            const rawBody = decodeBase64Url(part.body.data);
            console.log('Raw email body from parts before extraction:', rawBody.substring(0, 200) + '...');
            body = extractLatestReplyBody(rawBody);
            console.log('Extracted email body from parts after processing:', body);
            break;
          } catch (error) {
            console.error('Error decoding email body from parts:', error);
          }
        }
      }
    }

    const senderEmail = extractEmailAddress(sender);

    try {
      if (!senderEmail) {
        console.log('Insufficient data to match SENT message (missing sender email).');
        return res.status(200).json({
          success: true,
          message: 'Gmail notification processed - missing sender email',
          skipped: true
        });
      }

      if (recipientAddresses.length === 0) {
        console.log('Insufficient data to match SENT message (missing recipient addresses).');
        return res.status(200).json({
          success: true,
          message: 'Gmail notification processed - missing recipient addresses',
          skipped: true
        });
      }

      const senderCandidates = Array.from(
        new Set<string>([
          senderEmail,
          senderEmail.toLowerCase(),
          senderEmail.toUpperCase()
        ])
      );

      const recipientCandidateSet = new Set<string>();
      for (const address of recipientAddresses) {
        const cleaned = extractEmailAddress(address);
        if (!cleaned) continue;
        recipientCandidateSet.add(cleaned);
        recipientCandidateSet.add(cleaned.toLowerCase());
        recipientCandidateSet.add(cleaned.toUpperCase());
      }

      if (emailAddress) {
        const cleaned = emailAddress.trim();
        recipientCandidateSet.add(cleaned);
        recipientCandidateSet.add(cleaned.toLowerCase());
        recipientCandidateSet.add(cleaned.toUpperCase());
      }

      const recipientCandidates = Array.from(recipientCandidateSet);

      console.log('Matching Gmail reply sender candidates:', senderCandidates);
      console.log('Matching Gmail reply recipient candidates:', recipientCandidates);

      const senderFilters = senderCandidates.map(candidate => ({
        from: {
          equals: candidate,
          mode: 'insensitive' as const
        }
      }));

      // First, try to find a SENT message where the sender of the reply matches the recipient of the original message
      // and the recipient of the reply matches the sender of the original message
      const existingSentMessage = await prisma.message.findFirst({
        where: {
          status: MessageStatus.SENT,
          AND: [
            // The sender of the reply should match one of the recipients of the original SENT message
            {
              to: {
                hasSome: senderCandidates
              }
            },
            // The recipient of the reply should match the sender of the original SENT message
            {
              from: {
                in: recipientCandidates
              }
            }
          ]
        },
        orderBy: {
          createdAt: 'desc'
        },
        include: {
          user: true,
          investor: true
        }
      });

      if (existingSentMessage) {
        console.log('Found existing SENT message, checking for duplicate ANSWERED message:', {
          originalMessageId: existingSentMessage.id,
          originalSubject: existingSentMessage.subject,
          replyFrom: sender,
          replySubject: subject
        });

        // Check if an ANSWERED message already exists for this conversation
        const existingAnsweredMessage = await prisma.message.findFirst({
          where: {
            userId: existingSentMessage.userId,
            investorId: existingSentMessage.investorId,
            status: MessageStatus.ANSWERED,
            from: senderEmail,
            subject: subject,
            body: body
          }
        });

        if (existingAnsweredMessage) {
          console.log('ANSWERED message already exists for this conversation, skipping duplicate creation:', {
            existingAnsweredMessageId: existingAnsweredMessage.id,
            subject: existingAnsweredMessage.subject,
            from: existingAnsweredMessage.from
          });

          res.status(200).json({ 
            success: true, 
            message: 'Gmail notification processed - ANSWERED message already exists',
            messageId: existingAnsweredMessage.id,
            originalMessageId: existingSentMessage.id,
            skipped: true
          });
          return;
        }

        const answeredRecipients = recipientCandidates.length > 0
          ? Array.from(new Set(recipientCandidates.map(candidate => candidate.toLowerCase())))
          : (emailAddress ? [emailAddress.toLowerCase()] : []);

        // Create a new ANSWERED message
        const answeredMessage = await prisma.message.create({
          data: {
            userId: existingSentMessage.userId,
            investorId: existingSentMessage.investorId,
            status: MessageStatus.ANSWERED,
            to: answeredRecipients,
            cc: ccAddresses.length > 0 ? ccAddresses : [],
            subject: subject,
            from: senderEmail,
            body: body
          }
        });

        console.log('ANSWERED message created successfully:', {
          id: answeredMessage.id,
          subject: answeredMessage.subject,
          from: answeredMessage.from,
          status: answeredMessage.status
        });

        res.status(200).json({ 
          success: true, 
          message: 'Gmail notification processed - ANSWERED message created',
          messageId: answeredMessage.id,
          originalMessageId: existingSentMessage.id
        });

      } else {
        // Fallback: Try to find a SENT message with just subject matching (for cases where email addresses don't match exactly)
        console.log('Primary matching failed, trying fallback matching by subject...');
        
        const fallbackSentMessage = await prisma.message.findFirst({
          where: {
            status: MessageStatus.SENT,
            AND: [
              // Match by subject (remove "Re:" prefix for comparison)
              {
                subject: {
                  equals: subject.replace(/^(Re:\s*|RE:\s*)/i, ''),
                  mode: 'insensitive'
                }
              },
              // The sender of the reply should match one of the recipients of the original SENT message
              {
                to: {
                  hasSome: senderCandidates
                }
              }
            ]
          },
          orderBy: {
            createdAt: 'desc'
          },
          include: {
            user: true,
            investor: true
          }
        });

        if (fallbackSentMessage) {
          console.log('Found SENT message via fallback matching, checking for duplicate ANSWERED message:', {
            originalMessageId: fallbackSentMessage.id,
            originalSubject: fallbackSentMessage.subject,
            replyFrom: sender,
            replySubject: subject
          });

          // Check if an ANSWERED message already exists for this conversation
          const existingAnsweredMessage = await prisma.message.findFirst({
            where: {
              userId: fallbackSentMessage.userId,
              investorId: fallbackSentMessage.investorId,
              status: MessageStatus.ANSWERED,
              from: senderEmail,
              subject: subject,
              body: body,
              createdAt: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Within the last 24 hours
              }
            }
          });

          if (existingAnsweredMessage) {
            console.log('ANSWERED message already exists for this conversation (fallback), skipping duplicate creation:', {
              existingAnsweredMessageId: existingAnsweredMessage.id,
              subject: existingAnsweredMessage.subject,
              from: existingAnsweredMessage.from
            });

            res.status(200).json({ 
              success: true, 
              message: 'Gmail notification processed - ANSWERED message already exists (fallback)',
              messageId: existingAnsweredMessage.id,
              originalMessageId: fallbackSentMessage.id,
              skipped: true
            });
            return;
          }

          const answeredRecipients = recipientCandidates.length > 0
            ? Array.from(new Set(recipientCandidates.map(candidate => candidate.toLowerCase())))
            : (emailAddress ? [emailAddress.toLowerCase()] : []);

          // Create a new ANSWERED message
          const answeredMessage = await prisma.message.create({
            data: {
              userId: fallbackSentMessage.userId,
              investorId: fallbackSentMessage.investorId,
              status: MessageStatus.ANSWERED,
              to: answeredRecipients,
              cc: ccAddresses.length > 0 ? ccAddresses : [],
              subject: subject,
              from: senderEmail,
              body: body
            }
          });

          console.log('ANSWERED message created successfully via fallback:', {
            id: answeredMessage.id,
            subject: answeredMessage.subject,
            from: answeredMessage.from,
            status: answeredMessage.status
          });

          res.status(200).json({ 
            success: true, 
            message: 'Gmail notification processed - ANSWERED message created via fallback matching',
            messageId: answeredMessage.id,
            originalMessageId: fallbackSentMessage.id
          });
        } else {
          console.log('No matching SENT message found for this Gmail notification:', {
            subject,
            sender,
            recipient: emailAddress,
            threadId
          });

          res.status(200).json({ 
            success: true, 
            message: 'Gmail notification processed - no matching SENT message found',
            skipped: true
          });
        }
      }

    } catch (dbError) {
      console.error('Error processing Gmail notification:', dbError);
      res.status(500).json({ 
        error: 'Database error processing Gmail notification',
        message: dbError instanceof Error ? dbError.message : 'Unknown database error'
      });
    }

  } catch (error) {
    console.error('Gmail notification webhook processing error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

