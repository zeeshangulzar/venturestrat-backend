// scripts/updateCountry.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function updateCountry(oldCountry: string, newCountry: string) {
  try {
    const result = await prisma.investor.updateMany({
      where: { country: oldCountry },
      data: { country: newCountry },
    });

    console.log(`✅ Updated ${result.count} rows from ${oldCountry} to ${newCountry}`);
  } catch (err) {
    console.error("❌ Error updating country:", err);
  } finally {
    await prisma.$disconnect();
  }
}

updateCountry("The Netherlands", "Netherlands");
updateCountry("Korea South", "South Korea");
updateCountry("Croatia (Hrvatska)", "Croatia")