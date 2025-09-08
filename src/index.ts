import express from "express";
import cors from "cors";
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import investorRoutes from './routes/investor.js';
import userRoutes from './routes/user.js';
import shortlistRoutes from './routes/shortlist.js'
import webhookRoutes from './routes/webhooks.js'
import messageRoutes from './routes/message.js'
// import verifyUser from 'middleware/verifyUser';

const prisma = new PrismaClient();
dotenv.config();
const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api', investorRoutes); 
app.use('/api', userRoutes);
app.use('/api', shortlistRoutes); 
app.use('/api', webhookRoutes);
app.use('/api', messageRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`🚀 Backend running at http://localhost:${port}`);
});
