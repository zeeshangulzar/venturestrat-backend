// src/routes/webhooks.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { Webhook } from 'svix';

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

export default router;
