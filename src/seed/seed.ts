import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const prisma = new PrismaClient({
  log: ['error'], // Only log errors to reduce noise
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Helper function to normalize email status
function normalizeEmailStatus(status: string): 'VALID' | 'INVALID' | 'PENDING' | 'UNKNOWN' {
  const normalizedStatus = status.toUpperCase();
  
  switch (normalizedStatus) {
    case 'VALID':
      return 'VALID';
    case 'INVALID':
      return 'INVALID';
    case 'PENDING':
      return 'PENDING';
    case 'UNKNOWN':
      return 'UNKNOWN';
    default:
      return 'UNKNOWN'; // Default fallback
  }
}

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
  city?: {
    id: string;
    title: string;
  };
  state?: {
    id: string;
    title: string;
  };
  country?: {
    id: string;
    title: string;
  };
  company?: {
    id: string;
    title: string;
  };
  emails: Array<{
    email: string;
    id: string;
    status: string;
  }>;
  pastInvestments: Array<{
    id: string;
    title: string;
  }>;
  markets: Array<{
    id: string;
    title: string;
  }>;
  stages: Array<{
    id: string;
    title: string;
  }>;
  investorTypes: Array<{
    id: string;
    title: string;
  }>;
  pipelines: any[];
}

async function main() {

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const dataDirectory = path.join(__dirname, 'ibra');

  try {
    // Read all JSON files in the 'ibra' folder
    const files = await fs.readdir(dataDirectory);
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    console.log(`📁 Found ${jsonFiles.length} JSON files to process`);

    // Collect all unique reference data first
    const uniqueCompanies = new Set<string>();
    const uniqueAddresses = new Map<string, { city: string; state: string; country: string }>();
    const uniqueMarkets = new Set<string>();
    const uniquePastInvestments = new Set<string>();
    const uniqueStages = new Set<string>();
    const uniqueInvestorTypes = new Set<string>();

    let allInvestorsData: InvestorData[] = [];

    // First pass: collect all unique reference data
    for (const file of jsonFiles) {
      const filePath = path.join(dataDirectory, file);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(fileContent);

      // Handle both single object and array formats
      const investorsArray = Array.isArray(data) ? data : [data];
      allInvestorsData.push(...investorsArray);

      for (const investorData of investorsArray) {
        // Collect companies
        if (investorData.company?.title) {
          uniqueCompanies.add(investorData.company.title);
        }

        // Collect addresses
        if (investorData.city?.title && investorData.state?.title && investorData.country?.title) {
          const addressKey = `${investorData.city.title}-${investorData.state.title}-${investorData.country.title}`;
          uniqueAddresses.set(addressKey, {
            city: investorData.city.title,
            state: investorData.state.title,
            country: investorData.country.title
          });
        }

        // Collect markets
        investorData.markets?.forEach((market: any) => {
          if (market.title) uniqueMarkets.add(market.title);
        });

        // Collect past investments
        investorData.pastInvestments?.forEach((investment: any) => {
          if (investment.title) uniquePastInvestments.add(investment.title);
        });

        // Collect stages
        investorData.stages?.forEach((stage: any) => {
          if (stage.title) uniqueStages.add(stage.title);
        });

        // Collect investor types
        investorData.investorTypes?.forEach((type: any) => {
          if (type.title) uniqueInvestorTypes.add(type.title);
        });
      }
    }

    console.log(`📈 Found unique data:
    - Companies: ${uniqueCompanies.size}
    - Addresses: ${uniqueAddresses.size}
    - Markets: ${uniqueMarkets.size}
    - Past Investments: ${uniquePastInvestments.size}
    - Stages: ${uniqueStages.size}
    - Investor Types: ${uniqueInvestorTypes.size}
    - Total Investors: ${allInvestorsData.length}`);

    // Step 1: Create all companies
    console.log('🏢 Creating companies...');
    if (uniqueCompanies.size > 0) {
      await prisma.company.createMany({
        data: Array.from(uniqueCompanies).map(title => ({ title })),
        skipDuplicates: true
      });
    }

    // Step 2: Create all addresses
    console.log('📍 Creating addresses...');
    if (uniqueAddresses.size > 0) {
      await prisma.address.createMany({
        data: Array.from(uniqueAddresses.values()),
        skipDuplicates: true
      });
    }

    // Step 3: Create all markets
    console.log('🎯 Creating markets...');
    if (uniqueMarkets.size > 0) {
      await prisma.market.createMany({
        data: Array.from(uniqueMarkets).map(title => ({ title })),
        skipDuplicates: true
      });
    }

    // Step 4: Create all past investments
    console.log('💰 Creating past investments...');
    if (uniquePastInvestments.size > 0) {
      await prisma.pastInvestment.createMany({
        data: Array.from(uniquePastInvestments).map(title => ({ title })),
        skipDuplicates: true
      });
    }

    // Step 5: Create all stages
    console.log('📈 Creating stages...');
    if (uniqueStages.size > 0) {
      await prisma.stage.createMany({
        data: Array.from(uniqueStages).map(title => ({ title })),
        skipDuplicates: true
      });
    }

    // Step 6: Create all investor types
    console.log('👥 Creating investor types...');
    if (uniqueInvestorTypes.size > 0) {
      await prisma.investorType.createMany({
        data: Array.from(uniqueInvestorTypes).map(title => ({ title })),
        skipDuplicates: true
      });
    }

    // Step 7: Get all reference data for mapping
    console.log('🔍 Fetching reference data for mapping...');
    const companiesMap = new Map();
    const addressesMap = new Map();
    const marketsMap = new Map();
    const pastInvestmentsMap = new Map();
    const stagesMap = new Map();
    const investorTypesMap = new Map();

    // Fetch and map all reference data
    const [companies, addresses, markets, pastInvestments, stages, investorTypes] = await Promise.all([
      prisma.company.findMany(),
      prisma.address.findMany(),
      prisma.market.findMany(),
      prisma.pastInvestment.findMany(),
      prisma.stage.findMany(),
      prisma.investorType.findMany()
    ]);

    companies.forEach(c => companiesMap.set(c.title, c.id));
    addresses.forEach(a => addressesMap.set(`${a.city}-${a.state}-${a.country}`, a.id));
    markets.forEach(m => marketsMap.set(m.title, m.id));
    pastInvestments.forEach(p => pastInvestmentsMap.set(p.title, p.id));
    stages.forEach(s => stagesMap.set(s.title, s.id));
    investorTypes.forEach(i => investorTypesMap.set(i.title, i.id));

    // Step 8: Create investors in smaller batches with connection management
    console.log('👤 Creating investors...');
    const batchSize = 50; // Reduced batch size for better connection management
    let processedCount = 0;
    const totalBatches = Math.ceil(allInvestorsData.length / batchSize);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const start = batchIndex * batchSize;
      const end = Math.min(start + batchSize, allInvestorsData.length);
      const batch = allInvestorsData.slice(start, end);
      
      console.log(`🔄 Processing batch ${batchIndex + 1}/${totalBatches} (${start + 1}-${end} of ${allInvestorsData.length})`);
      
      // Process batch in transaction for better performance and consistency
      try {
        await prisma.$transaction(async (tx) => {
          for (const investorData of batch) {
            try {
              // Prepare address and company IDs
              const addressKey = investorData.city?.title && investorData.state?.title && investorData.country?.title
                ? `${investorData.city.title}-${investorData.state.title}-${investorData.country.title}`
                : null;
              
              const addressId = addressKey ? addressesMap.get(addressKey) : null;
              const companyId = investorData.company?.title ? companiesMap.get(investorData.company.title) : null;

              // Create social links JSON
              const socialLinks = {};
              if (investorData.twitter) socialLinks.twitter = investorData.twitter;
              if (investorData.linkedin) socialLinks.linkedin = investorData.linkedin;
              if (investorData.facebook) socialLinks.facebook = investorData.facebook;

              // Create investor
              const investor = await tx.investor.create({
                data: {
                  name: investorData.name,
                  avatar: investorData.avatar,
                  website: investorData.website,
                  phone: investorData.phone,
                  title: investorData.title,
                  social_links: Object.keys(socialLinks).length > 0 ? socialLinks : null,
                  pipelines: investorData.pipelines || [],
                  addressId,
                  companyId,
                }
              });

              // Create emails with status validation
              if (investorData.emails?.length > 0) {
                await tx.investorEmail.createMany({
                  data: investorData.emails.map(email => ({
                    email: email.email,
                    status: normalizeEmailStatus(email.status),
                    investorId: investor.id
                  })),
                  skipDuplicates: true
                });
              }

              // Create relationships in batches
              const relationshipPromises = [];

              // Markets
              if (investorData.markets?.length > 0) {
                const marketRelations = investorData.markets
                  .filter(m => marketsMap.has(m.title))
                  .map(m => ({ investorId: investor.id, marketId: marketsMap.get(m.title) }));
                
                if (marketRelations.length > 0) {
                  relationshipPromises.push(
                    tx.investorMarket.createMany({ data: marketRelations, skipDuplicates: true })
                  );
                }
              }

              // Past Investments
              if (investorData.pastInvestments?.length > 0) {
                const investmentRelations = investorData.pastInvestments
                  .filter(p => pastInvestmentsMap.has(p.title))
                  .map(p => ({ investorId: investor.id, pastInvestmentId: pastInvestmentsMap.get(p.title) }));
                
                if (investmentRelations.length > 0) {
                  relationshipPromises.push(
                    tx.investorPastInvestment.createMany({ data: investmentRelations, skipDuplicates: true })
                  );
                }
              }

              // Stages
              if (investorData.stages?.length > 0) {
                const stageRelations = investorData.stages
                  .filter(s => stagesMap.has(s.title))
                  .map(s => ({ investorId: investor.id, stageId: stagesMap.get(s.title) }));
                
                if (stageRelations.length > 0) {
                  relationshipPromises.push(
                    tx.investorStage.createMany({ data: stageRelations, skipDuplicates: true })
                  );
                }
              }

              // Investor Types
              if (investorData.investorTypes?.length > 0) {
                const typeRelations = investorData.investorTypes
                  .filter(t => investorTypesMap.has(t.title))
                  .map(t => ({ investorId: investor.id, investorTypeId: investorTypesMap.get(t.title) }));
                
                if (typeRelations.length > 0) {
                  relationshipPromises.push(
                    tx.investorInvestorType.createMany({ data: typeRelations, skipDuplicates: true })
                  );
                }
              }

              // Execute all relationship creations
              if (relationshipPromises.length > 0) {
                await Promise.all(relationshipPromises);
              }

              processedCount++;

            } catch (error) {
              console.error(`❌ Failed to create investor ${investorData.name}:`, error);
              throw error; // Re-throw to rollback transaction
            }
          }
        }, {
          maxWait: 10000, // 10 seconds max wait
          timeout: 60000, // 60 seconds timeout
        });

        // Add a small delay between batches to prevent overwhelming the database
        if (batchIndex < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
        }

        console.log(`✅ Completed batch ${batchIndex + 1}/${totalBatches}. Total processed: ${processedCount}/${allInvestorsData.length}`);

      } catch (error) {
        console.error(`Failed to process batch ${batchIndex + 1}:`, error);
        // Continue with next batch instead of stopping completely
        continue;
      }
    }


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