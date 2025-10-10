import { Router } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import sgMail from '@sendgrid/mail';

const router = Router();
const prisma = new PrismaClient();

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

// Function to clean email body for proper HTML formatting
function cleanEmailBody(body: string): string {
  let cleanBody = body
    // Replace font classes with data-font markers
    .replace(/class="ql-font-monospace"/g, 'data-font="monospace"')
    .replace(/class="ql-font-serif"/g, 'data-font="serif"')
    .replace(/class="ql-font-sans-serif"/g, 'data-font="sans-serif"')

    // Replace size classes with data-size markers
    .replace(/class="ql-size-small"/g, 'data-size="small"')
    .replace(/class="ql-size-large"/g, 'data-size="large"')
    .replace(/class="ql-size-huge"/g, 'data-size="huge"')

    // Replace alignment classes with data-align markers
    .replace(/class="ql-align-center"/g, 'data-align="center"')
    .replace(/class="ql-align-right"/g, 'data-align="right"')
    .replace(/class="ql-align-justify"/g, 'data-align="justify"');

  // Merge data-font into style (preserve old styles)
  cleanBody = cleanBody.replace(
    /style="([^"]*)"([^>]*)data-font="([^"]+)"/g,
    (match, existingStyles, rest, font) => {
      const safeStyles = existingStyles.trim().replace(/;?$/, ';');
      return `style="${safeStyles} font-family: ${font};"${rest}`;
    }
  );

  // Merge data-size into style (preserve old styles)
  cleanBody = cleanBody.replace(
    /style="([^"]*)"([^>]*)data-size="([^"]+)"/g,
    (match, existingStyles, rest, size) => {
      const safeStyles = existingStyles.trim().replace(/;?$/, ';');
      let fontSize = 'inherit';
      if (size === 'small') fontSize = '0.75em';
      if (size === 'large') fontSize = '1.5em';
      if (size === 'huge') fontSize = '2.5em';
      return `style="${safeStyles} font-size: ${fontSize};"${rest}`;
    }
  );

  // Merge data-align into style (preserve old styles)
  cleanBody = cleanBody.replace(
    /style="([^"]*)"([^>]*)data-align="([^"]+)"/g,
    (match, existingStyles, rest, align) => {
      const safeStyles = existingStyles.trim().replace(/;?$/, ';');
      return `style="${safeStyles} text-align: ${align};"${rest}`;
    }
  );

  // Cleanup any leftover data-* attributes without styles
  cleanBody = cleanBody
    .replace(/data-font="([^"]+)"/g, 'style="font-family: $1;"')
    .replace(/data-size="small"/g, 'style="font-size: 0.75em;"')
    .replace(/data-size="large"/g, 'style="font-size: 1.5em;"')
    .replace(/data-size="huge"/g, 'style="font-size: 2.5em;"')
    .replace(/data-align="center"/g, 'style="text-align: center;"')
    .replace(/data-align="right"/g, 'style="text-align: right;"')
    .replace(/data-align="justify"/g, 'style="text-align: justify;"');

  cleanBody = cleanBody.replace(/<p><br><\/p>/g, '<span style="display:block; height:8px;"></span>');
  cleanBody = cleanBody.replace(/<p>/g, '<p style="margin: 0;">');

  return cleanBody;
}

// 1. Create a new message
router.post('/message', async (req, res) => {
  const { userId, investorId, to, subject, from, body, status = 'DRAFT' } = req.body;
  console.log('Received create message request:', req.body);

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
          data: { to, subject, from, body }
        });
      } else {
        message = await prisma.message.create({
          data: { userId, investorId, to, subject, from, body, status: 'DRAFT' }
        });
      }
    } else {
      // Always create new for SENT or FAILED
      message = await prisma.message.create({
        data: { userId, investorId, to, subject, from, body, status }
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
  const { to, subject, from, body, status } = req.body;
  console.log('Received update message request:', req.body);

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
router.post('/message/:messageId/send', async (req, res) => {
  const { messageId } = req.params;
  console.log('Received send message request for messageId:', messageId);

  try {
    // Check if SendGrid API key is configured
    if (!process.env.SENDGRID_API_KEY) {
      return res.status(500).json({ error: 'SendGrid API key not configured' });
    }

    console.log('SendGrid API Key configured:', process.env.SENDGRID_API_KEY ? 'Yes' : 'No');
    console.log('API Key length:', process.env.SENDGRID_API_KEY?.length);

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
      to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
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
      `
    };

    console.log('Sending email:', {
      to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
      from: 'info@venturestrat.ai',
      subject: message.subject,
      body: cleanBody
    });

    // Send email via SendGrid
    await sgMail.send(emailData);

    // Update message status to SENT
    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: { status: 'SENT' }
    });

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
