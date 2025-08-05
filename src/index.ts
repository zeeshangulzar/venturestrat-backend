import express from "express";
import cors from "cors";
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import investorRoutes from './routes/investor.js'; // Use the investor route

const prisma = new PrismaClient();
dotenv.config();
const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Use the correct route for /api/investors
app.use('/api/investors', investorRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`🚀 Backend running at http://localhost:${port}`);
});
