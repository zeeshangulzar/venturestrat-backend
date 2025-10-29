import { PrismaClient } from "@prisma/client";
import XLSX from "xlsx";

const prisma = new PrismaClient();

async function main() {
  const workbook = XLSX.readFile("./markets.xlsx");
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  for (const row of rows) {
    const original = String(row["Original Category"] || "").trim();
    const mapped = String(row["Mapped Category"] || "").trim();
    const country = String(row["Country"] || "").trim();

    if (!original) continue; // skip empty rows

    // Determine final title and isCountry flag
    let targetName = mapped || country;
    const isCountry = !mapped && !!country;

    if (!targetName) continue; // skip if both are empty

    // 🚨 CRITICAL FIX: Skip if original and target are the same
    if (original === targetName) {
      console.log(`⏭️ Skipped "${original}" (no change needed)`);
      continue;
    }

    // 1️⃣ Ensure target market exists or create it
    let targetMarket = await prisma.market.findUnique({
      where: { title: targetName },
    });

    if (!targetMarket) {
      targetMarket = await prisma.market.create({
        data: { title: targetName, isCountry },
      });
      console.log(`🆕 Created market "${targetName}" (isCountry=${isCountry})`);
    } else if (targetMarket.isCountry !== isCountry) {
      await prisma.market.update({
        where: { id: targetMarket.id },
        data: { isCountry },
      });
      console.log(`🔄 Updated market "${targetName}" (isCountry=${isCountry})`);
    }

    // 2️⃣ Find the old market entry
    const oldMarket = await prisma.market.findUnique({
      where: { title: original },
    });

    if (!oldMarket) {
      console.log(`⚠️ Old market "${original}" not found, skipping...`);
      continue;
    }

    // 🚨 ADDITIONAL SAFETY: Don't process if old and target are the same ID
    if (oldMarket.id === targetMarket.id) {
      console.log(`⏭️ Old and target market are the same (ID: ${oldMarket.id}), skipping...`);
      continue;
    }

    // 3️⃣ Reassign all investor links safely
    const oldInvestorLinks = await prisma.investorMarket.findMany({
      where: { marketId: oldMarket.id },
      select: { id: true, investorId: true },
    });

    console.log(`🔄 Processing ${oldInvestorLinks.length} links for "${original}" → "${targetName}"`);

    let updated = 0;
    let deleted = 0;

    for (const link of oldInvestorLinks) {
      const existingLink = await prisma.investorMarket.findFirst({
        where: {
          investorId: link.investorId,
          marketId: targetMarket.id,
        },
      });

      if (!existingLink) {
        // ✅ Safely update old link to point to new market
        await prisma.investorMarket.update({
          where: { id: link.id },
          data: { marketId: targetMarket.id },
        });
        updated++;
      } else {
        // ⚠️ Duplicate exists — delete only the old redundant one
        await prisma.investorMarket.delete({
          where: { id: link.id },
        });
        deleted++;
      }
    }

    console.log(`  ✅ Updated: ${updated}, Deleted duplicates: ${deleted}`);

    // 4️⃣ Only delete old market if no investor links remain
    const remainingLinks = await prisma.investorMarket.count({
      where: { marketId: oldMarket.id },
    });

    if (remainingLinks === 0) {
      await prisma.market.delete({
        where: { id: oldMarket.id },
      });
      console.log(`🗑️ Deleted old market "${original}"`);
    } else {
      console.log(
        `⚠️ WARNING: Skipped deletion of "${original}" (still ${remainingLinks} links left - THIS SHOULD NOT HAPPEN!)`
      );
    }

    console.log(`✅ Merged "${original}" → "${targetName}" (isCountry=${isCountry})`);
  }

  console.log("🎉 All markets processed safely and without data loss!");
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });