-- CreateEnum
CREATE TYPE "public"."EmailStatus" AS ENUM ('VALID', 'INVALID', 'PENDING', 'UNKNOWN');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."investors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "title" TEXT,
    "social_links" JSONB,
    "pipelines" JSONB,
    "address_id" TEXT,
    "company_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."companies" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."addresses" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."investor_emails" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "status" "public"."EmailStatus" NOT NULL DEFAULT 'VALID',
    "investor_id" TEXT NOT NULL,

    CONSTRAINT "investor_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."past_investments" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "past_investments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."markets" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."stages" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."investor_types" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investor_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."investor_past_investments" (
    "id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "past_investment_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investor_past_investments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."investor_markets" (
    "id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investor_markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."investor_stages" (
    "id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investor_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."investor_investor_types" (
    "id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "investor_type_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investor_investor_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Shortlist" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,

    CONSTRAINT "Shortlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "investors_name_idx" ON "public"."investors"("name");

-- CreateIndex
CREATE INDEX "investors_address_id_idx" ON "public"."investors"("address_id");

-- CreateIndex
CREATE INDEX "investors_company_id_idx" ON "public"."investors"("company_id");

-- CreateIndex
CREATE INDEX "investors_createdAt_idx" ON "public"."investors"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "companies_title_key" ON "public"."companies"("title");

-- CreateIndex
CREATE INDEX "companies_title_idx" ON "public"."companies"("title");

-- CreateIndex
CREATE INDEX "addresses_city_idx" ON "public"."addresses"("city");

-- CreateIndex
CREATE INDEX "addresses_country_idx" ON "public"."addresses"("country");

-- CreateIndex
CREATE UNIQUE INDEX "addresses_city_state_country_key" ON "public"."addresses"("city", "state", "country");

-- CreateIndex
CREATE INDEX "investor_emails_investor_id_idx" ON "public"."investor_emails"("investor_id");

-- CreateIndex
CREATE INDEX "investor_emails_email_idx" ON "public"."investor_emails"("email");

-- CreateIndex
CREATE UNIQUE INDEX "past_investments_title_key" ON "public"."past_investments"("title");

-- CreateIndex
CREATE INDEX "past_investments_title_idx" ON "public"."past_investments"("title");

-- CreateIndex
CREATE UNIQUE INDEX "markets_title_key" ON "public"."markets"("title");

-- CreateIndex
CREATE INDEX "markets_title_idx" ON "public"."markets"("title");

-- CreateIndex
CREATE UNIQUE INDEX "stages_title_key" ON "public"."stages"("title");

-- CreateIndex
CREATE INDEX "stages_title_idx" ON "public"."stages"("title");

-- CreateIndex
CREATE UNIQUE INDEX "investor_types_title_key" ON "public"."investor_types"("title");

-- CreateIndex
CREATE INDEX "investor_types_title_idx" ON "public"."investor_types"("title");

-- CreateIndex
CREATE INDEX "investor_past_investments_investor_id_idx" ON "public"."investor_past_investments"("investor_id");

-- CreateIndex
CREATE INDEX "investor_past_investments_past_investment_id_idx" ON "public"."investor_past_investments"("past_investment_id");

-- CreateIndex
CREATE UNIQUE INDEX "investor_past_investments_investor_id_past_investment_id_key" ON "public"."investor_past_investments"("investor_id", "past_investment_id");

-- CreateIndex
CREATE INDEX "investor_markets_investor_id_idx" ON "public"."investor_markets"("investor_id");

-- CreateIndex
CREATE INDEX "investor_markets_market_id_idx" ON "public"."investor_markets"("market_id");

-- CreateIndex
CREATE UNIQUE INDEX "investor_markets_investor_id_market_id_key" ON "public"."investor_markets"("investor_id", "market_id");

-- CreateIndex
CREATE INDEX "investor_stages_investor_id_idx" ON "public"."investor_stages"("investor_id");

-- CreateIndex
CREATE INDEX "investor_stages_stage_id_idx" ON "public"."investor_stages"("stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "investor_stages_investor_id_stage_id_key" ON "public"."investor_stages"("investor_id", "stage_id");

-- CreateIndex
CREATE INDEX "investor_investor_types_investor_id_idx" ON "public"."investor_investor_types"("investor_id");

-- CreateIndex
CREATE INDEX "investor_investor_types_investor_type_id_idx" ON "public"."investor_investor_types"("investor_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "investor_investor_types_investor_id_investor_type_id_key" ON "public"."investor_investor_types"("investor_id", "investor_type_id");

-- CreateIndex
CREATE INDEX "Shortlist_user_id_idx" ON "public"."Shortlist"("user_id");

-- CreateIndex
CREATE INDEX "Shortlist_investor_id_idx" ON "public"."Shortlist"("investor_id");

-- CreateIndex
CREATE UNIQUE INDEX "Shortlist_user_id_investor_id_key" ON "public"."Shortlist"("user_id", "investor_id");

-- AddForeignKey
ALTER TABLE "public"."investors" ADD CONSTRAINT "investors_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."investors" ADD CONSTRAINT "investors_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."investor_emails" ADD CONSTRAINT "investor_emails_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."investor_past_investments" ADD CONSTRAINT "investor_past_investments_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."investor_past_investments" ADD CONSTRAINT "investor_past_investments_past_investment_id_fkey" FOREIGN KEY ("past_investment_id") REFERENCES "public"."past_investments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."investor_markets" ADD CONSTRAINT "investor_markets_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."investor_markets" ADD CONSTRAINT "investor_markets_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."investor_stages" ADD CONSTRAINT "investor_stages_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."investor_stages" ADD CONSTRAINT "investor_stages_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."investor_investor_types" ADD CONSTRAINT "investor_investor_types_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."investor_investor_types" ADD CONSTRAINT "investor_investor_types_investor_type_id_fkey" FOREIGN KEY ("investor_type_id") REFERENCES "public"."investor_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Shortlist" ADD CONSTRAINT "Shortlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Shortlist" ADD CONSTRAINT "Shortlist_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
