import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const prisma = new PrismaClient();

async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const filePath = path.join(__dirname, 'broker.json');
  const file = await fs.readFile(filePath, 'utf-8');
  const brokers = JSON.parse(file);

  for (const broker of brokers) {
    await prisma.broker.upsert({
      where: { email: broker.email },
      update: {},
      create: broker,
    });

  }

  console.log('✅ Brokers seeded successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
