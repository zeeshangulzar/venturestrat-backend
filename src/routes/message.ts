import { Router } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import sgMail from '@sendgrid/mail';
import multer from 'multer';
import { load } from 'cheerio';

const router = Router();
const prisma = new PrismaClient();

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

// Configure multer for handling file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Function to clean email body for proper HTML formatting
const FONT_FAMILY_MAP: Record<string, string> = {
  'sans-serif': 'Helvetica, Arial, sans-serif',
  'serif': "'Times New Roman', Times, serif",
  'monospace': "'Courier New', Courier, monospace",
  'arial': 'Arial, Helvetica, sans-serif',
  'georgia': 'Georgia, serif',
  'times-new-roman': "'Times New Roman', Times, serif",
  'tahoma': 'Tahoma, Geneva, sans-serif',
  'verdana': 'Verdana, Geneva, sans-serif',
  'courier-new': "'Courier New', Courier, monospace",
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

function cleanEmailBody(body: string): string {
  const $ = load(body, { decodeEntities: false });

  $('[class]').each((_idx, el) => {
    const element = $(el);
    const classAttr = element.attr('class') || '';
    const classes = classAttr.split(/\s+/).filter(Boolean);
    const remainingClasses: string[] = [];

    classes.forEach((cls) => {
      if (cls.startsWith('ql-font-')) {
        const key = cls.replace('ql-font-', '');
        const family = FONT_FAMILY_MAP[key];
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
  return $('body').html() || body;
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

    // Parse FormData attachments
    const attachments = [];
    console.log('Processing attachments from FormData...');
    
    // Check if req.files has attachment files (from multer)
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        // Only process files that are actual attachments (not other form fields)
        if (file.fieldname.startsWith('attachment_') || file.fieldname === 'attachments') {
          console.log(`Processing attachment:`, file.originalname, file.size, file.mimetype);
          
          // Convert to base64 for SendGrid
          const base64Content = file.buffer.toString('base64');
          attachments.push({
            content: base64Content,
            filename: file.originalname || 'attachment',
            type: file.mimetype,
            disposition: 'attachment'
          });
        }
      }
    }
    
    console.log(`Total attachments processed: ${attachments.length}`);

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

    // Prepare email data
    const cleanBody = cleanEmailBody(message.body);

    const emailData = {
      to: Array.isArray(message.to) ? message.to : [message.to],
      ...(message.cc && message.cc.length > 0 && {
        cc: message.cc
      }),
      from: {
        email: 'info@venturestrat.ai',
        name: message.user.firstname + ' ' + message.user.lastname
      },
      replyTo: message.from,
      subject: message.subject,
      text: message.body,
      html: `
        <div>
          <div>
            ${cleanBody}
          </div>
        </div>
      `,
      attachments: attachments
    };

    console.log('Sending email:', {
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

    // Update message status to SENT
    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: { status: 'SENT' }
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

    res.status(500).json({ 
      error: 'Failed to send email',
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
