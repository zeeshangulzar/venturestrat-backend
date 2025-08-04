import express from "express";
import cors from "cors";
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import brokerRoutes from './routes/broker.js';

const prisma = new PrismaClient();
dotenv.config();
const app = express();
const port = process.env.PORT || 3001;


app.use(cors());
app.use(express.json());
app.use('/api/brokers', brokerRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => console.log("🚀 Backend running at http://localhost:3001"));
