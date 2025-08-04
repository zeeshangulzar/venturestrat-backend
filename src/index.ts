import express from "express";
import cors from "cors";
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import brokerRoutes from './routes/broker.js';

const prisma = new PrismaClient();
dotenv.config();
const app = express();
const port = process.env.PORT || 3000;  // Use process.env.PORT for Render or fallback to 3000

app.use(cors());
app.use(express.json());
app.use('/api/brokers', brokerRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Update this to use the dynamic port
app.listen(port, () => {
  console.log(`🚀 Backend running at http://localhost:${port}`);
});
