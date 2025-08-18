// Seeding investors from JSON files — store stages/investorTypes as string[] titles (no enums)

import { Prisma, PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const asJson = (v: unknown): Prisma.InputJsonValue => v as unknown as Prisma.InputJsonValue;

const prisma = new PrismaClient({
  log: ['error'],
  datasources: {
    db: { url: process.env.DATABASE_URL },
  },
});

// ---------- helpers ----------
function norm(v?: string | null): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}
function normalizeEmailStatus(status?: string): 'VALID' | 'INVALID' | 'PENDING' | 'UNKNOWN' {
  const s = (status || '').toUpperCase();
  if (s === 'VALID' || s === 'INVALID' || s === 'PENDING' || s === 'UNKNOWN') return s as any;
  return 'UNKNOWN';
}

// Keep input shape
interface InvestorData {
  id: string;
  name: string;
  avatar?: string;
  twitter?: string;
  linkedin?: string;
  website?: string;
  facebook?: string;
  phone?: string;
  title?: string;
  city?: { id: string; title: string };
  state?: { id: string; title: string };
  country?: { id: string; title: string };
  company?: { id: string; title: string };
  emails: Array<{ email: string; id: string; status: string }>;
  pastInvestments: Array<{ id: string; title: string }>;
  markets: Array<{ id: string; title: string }>;
  stages: Array<{ id: string; title: string }>;
  investorTypes: Array<{ id: string; title: string }>;
  pipelines: any[];
  foundedCompanies: any[];
  sourceData?: any;
  externalId?: string;
}

async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const dataDirectory = path.join(__dirname, 'ibra');

  try {
    const files = await fs.readdir(dataDirectory);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    console.log(`📁 Found ${jsonFiles.length} JSON files to process`);

    const uniqueMarkets = new Set<string>();
    const uniquePastInvestments = new Set<string>();
    const allInvestorsData: InvestorData[] = [];

    // 1) read & collect uniques (with types)
    for (const file of jsonFiles) {
      const filePath = path.join(dataDirectory, file);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const dataRaw = JSON.parse(fileContent) as unknown;
      const arr: InvestorData[] = Array.isArray(dataRaw)
        ? (dataRaw as InvestorData[])
        : [dataRaw as InvestorData];

      allInvestorsData.push(...arr);

      for (const inv of arr) {
        inv.markets?.forEach((m: InvestorData['markets'][number]) => {
          const t = m?.title?.trim();
          if (t) uniqueMarkets.add(t);
        });
        inv.pastInvestments?.forEach((p: InvestorData['pastInvestments'][number]) => {
          const t = p?.title?.trim();
          if (t) uniquePastInvestments.add(t);
        });
      }
    }

    console.log(`📈 Totals:
    - Markets (unique): ${uniqueMarkets.size}
    - Past Investments (unique): ${uniquePastInvestments.size}
    - Investors (raw): ${allInvestorsData.length}`);

    // 2) create reference data (Markets & PastInvestments only)
    if (uniqueMarkets.size) {
      console.log('🎯 Creating markets...');
      await prisma.market.createMany({
        data: Array.from(uniqueMarkets).map(title => ({ title })),
        skipDuplicates: true,
      });
    }
    if (uniquePastInvestments.size) {
      console.log('💰 Creating past investments...');
      await prisma.pastInvestment.createMany({
        data: Array.from(uniquePastInvestments).map(title => ({ title })),
        skipDuplicates: true,
      });
    }

    // 3) read back reference maps
    console.log('🔍 Loading reference IDs...');
    const [markets, pastInvestments] = await Promise.all([
      prisma.market.findMany(),
      prisma.pastInvestment.findMany(),
    ]);
    const marketsMap = new Map(markets.map(m => [m.title, m.id]));
    const pastInvestmentsMap = new Map(pastInvestments.map(p => [p.title, p.id]));

    // 4) create investors + relations in batches (NO de-dup)
    console.log('👤 Creating investors...');
    const batchSize = 500;
    let processed = 0;

    const totalBatches = Math.ceil(allInvestorsData.length / batchSize);
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const start = batchIndex * batchSize;
      const end = Math.min(start + batchSize, allInvestorsData.length);
      const batch = allInvestorsData.slice(start, end);

      console.log(`🔄 Batch ${batchIndex + 1}/${totalBatches} (${start + 1}-${end})`);

      try {
        await prisma.$transaction(async (tx) => {
          for (const inv of batch) {
            // social links json (as InputJsonValue or omit)
            const social: Record<string, string> = {};
            if (inv.twitter)  social.twitter  = inv.twitter;
            if (inv.linkedin) social.linkedin = inv.linkedin;
            if (inv.facebook) social.facebook = inv.facebook;

            const socialLinks: Prisma.InputJsonValue | undefined =
              Object.keys(social).length ? (social as Prisma.InputJsonValue) : undefined;

            // STAGES as string[] (titles directly)
            const mappedStages: string[] =
              (inv.stages ?? [])
                .map(s => (s?.title ?? '').trim())
                .filter((t): t is string => !!t);

            // INVESTOR TYPES as string[] (titles directly)
            const types: string[] =
              (inv.investorTypes ?? [])
                .map(t => (t?.title ?? '').trim())
                .filter((x): x is string => !!x);

            const created = await tx.investor.create({
              data: {
                externalId: inv.id,                 
                name:       inv.name,
                avatar:     inv.avatar,
                website:    inv.website,
                phone:      inv.phone,
                title:      inv.title,
                // merged address/company strings
                city:       norm(inv.city?.title),
                state:      norm(inv.state?.title),
                country:    norm(inv.country?.title),
                companyName:norm(inv.company?.title),
                // arrays as strings
                stages:        mappedStages,
                investorTypes: types,
                // json
                social_links:     socialLinks,
                pipelines:        asJson(inv.pipelines ?? []),
                foundedCompanies: asJson(inv.foundedCompanies ?? []),
                sourceData:       asJson(inv),
              },
            });

            // emails (new model Email)
            if (inv.emails?.length) {
              await tx.email.createMany({
                data: inv.emails.map((e) => ({
                  email: e.email,
                  status: normalizeEmailStatus(e.status),
                  investorId: created.id,
                })),
                skipDuplicates: true, // keep to avoid exact-duplicate rows
              });
            }

            // markets (join)
            if (inv.markets?.length) {
              const rows = inv.markets
                .filter((m) => !!m?.title && marketsMap.has(m.title))
                .map((m) => ({ investorId: created.id, marketId: marketsMap.get(m.title)! }));
              if (rows.length) await tx.investorMarket.createMany({ data: rows, skipDuplicates: true });
            }

            // past investments (join)
            if (inv.pastInvestments?.length) {
              const rows = inv.pastInvestments
                .filter((p) => !!p?.title && pastInvestmentsMap.has(p.title))
                .map((p) => ({ investorId: created.id, pastInvestmentId: pastInvestmentsMap.get(p.title)! }));
              if (rows.length) await tx.investorPastInvestment.createMany({ data: rows, skipDuplicates: true });
            }

            processed++;
          }
        }, { maxWait: 10_000, timeout: 60_000 });

        if (batchIndex < totalBatches - 1) {
          await new Promise(r => setTimeout(r, 100));
        }
        console.log(`✅ Batch ${batchIndex + 1}/${totalBatches} done. Processed ${processed}/${allInvestorsData.length}`);
      } catch (err) {
        console.error(`❌ Batch ${batchIndex + 1} failed:`, err);
        // continue with the next batch
      }
    }

    console.log(`🎉 Done. Inserted ${processed} investors.`);
  } catch (error) {
    console.error('Seeding failed:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
