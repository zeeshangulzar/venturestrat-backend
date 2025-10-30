import { Queue, QueueEvents, Job } from 'bullmq';
import { RedisOptions } from 'ioredis';

// Redis connection configuration
const connection: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  ...(process.env.REDIS_URL ? { url: process.env.REDIS_URL } : {}),
  maxRetriesPerRequest: null,
};

// Create queue
export const emailQueue = new Queue('email-queue', {
  connection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

// Create queue events for monitoring
export const queueEvents = new QueueEvents('email-queue', {
  connection,
});

// Interface for scheduled email job data
export interface ScheduledEmailJob {
  messageId: string;
  userId: string;
  investorId: string;
  to: string | string[];
  cc?: string | string[];
  subject: string;
  from: string;
  body: string;
  attachments?: Array<{
    key: string;
    filename: string;
    type: string;
    size: number;
    url: string;
  }>;
  threadId?: string; // For Gmail thread replies
  previousMessageId?: string | null;
}

// Add a scheduled email job
export async function scheduleEmail(
  scheduledFor: Date,
  data: ScheduledEmailJob
): Promise<Job<ScheduledEmailJob>> {
  const delay = scheduledFor.getTime() - Date.now();
  
  if (delay <= 0) {
    throw new Error('Scheduled time must be in the future');
  }

  const job = await emailQueue.add(
    'send-scheduled-email',
    data,
    {
      delay,
      jobId: data.messageId, // Use messageId as jobId for easy retrieval
    }
  );

  console.log(`Email scheduled for message ID ${data.messageId} at ${scheduledFor}`);
  
  return job;
}

// Cancel a scheduled email
export async function cancelScheduledEmail(messageId: string): Promise<void> {
  try {
    const job = await emailQueue.getJob(messageId);
    if (job) {
      await job.remove();
      console.log(`Cancelled scheduled email for message ID ${messageId}`);
    }
  } catch (error) {
    console.error(`Error cancelling scheduled email:`, error);
  }
}

// Get all scheduled jobs for a user
export async function getScheduledJobsForUser(userId: string): Promise<Job[]> {
  const jobs = await emailQueue.getJobs(['delayed', 'waiting']);
  return jobs.filter(job => job.data.userId === userId);
}

