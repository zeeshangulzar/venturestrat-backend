import { Router } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import sgMail from '@sendgrid/mail';
import multer from 'multer';
import { google } from "googleapis";
import { clerkClient } from '@clerk/clerk-sdk-node';
import { load } from 'cheerio';
import { uploadFile, getFileUrl, generateUploadUrl, deleteFile } from '../services/storage.js';

// Utility function to format file sizes
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const router = Router();
const prisma = new PrismaClient();

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

// Configure multer for handling file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 75 * 1024 * 1024, // 75MB limit
  },
});

const buildSenderDisplayName = (user: any, fallback: string) => {
  if (!user) return fallback;
  const first = typeof user.firstname === 'string' ? user.firstname.trim() : '';
  const last = typeof user.lastname === 'string' ? user.lastname.trim() : '';
  const full = `${first} ${last}`.trim();
  return full || fallback;
};

const MAX_ATTACHMENT_SIZE = 75 * 1024 * 1024; // 75MB

const sanitizeFilename = (filename: string) => {
  return filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
};

router.post('/message/attachments/upload-url', async (req, res) => {
  try {
    const { filename, contentType, size } = req.body || {};

    if (!filename || !contentType) {
      return res.status(400).json({ error: 'filename and contentType are required' });
    }

    if (size && Number(size) > MAX_ATTACHMENT_SIZE) {
      return res.status(413).json({ error: 'File size exceeds 75MB limit' });
    }

    const safeFilename = sanitizeFilename(filename);
    const timestamp = Date.now();
    const fileKey = `attachments/${timestamp}-${safeFilename}`;

    const uploadUrl = await generateUploadUrl(fileKey, contentType);
    const downloadUrl = await getFileUrl(fileKey, 24 * 60 * 60); // 24 hours

    res.json({
      key: fileKey,
      uploadUrl,
      downloadUrl,
      expiresIn: 15 * 60, // seconds
      maxUploadSize: MAX_ATTACHMENT_SIZE,
    });
  } catch (error) {
    console.error('Error generating upload URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

router.post('/message/attachments/delete', async (req, res) => {
  try {
    const { key } = req.body || {};

    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'Attachment key is required' });
    }

    if (!key.startsWith('attachments/')) {
      return res.status(400).json({ error: 'Invalid attachment key' });
    }

    console.log("attempting to delete file with key:", key);
    await deleteFile(key);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

async function sendViaGmail(accessToken: string, message: any, attachmentLinks: any[]) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: "v1", auth });
  let cleanedBody = cleanEmailBody(message.body);

  const toRecipients = Array.isArray(message.to) ? message.to : [message.to];
  const ccRecipients = Array.isArray(message.cc) ? message.cc : (message.cc ? [message.cc] : []);
  const replyToAddress = message.replyTo || message.from;
  const senderName = buildSenderDisplayName(message.user, message.from);
  const encodedSenderName = senderName.replace(/"/g, '\\"');
  const fromHeader = `"${encodedSenderName}" <${message.from}>`;

  // Add attachment download links to email content
  if (attachmentLinks.length > 0) {
    const attachmentLinksHtml = attachmentLinks.map(att => 
      `<p>📎 ${att.filename} (${formatFileSize(att.size)}) - <a href="${att.url}">Download</a></p>`
    ).join('');
    
    // Add simple attachment section to the email body
    cleanedBody += `
      <p><strong>Attachments:</strong></p>
      ${attachmentLinksHtml}
    `;
  }

  const headerLines = [
    `To: ${toRecipients.join(", ")}`,
    ...(ccRecipients.length > 0 ? [`Cc: ${ccRecipients.join(", ")}`] : []),
    `From: ${fromHeader}`,
    ...(replyToAddress ? [`Reply-To: ${replyToAddress}`] : []),
    `Subject: ${message.subject}`,
  ];

  // Use simple HTML email without attachments (download links are in the content)
  const emailContent = [
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    cleanedBody
  ];

  const rawMessage = [...headerLines, ...emailContent].join("\r\n");
  
  console.log('Gmail email content with attachments:', cleanedBody);
  console.log('Gmail attachment links:', attachmentLinks);

  const encodedMessage = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodedMessage },
  });
}

async function sendViaMicrosoftGraph(accessToken: string, message: any, attachmentLinks: any[]) {
  let cleanedBody = cleanEmailBody(message.body);

  const toRecipients = Array.isArray(message.to) ? message.to : [message.to];
  const ccRecipients = Array.isArray(message.cc) ? message.cc : (message.cc ? [message.cc] : []);
  const replyToAddress = message.replyTo || message.from;
  const senderName = buildSenderDisplayName(message.user, message.from);

  // Add attachment download links to email content
  if (attachmentLinks.length > 0) {
    const attachmentLinksHtml = attachmentLinks.map(att => 
      `<p>📎 ${att.filename} (${formatFileSize(att.size)}) - <a href="${att.url}">Download</a></p>`
    ).join('');
    
    // Add simple attachment section to the email body
    cleanedBody += `
      <p><strong>Attachments:</strong></p>
      ${attachmentLinksHtml}
    `;
  }

  // Prepare Microsoft Graph email message
  const emailMessage = {
    message: {
      subject: message.subject,
      body: {
        contentType: 'HTML',
        content: cleanedBody
      },
      toRecipients: toRecipients.map((email: string) => ({
        emailAddress: {
          address: email
        }
      })),
      from: {
        emailAddress: {
          address: message.from,
          name: senderName
        }
      },
      ...(ccRecipients.length > 0 && {
        ccRecipients: ccRecipients.map((email: string) => ({
          emailAddress: {
            address: email
          }
        }))
      }),
      ...(replyToAddress && {
        replyTo: [{
          emailAddress: {
            address: replyToAddress,
            name: senderName
          }
        }]
      })
    },
    saveToSentItems: true
  };

  console.log('Microsoft Graph email content with attachments:', cleanedBody);
  console.log('Microsoft Graph attachment links:', attachmentLinks);
  console.log('Microsoft Graph email message:', JSON.stringify(emailMessage, null, 2));

  const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(emailMessage)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Microsoft Graph API error: ${response.status} - ${JSON.stringify(errorData)}`);
  }

  return response;
}
// Function to clean email body for proper HTML formatting
// Comprehensive font family mapping for email client compatibility
const FONT_FAMILY_MAP: Record<string, string> = {
  // Generic font families
  'sans-serif': 'Helvetica, Arial, sans-serif',
  'serif': "'Times New Roman', Times, serif",
  'monospace': "'Courier New', Courier, monospace",
  
  // Web-safe fonts (universally supported)
  'arial': 'Arial, Helvetica, sans-serif',
  'helvetica': 'Helvetica, Arial, sans-serif',
  'verdana': 'Verdana, Geneva, sans-serif',
  'tahoma': 'Tahoma, Geneva, sans-serif',
  'trebuchet-ms': "'Trebuchet MS', Helvetica, sans-serif",
  'georgia': 'Georgia, serif',
  'times-new-roman': "'Times New Roman', Times, serif",
  'courier-new': "'Courier New', Courier, monospace",
  'lucida-console': "'Lucida Console', Monaco, monospace",
  'lucida-sans-unicode': "'Lucida Sans Unicode', 'Lucida Grande', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  
  // Additional web-safe fonts
  'calibri': 'Calibri, Candara, Segoe, "Segoe UI", Optima, Arial, sans-serif',
  'cambria': 'Cambria, Georgia, serif',
  'candara': 'Candara, Calibri, Segoe, "Segoe UI", Optima, Arial, sans-serif',
  'consolas': 'Consolas, "Courier New", monospace',
  'constantia': 'Constantia, Georgia, serif',
  'corbel': 'Corbel, "Lucida Grande", "Lucida Sans Unicode", Arial, sans-serif',
  'garamond': 'Garamond, Baskerville, "Baskerville Old Face", "Hoefler Text", "Times New Roman", serif',
  'impact': 'Impact, "Arial Black", Gadget, sans-serif',
  'palatino': 'Palatino, "Palatino Linotype", "Book Antiqua", Baskerville, serif',
  'book-antiqua': '"Book Antiqua", Palatino, serif',
  'century-gothic': '"Century Gothic", sans-serif',
  'franklin-gothic-medium': '"Franklin Gothic Medium", "Arial Narrow", Arial, sans-serif',
  'gill-sans': '"Gill Sans", "Gill Sans MT", Calibri, "Trebuchet MS", sans-serif',
  'helvetica-neue': '"Helvetica Neue", Helvetica, Arial, sans-serif',
  'lucida-grande': '"Lucida Grande", "Lucida Sans Unicode", Arial, sans-serif',
  'ms-sans-serif': '"MS Sans Serif", Geneva, sans-serif',
  'ms-serif': '"MS Serif", "New York", serif',
  'segoe-ui': '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
  'comic-sans-ms': '"Comic Sans MS", cursive, sans-serif',
  'arial-black': '"Arial Black", Gadget, sans-serif',
  'arial-narrow': '"Arial Narrow", Arial, sans-serif',
  'arial-rounded-mt-bold': '"Arial Rounded MT Bold", Arial, sans-serif',
  'baskerville': 'Baskerville, "Baskerville Old Face", "Hoefler Text", Garamond, "Times New Roman", serif',
  'bodoni-mt': '"Bodoni MT", Didot, "Didot LT STD", "Hoefler Text", Garamond, "Times New Roman", serif',
  'brush-script-mt': '"Brush Script MT", cursive',
  'copperplate': 'Copperplate, "Copperplate Gothic Light", fantasy',
  'copperplate-gothic-bold': '"Copperplate Gothic Bold", Copperplate, fantasy',
  'didot': 'Didot, "Didot LT STD", "Hoefler Text", Garamond, "Times New Roman", serif',
  'futura': 'Futura, "Trebuchet MS", Arial, sans-serif',
  'geneva': 'Geneva, Tahoma, Verdana, sans-serif',
  'goudy-old-style': '"Goudy Old Style", Garamond, "Times New Roman", serif',
  'hoefler-text': '"Hoefler Text", "Baskerville Old Face", Garamond, "Times New Roman", serif',
  'lucida-bright': '"Lucida Bright", Georgia, serif',
  'lucida-calligraphy': '"Lucida Calligraphy", cursive',
  'lucida-handwriting': '"Lucida Handwriting", cursive',
  'lucida-typewriter': '"Lucida Typewriter", "Courier New", monospace',
  'monaco': 'Monaco, "Lucida Console", monospace',
  'optima': 'Optima, "Segoe UI", Tahoma, sans-serif',
  'papyrus': 'Papyrus, fantasy',
  'rockwell': 'Rockwell, "Courier Bold", Courier, Georgia, Times, "Times New Roman", serif',
  'snell-roundhand': '"Snell Roundhand", "Brush Script MT", cursive, fantasy',
  
  // Google Fonts (supported in Gmail and some clients)
  'roboto': '"Roboto", Arial, sans-serif',
  'open-sans': '"Open Sans", Arial, sans-serif',
  'lato': '"Lato", Arial, sans-serif',
  'montserrat': '"Montserrat", Arial, sans-serif',
  'source-sans-pro': '"Source Sans Pro", Arial, sans-serif',
  'raleway': '"Raleway", Arial, sans-serif',
  'pt-sans': '"PT Sans", Arial, sans-serif',
  'oswald': '"Oswald", Arial, sans-serif',
  'lora': '"Lora", Georgia, serif',
  'merriweather': '"Merriweather", Georgia, serif',
  'playfair-display': '"Playfair Display", Georgia, serif',
  'nunito': '"Nunito", Arial, sans-serif',
  'dancing-script': '"Dancing Script", cursive',
  'indie-flower': '"Indie Flower", cursive',
  'pacifico': '"Pacifico", cursive',
  'lobster': '"Lobster", cursive',
  'shadows-into-light': '"Shadows Into Light", cursive',
  'kaushan-script': '"Kaushan Script", cursive',
  'righteous': '"Righteous", cursive',
  'bangers': '"Bangers", cursive',
  'fredoka-one': '"Fredoka One", cursive',
  'comfortaa': '"Comfortaa", cursive',
  'quicksand': '"Quicksand", sans-serif',
  'poppins': '"Poppins", sans-serif',
  'ubuntu': '"Ubuntu", sans-serif',
  'noto-sans': '"Noto Sans", sans-serif',
  'noto-serif': '"Noto Serif", serif',
  'crimson-text': '"Crimson Text", serif',
  'libre-baskerville': '"Libre Baskerville", serif',
  'work-sans': '"Work Sans", sans-serif',
  'inter': '"Inter", sans-serif',
  'dm-sans': '"DM Sans", sans-serif',
  'dm-serif': '"DM Serif", serif',
  'space-grotesk': '"Space Grotesk", sans-serif',
  'space-mono': '"Space Mono", monospace',
  'jetbrains-mono': '"JetBrains Mono", monospace',
  'fira-code': '"Fira Code", monospace',
  'source-code-pro': '"Source Code Pro", monospace'
};

const SIZE_MAP: Record<string, string> = {
  small: '0.75em',
  large: '1.5em',
  huge: '2.5em',
};

const ALIGN_MAP: Record<string, string> = {
  center: 'center',
  right: 'right',
  justify: 'justify',
};

const ensureStyleTerminated = (style: string): string => {
  const trimmed = style.trim();
  if (!trimmed) return '';
  return trimmed.endsWith(';') ? `${trimmed} ` : `${trimmed}; `;
};

// Detect which Google Fonts are used in the email content
function detectGoogleFonts(htmlContent: string): string[] {
  console.log('detectGoogleFonts called with content length:', htmlContent.length);
  
  const googleFontNames = [
    'roboto', 'open-sans', 'lato', 'montserrat', 'source-sans-pro', 'raleway',
    'pt-sans', 'oswald', 'lora', 'merriweather', 'playfair-display', 'nunito',
    'dancing-script', 'indie-flower', 'pacifico', 'lobster', 'shadows-into-light',
    'kaushan-script', 'righteous', 'bangers', 'fredoka-one', 'comfortaa',
    'quicksand', 'poppins', 'ubuntu', 'noto-sans', 'noto-serif', 'crimson-text',
    'libre-baskerville', 'work-sans', 'inter', 'dm-sans', 'dm-serif',
    'space-grotesk', 'space-mono', 'jetbrains-mono', 'fira-code', 'source-code-pro'
  ];
  
  const usedFonts: string[] = [];
  
  googleFontNames.forEach(fontName => {
    // Check for both lowercase and capitalized font names in font-family declarations
    const capitalizedFontName = fontName.charAt(0).toUpperCase() + fontName.slice(1);
    
    // Create regex patterns to match font-family declarations containing the font name
    const patterns = [
      new RegExp(`font-family:\\s*["']?${fontName}["']?`, 'i'),
      new RegExp(`font-family:\\s*["']?${capitalizedFontName}["']?`, 'i'),
      new RegExp(`font-family:\\s*["']?${fontName.replace('-', ' ')}["']?`, 'i'),
      new RegExp(`font-family:\\s*["']?${capitalizedFontName.replace('-', ' ')}["']?`, 'i')
    ];
    
    const isUsed = patterns.some(pattern => pattern.test(htmlContent));
    if (isUsed) {
      console.log(`Google Font detected: ${fontName}`);
      usedFonts.push(fontName);
    }
  });
  
  console.log('Total Google Fonts detected:', usedFonts.length);
  return usedFonts;
}

// Generate complete HTML email with Google Fonts support
function generateEmailHTML(body: string, googleFonts: string[]): string {
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Email</title>`;
  
  // Add Google Fonts if they're used
  if (googleFonts.length > 0) {
    html += `
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`;
    
    // Create Google Fonts URL for used fonts
    const fontFamilies = googleFonts.map(font => {
      const fontMap: Record<string, string> = {
        'roboto': 'Roboto:wght@300;400;500;700',
        'open-sans': 'Open+Sans:wght@300;400;600;700',
        'lato': 'Lato:wght@300;400;700',
        'montserrat': 'Montserrat:wght@300;400;500;600;700',
        'source-sans-pro': 'Source+Sans+Pro:wght@300;400;600;700',
        'raleway': 'Raleway:wght@300;400;500;600;700',
        'pt-sans': 'PT+Sans:wght@400;700',
        'oswald': 'Oswald:wght@300;400;500;600;700',
        'lora': 'Lora:wght@400;500;600;700',
        'merriweather': 'Merriweather:wght@300;400;700',
        'playfair-display': 'Playfair+Display:wght@400;500;600;700',
        'nunito': 'Nunito:wght@300;400;500;600;700',
        'dancing-script': 'Dancing+Script:wght@400;500;600;700',
        'indie-flower': 'Indie+Flower',
        'pacifico': 'Pacifico',
        'lobster': 'Lobster',
        'shadows-into-light': 'Shadows+Into+Light',
        'kaushan-script': 'Kaushan+Script',
        'righteous': 'Righteous',
        'bangers': 'Bangers',
        'fredoka-one': 'Fredoka+One',
        'comfortaa': 'Comfortaa:wght@300;400;500;600;700',
        'quicksand': 'Quicksand:wght@300;400;500;600;700',
        'poppins': 'Poppins:wght@300;400;500;600;700',
        'ubuntu': 'Ubuntu:wght@300;400;500;700',
        'noto-sans': 'Noto+Sans:wght@300;400;500;600;700',
        'noto-serif': 'Noto+Serif:wght@400;500;600;700',
        'crimson-text': 'Crimson+Text:wght@400;600;700',
        'libre-baskerville': 'Libre+Baskerville:wght@400;700',
        'work-sans': 'Work+Sans:wght@300;400;500;600;700',
        'inter': 'Inter:wght@300;400;500;600;700',
        'dm-sans': 'DM+Sans:wght@300;400;500;600;700',
        'dm-serif': 'DM+Serif:wght@400;500;600;700',
        'space-grotesk': 'Space+Grotesk:wght@300;400;500;600;700',
        'space-mono': 'Space+Mono:wght@400;700',
        'jetbrains-mono': 'JetBrains+Mono:wght@300;400;500;600;700',
        'fira-code': 'Fira+Code:wght@300;400;500;600;700',
        'source-code-pro': 'Source+Code+Pro:wght@300;400;500;600;700'
      };
      return fontMap[font] || font;
    });
    
    html += `
      <link href="https://fonts.googleapis.com/css2?${fontFamilies.join('&')}&display=swap" rel="stylesheet">`;
  }
  
  html += `
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #ffffff;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        ${body}
      </div>
    </body>
    </html>`;
  
  return html;
}

function cleanEmailBody(body: string): string {
  console.log('Original email body:', body);
  const $ = load(body);

  // Process Quill editor classes and convert them to inline styles for email compatibility
  $('[class]').each((_idx, el) => {
    const element = $(el);
    const classAttr = element.attr('class') || '';
    const classes = classAttr.split(/\s+/).filter(Boolean);
    const remainingClasses: string[] = [];

    classes.forEach((cls) => {
      if (cls.startsWith('ql-font-')) {
        // Convert Quill font classes to inline font-family styles
        const key = cls.replace('ql-font-', '');
        const family = FONT_FAMILY_MAP[key];
        console.log(`Processing font class: ${cls}, key: ${key}, family: ${family}`);
        if (family) {
          const existingStyle = element.attr('style') || '';
          const merged = `${ensureStyleTerminated(existingStyle)}font-family: ${family};`;
          element.attr('style', merged.trim());
        }
      } else if (cls.startsWith('ql-size-')) {
        const key = cls.replace('ql-size-', '');
        const size = SIZE_MAP[key];
        if (size) {
          const existingStyle = element.attr('style') || '';
          const merged = `${ensureStyleTerminated(existingStyle)}font-size: ${size};`;
          element.attr('style', merged.trim());
        } else {
          remainingClasses.push(cls);
        }
      } else if (cls.startsWith('ql-align-')) {
        const key = cls.replace('ql-align-', '');
        const align = ALIGN_MAP[key];
        if (align) {
          const existingStyle = element.attr('style') || '';
          const merged = `${ensureStyleTerminated(existingStyle)}text-align: ${align};`;
          element.attr('style', merged.trim());
        } else {
          remainingClasses.push(cls);
        }
      } else {
        remainingClasses.push(cls);
      }
    });

    if (remainingClasses.length) {
      element.attr('class', remainingClasses.join(' '));
    } else {
      element.removeAttr('class');
    }
  });

  $('p').each((_idx, el) => {
    const element = $(el);
    const existingStyle = element.attr('style') || '';
    const merged = `${ensureStyleTerminated(existingStyle)}margin: 0;`;
    element.attr('style', merged.trim());
  });

  $('p').each((_idx, el) => {
    const element = $(el);
    if (element.html()?.trim() === '<br>') {
      element.replaceWith('<span style="display:block; height:8px;"></span>');
    }
  });

  // Return inner HTML without wrapping html/body tags
  const processedBody = $('body').html() || body;
  console.log('Processed email body:', processedBody);
  return processedBody;
}

// 1. Create a new message
router.post('/message', async (req, res) => {
  const { userId, investorId, to, cc, subject, from, body, status = 'DRAFT' } = req.body;
  console.log('Received create message request:', req.body);
  console.log('CC field received:', cc, 'Type:', typeof cc);

  try {
    // Validate required fields
    if (!userId || !investorId || !to || !subject || !from || !body) {
      return res.status(400).json({ 
        error: 'Missing required fields: userId, investorId, to, subject, from, body' 
      });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    let message;

    if (status === 'DRAFT') {
      // Either update existing draft or create new one
      const existing = await prisma.message.findFirst({
        where: { userId, investorId, status: 'DRAFT' }
      });

      if (existing) {
        message = await prisma.message.update({
          where: { id: existing.id },
          data: { to, cc: Array.isArray(cc) ? cc : (cc ? cc.split(',').map((email: string) => email.trim()) : []), subject, from, body 
          }
        });
      } else {
        message = await prisma.message.create({
          data: { userId, investorId, to, cc: Array.isArray(cc) ? cc : (cc ? cc.split(',').map((email: string) => email.trim()) : []), subject, from, body, status: 'DRAFT' }
        });
      }
    } else {
      // Always create new for SENT or FAILED
      message = await prisma.message.create({
        data: { userId, investorId, to, cc: Array.isArray(cc) ? cc : (cc ? cc.split(',').map((email: string) => email.trim()) : []), subject, from, body,  status }
      });
    }

    res.status(201).json({ message: 'Message saved successfully', data: message });
  } catch (error) {
    console.error('Error creating message:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 2. Update an existing message
router.put('/message/:messageId', async (req, res) => {
    
  const { messageId } = req.params;
  const { to, cc, subject, from, body, status } = req.body;
  console.log('Received update message request:', req.body);
  console.log('CC field received:', cc, 'Type:', typeof cc);

  try {
    // Check if message exists
    const existingMessage = await prisma.message.findUnique({
      where: { id: messageId }
    });

    if (!existingMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Update the message
    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: {
        ...(to !== undefined && { to }),
        ...(cc !== undefined && { 
          cc: Array.isArray(cc) ? cc : (cc ? cc.split(',').map((email: string) => email.trim()) : [])
        }),
        ...(subject !== undefined && { subject }),
        ...(from !== undefined && { from }),
        ...(body !== undefined && { body }),
        ...(status !== undefined && { status: status as 'DRAFT' | 'SENT' | 'FAILED' })
      }
    });

    res.json({
      message: 'Message updated successfully',
      data: updatedMessage
    });
  } catch (error) {
    console.error('Error updating message:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 3. Get all draft messages for a user
router.get('/messages/draft/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get all draft messages for the user
    const draftMessages = await prisma.message.findMany({
      where: {
        userId: userId,
        status: 'DRAFT'
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    res.json({
      message: 'Draft messages retrieved successfully',
      count: draftMessages.length,
      data: draftMessages
    });
  } catch (error) {
    console.error('Error fetching draft messages:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 4. Get all sent messages for a user
router.get('/messages/sent/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get all sent messages for the user
    const sentMessages = await prisma.message.findMany({
      where: {
        userId: userId,
        status: 'SENT'
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    res.json({
      message: 'Sent messages retrieved successfully',
      count: sentMessages.length,
      data: sentMessages
    });
  } catch (error) {
    console.error('Error fetching sent messages:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/messages/answered/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get all sent messages for the user
    const sentMessages = await prisma.message.findMany({
      where: {
        userId: userId,
        status: 'ANSWERED'
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    res.json({
      message: 'Sent messages retrieved successfully',
      count: sentMessages.length,
      data: sentMessages
    });
  } catch (error) {
    console.error('Error fetching answered messages:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
// 5. Send message via email
router.post('/message/:messageId/send', upload.any(), async (req, res) => {
  const { messageId } = req.params;
  console.log('Received send message request for messageId:', messageId);

  try {
    // Check if SendGrid API key is configured
    if (!process.env.SENDGRID_API_KEY) {
      return res.status(500).json({ error: 'SendGrid API key not configured' });
    }

    console.log('SendGrid API Key configured:', process.env.SENDGRID_API_KEY ? 'Yes' : 'No');
    console.log('API Key length:', process.env.SENDGRID_API_KEY?.length);

    // Parse FormData/JSON attachments
    const emailAttachments = []; // For email sending (download links)
    const b2Attachments = []; // Store storage metadata for database
    console.log('Processing attachments from request payload...');

    const processedKeys = new Set<string>();
    const rawAttachmentsData = (req.body && (req.body.attachments ?? req.body.attachmentMetadata)) || null;
    let attachmentMetadata: any[] = [];

    if (Array.isArray(rawAttachmentsData)) {
      attachmentMetadata = rawAttachmentsData;
    } else if (typeof rawAttachmentsData === 'string' && rawAttachmentsData.trim().length > 0) {
      try {
        attachmentMetadata = JSON.parse(rawAttachmentsData);
      } catch (error) {
        console.error('Failed to parse attachment metadata:', error);
      }
    } else if (rawAttachmentsData && typeof rawAttachmentsData === 'object') {
      attachmentMetadata = [rawAttachmentsData];
    }

    const processAttachmentMetadata = async (metadata: any) => {
      if (!metadata) return;

      const filename = metadata.filename || metadata.name || 'attachment';
      const mimeType = metadata.type || metadata.contentType || 'application/octet-stream';
      const size = Number(metadata.size) || 0;
      const key = metadata.key || metadata.storageKey || metadata.s3Key;
      let url = metadata.url;

      if (key) {
        if (processedKeys.has(key)) {
          return;
        }
        processedKeys.add(key);

        if (!url) {
          try {
            url = await getFileUrl(key, 86400);
          } catch (error) {
            console.error(`Failed to generate download URL for key ${key}:`, error);
          }
        }
      }

      if (!url && !key) {
        console.warn('Skipping attachment metadata without key or url:', metadata);
        return;
      }

      const attachmentInfo: any = {
        filename,
        type: mimeType,
        size,
        url,
      };

      if (key) {
        attachmentInfo.key = key;
      }

      b2Attachments.push(attachmentInfo);

      if (url) {
        emailAttachments.push({
          filename,
          type: mimeType,
          url,
          size,
        });
      }
    };

    if (attachmentMetadata.length > 0) {
      for (const metadata of attachmentMetadata) {
        await processAttachmentMetadata(metadata);
      }
    }
    
    // Check if req.files has attachment files (from multer)
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        // Only process files that are actual attachments (not other form fields)
        if (file.fieldname.startsWith('attachment_') || file.fieldname === 'attachments') {
          const originalName = sanitizeFilename(file.originalname || 'attachment');
          console.log(`Processing attachment:`, originalName, file.size, file.mimetype);
          
          // Upload to B2 storage
          const fileKey = `attachments/${Date.now()}-${originalName}`;
          await uploadFile(file.buffer, fileKey, file.mimetype);
          processedKeys.add(fileKey);
          
          // Store B2 file metadata for database (URLs only)
          const b2FileInfo = {
            key: fileKey,
            filename: originalName || 'attachment',
            type: file.mimetype,
            size: file.size,
            url: await getFileUrl(fileKey, 86400) // 24 hours expiry
          };
          b2Attachments.push(b2FileInfo);
          
          console.log(`B2 file uploaded: ${fileKey}`);
          console.log(`B2 URL generated: ${b2FileInfo.url}`);
          
          // For email sending, we'll include download links instead of base64 content
          // This is more efficient and avoids email size limits
          emailAttachments.push({
            filename: file.originalname || 'attachment',
            type: file.mimetype,
            url: b2FileInfo.url, // Use B2 URL instead of base64
            size: file.size
          });
        }
      }
    }
    
    console.log(`Total attachments processed: ${emailAttachments.length}`);
    console.log('Email attachments for sending:', JSON.stringify(emailAttachments, null, 2));
    // Get the message
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        user: true,
      },
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if message is already sent
    if (message.status === 'SENT') {
      return res.status(400).json({ error: 'Message has already been sent' });
    }

    // Check for Google OAuth tokens first
    let googleTokens;
    try {
      googleTokens = await clerkClient.users.getUserOauthAccessToken(
        message.user.id,
        "oauth_google"
      );
    } catch (error) {
      console.log('No Google OAuth tokens found, checking Microsoft...');
    }

    // Check for Microsoft OAuth tokens if no Google tokens
    let microsoftTokens;
    if (!googleTokens?.data || googleTokens.data.length === 0) {
      try {
        microsoftTokens = await clerkClient.users.getUserOauthAccessToken(
          message.user.id,
          "oauth_microsoft"
        );
      } catch (error) {
        console.log('No Microsoft OAuth tokens found either, will use SendGrid fallback...');
      }
    }

    // Prepare email data
    const cleanBody = cleanEmailBody(message.body);
    
    // Check if Google Fonts are used in the email body
    const googleFonts = detectGoogleFonts(cleanBody);
    console.log('Detected Google Fonts:', googleFonts);
    console.log('Clean body for font detection:', cleanBody.substring(0, 500) + '...');
    
    // Generate HTML with proper font support and attachment links
    let htmlContent = generateEmailHTML(cleanBody, googleFonts);
    
    // Add attachment download links to email content
    if (emailAttachments.length > 0) {
      const attachmentLinks = emailAttachments.map(att => 
        `<p>📎 ${att.filename} (${formatFileSize(att.size)}) - <a href="${att.url}">Download</a></p>`
      ).join('');
      
      // Add simple attachment section
      const attachmentSection = `
        <p><strong>Attachments:</strong></p>
        ${attachmentLinks}
      `;
      
      // Try to insert before </body>, if not found, append to the end
      if (htmlContent.includes('</body>')) {
        htmlContent = htmlContent.replace('</body>', `${attachmentSection}</body>`);
      } else {
        htmlContent += attachmentSection;
      }
    }

    if (googleTokens?.data && googleTokens.data.length > 0) {
      // --- Use Gmail API ---
      const accessToken = googleTokens.data[0].token;
      await sendViaGmail(accessToken, message, emailAttachments);
      console.log('Email sent via Gmail API');
    } else if (microsoftTokens?.data && microsoftTokens.data.length > 0) {
      // --- Use Microsoft Graph API ---
      const accessToken = microsoftTokens.data[0].token;
      await sendViaMicrosoftGraph(accessToken, message, emailAttachments);
      console.log('Email sent via Microsoft Graph API');
    } else {
      // --- Fallback to SendGrid ---
      const senderName = buildSenderDisplayName(message.user, message.from);
      const emailData = {
        to: Array.isArray(message.to) ? message.to : [message.to],
        ...(message.cc && message.cc.length > 0 && {
          cc: message.cc
        }),
        from: {
          email: 'info@venturestrat.ai',
          name: senderName
        },
        replyTo: message.from,
        subject: message.subject,
        text: message.body,
        html: `
          <div>
            <div>
              ${htmlContent}
            </div>
          </div>
        `,
        // No attachments - using download links instead
      };

      console.log('Sending email via SendGrid:', {
        to: Array.isArray(message.to) ? message.to : [message.to],
        ...(message.cc && message.cc.length > 0 && {
          cc: message.cc
        }),
        from: 'info@venturestrat.ai',
        subject: message.subject,
        body: cleanBody
      });
      
      console.log('CC recipients:', message.cc);
      console.log('Email data for SendGrid:', JSON.stringify(emailData, null, 2));

      // Send email via SendGrid
      await sgMail.send(emailData);
      console.log('Email sent via SendGrid');
    }

    // Update message status to SENT and store B2 attachment metadata
    const updateData: any = { 
      status: 'SENT',
      attachments: b2Attachments // Store B2 file metadata
    };
    
    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: updateData
    });

    // Update shortlist status to CONTACTED if not already contacted
    const shortlist = await prisma.shortlist.findFirst({
      where: {
        userId: message.userId,
        investorId: message.investorId
      }
    });

    if (shortlist && shortlist.status !== 'CONTACTED') {
      await prisma.shortlist.update({
        where: { id: shortlist.id },
        data: { status: 'CONTACTED' }
      });
    }

    res.json({
      message: 'Email sent successfully',
      data: updatedMessage
    });

  } catch (error: any) {
    console.error('Error sending email:', error);
    console.error('Error response:', error.response?.data);
    console.error('Error status:', error.code);
    
    // Update message status to FAILED if it's a SendGrid error
    if (error.response) {
      await prisma.message.update({
        where: { id: messageId },
        data: { status: 'FAILED' }
      });
    }

    // Provide user-friendly error messages based on error type
    let errorMessage = 'Failed to send email. Please try again.';
    let statusCode = 500;
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      errorMessage = 'File size too large. Please select files smaller than 75MB.';
      statusCode = 413;
    } else if (error.code === 'LIMIT_FILE_COUNT') {
      errorMessage = 'Too many files attached. Please reduce the number of attachments.';
      statusCode = 413;
    } else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      errorMessage = 'Invalid file type detected. Please check your attachments.';
      statusCode = 400;
    } else if (error.response?.status === 413) {
      errorMessage = 'Request too large. Please reduce file sizes and try again.';
      statusCode = 413;
    } else if (error.message?.includes('network') || error.message?.includes('timeout')) {
      errorMessage = 'Network error occurred. Please check your connection and try again.';
      statusCode = 503;
    } else if (error.message?.includes('authentication') || error.message?.includes('unauthorized')) {
      errorMessage = 'Authentication failed. Please reconnect your email account.';
      statusCode = 401;
    } else if (error.response?.body?.errors) {
      // SendGrid specific errors
      const sendGridErrors = error.response.body.errors;
      if (Array.isArray(sendGridErrors) && sendGridErrors.length > 0) {
        errorMessage = `Email sending failed: ${sendGridErrors[0].message}`;
      }
    }

    res.status(statusCode).json({ 
      error: 'Failed to send email',
      message: errorMessage,
      details: error.response?.body?.errors || error.message,
      statusCode: error.code,
      fullError: error.response?.data
    });
  }
});

router.get('/message/:messageId', async (req, res) => {
  const { messageId } = req.params;
  console.log('Received message show request for messageId:', messageId);

  try {
    const message = await prisma.message.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json({
      message
    });

  } catch (error: any) {
    console.error('Error fetching message:', error);
    res.status(500).json({ 
      error: 'Failed to fetch message',
      details: error.message
    });
  }
});

export default router;
