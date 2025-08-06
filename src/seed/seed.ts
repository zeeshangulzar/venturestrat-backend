import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';
import { Country, State, City } from 'country-state-city';

const prisma = new PrismaClient();

async function main() {
  // Generate 50 investors using Faker.js and country-state-city
  const investors = Array.from({ length: 50 }, () => {
    // Randomly select a country that has states and cities
    const countries = Country.getAllCountries().filter(country => {
      const states = State.getStatesOfCountry(country.isoCode);
      return states && states.length > 0; // Ensure the country has states
    });

    const randomCountry = faker.helpers.arrayElement(countries);

    if (!randomCountry) {
      throw new Error("No country found in the dataset.");
    }

    // Get the states of the randomly selected country
    const randomStates = State.getStatesOfCountry(randomCountry.isoCode);
    let randomState = '';
    if (randomStates && randomStates.length > 0) {
      randomState = faker.helpers.arrayElement(randomStates)?.name || '';
    }

    // Get cities of the selected state, if applicable
    let randomCity = '';
    if (randomState) {
      const randomCities = City.getCitiesOfState(randomCountry.isoCode, randomState);
      if (randomCities && randomCities.length > 0) {
        randomCity = faker.helpers.arrayElement(randomCities)?.name || '';
      }
    }

    return {
      name: faker.company.name(),
      email: faker.internet.email(),
      investment_stage: faker.helpers.arrayElement([
        'Seed', 'Series A', 'Series B', 'Growth', 'Pre-Seed',
      ]),
      investment_focus: faker.helpers.arrayElement([
        'Technology', 'Fintech', 'Healthcare', 'Retail', 'Blockchain', 'AI',
      ]) + ', ' + faker.helpers.arrayElement([
        'SaaS', 'E-commerce', 'Cloud Computing', 'Cybersecurity', 'Biotech',
      ]),
      investment_type: faker.helpers.arrayElement([
        'Venture Capital', 'Private Equity', 'Seed Capital',
      ]),
      previous_investments: [faker.company.name(), faker.company.name()],
      website: faker.internet.url(),
      city: randomCity || faker.address.city(), // Random city from the selected state (or random if no state)
      state: randomState || '',                 // Random state if applicable
      country: randomCountry.name,             // Country name from country-state-city
      phone_number: faker.phone.number(),
      social_links: {
        linkedin: faker.internet.url(),
        twitter: faker.internet.url(),
      },
    };
  });

  // Insert the generated investors into the database
  for (const investor of investors) {
    await prisma.investor.upsert({
      where: { email: investor.email },
      update: {}, // If the investor exists, don't update anything
      create: investor,
    });
  }

  console.log('✅ Investors seeded successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
