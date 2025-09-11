import { Router } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import sgMail from '@sendgrid/mail';

const router = Router();
const prisma = new PrismaClient();

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

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
      where: { id: messageId }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if message is already sent
    if (message.status === 'SENT') {
      return res.status(400).json({ error: 'Message has already been sent' });
    }

    // Prepare email data
    const emailData = {
      to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
      from: 'ikram.akram@xcorebit.com',
      subject: message.subject,
      text: message.body,
      html: `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
               <h2>${message.subject}</h2>
               <div style="margin-top: 20px;">
                 ${message.body.replace(/\n/g, '<br>')}
               </div>
             </div>`
    };

    console.log('Sending email:', {
      to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
      from: message.from,
      subject: message.subject
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
