import express from "express";
import cors from "cors";
import dotenv from 'dotenv';
import multer from 'multer';
import { PrismaClient, MessageStatus } from '@prisma/client';
import investorRoutes from './routes/investor.js';
import userRoutes from './routes/user.js';
import shortlistRoutes from './routes/shortlist.js'
import webhookRoutes from './routes/webhooks.js'
import messageRoutes from './routes/message.js'
import onboardingRoutes from './routes/onboarding.js'
import './workers/emailWorker.js';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { ExpressAdapter } from '@bull-board/express';
import { emailQueue, queueEvents } from './services/emailQueue.js';
import subscriptionRoutes from './routes/subscription.js'
// import verifyUser from 'middleware/verifyUser';
dotenv.config();

const prisma = new PrismaClient();
const allowedOrigins = [
  process.env.FRONTEND_URL_PROD,
  process.env.FRONTEND_URL_LOCAL,
].filter(Boolean);
console.log('Allowed origins:', allowedOrigins);
const app = express();
const port = process.env.PORT || 3001;

// Start the email worker
console.log('📧 Email worker started');
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.removeHeader("X-Powered-By");
  next();
});

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  })
);
app.use(express.json());

app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, max-age=0, private"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

// Configure multer for handling file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

app.use('/api', investorRoutes); 
app.use('/api', userRoutes);
app.use('/api', shortlistRoutes); 
app.use('/api', webhookRoutes);
app.use('/api', messageRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api', subscriptionRoutes);

// Bull Board for monitoring BullMQ jobs (scheduled emails, processing state, etc.)
const bullBoardAdapter = new ExpressAdapter();
bullBoardAdapter.setBasePath('/admin/queues');

const bullQueueAdapter = new BullMQAdapter(emailQueue as any) as any;

createBullBoard({
  queues: [bullQueueAdapter],
  serverAdapter: bullBoardAdapter,
});

app.use('/admin/queues', bullBoardAdapter.getRouter());

// When a job is removed via Bull Board (or any other mechanism), revert the
// associated message back to draft so the UI reflects the change immediately.
queueEvents.on('removed', async ({ jobId }) => {
  if (!jobId) {
    return;
  }

  try {
    const existingMessage = await prisma.message.findUnique({
      where: { id: jobId.toString() },
    });

    if (!existingMessage) {
      console.log(`🗑️  Queue job ${jobId} removed – no corresponding message found (likely already deleted).`);
      return;
    }

    await prisma.message.update({
      where: { id: jobId.toString() },
      data: {
        scheduledFor: null,
      },
    });
    console.log(`🗑️  Queue job ${jobId} removed – message status reverted to DRAFT`);
  } catch (error) {
    console.error(`Failed to revert message for removed job ${jobId}:`, error);
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`🚀 Backend running at http://localhost:${port}`);
});
