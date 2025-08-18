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
    "external_id" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "companyName" TEXT,
    "stages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "investorTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "social_links" JSONB,
    "pipelines" JSONB,
    "foundedCompanies" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sourceData" JSONB,

    CONSTRAINT "investors_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "investors_country_idx" ON "public"."investors"("country");

-- CreateIndex
CREATE INDEX "investors_state_idx" ON "public"."investors"("state");

-- CreateIndex
CREATE INDEX "investors_city_idx" ON "public"."investors"("city");

-- CreateIndex
CREATE INDEX "investors_location_hierarchy_idx" ON "public"."investors"("country", "state", "city");

-- CreateIndex
CREATE INDEX "investors_stage_idx" ON "public"."investors"("stages");

-- CreateIndex
CREATE INDEX "investors_company_name_idx" ON "public"."investors"("companyName");

-- CreateIndex
CREATE INDEX "investors_createdAt_idx" ON "public"."investors"("createdAt");

-- CreateIndex
CREATE INDEX "investors_created_at_id_idx" ON "public"."investors"("createdAt", "id");

-- CreateIndex
CREATE INDEX "investor_emails_investor_id_idx" ON "public"."investor_emails"("investor_id");

-- CreateIndex
CREATE INDEX "investor_emails_email_idx" ON "public"."investor_emails"("email");

-- CreateIndex
CREATE INDEX "investor_emails_status_idx" ON "public"."investor_emails"("status");

-- CreateIndex
CREATE UNIQUE INDEX "past_investments_title_key" ON "public"."past_investments"("title");

-- CreateIndex
CREATE INDEX "past_investments_title_idx" ON "public"."past_investments"("title");

-- CreateIndex
CREATE UNIQUE INDEX "markets_title_key" ON "public"."markets"("title");

-- CreateIndex
CREATE INDEX "markets_title_idx" ON "public"."markets"("title");

-- CreateIndex
CREATE INDEX "investor_past_investments_investor_id_idx" ON "public"."investor_past_investments"("investor_id");

-- CreateIndex
CREATE INDEX "investor_past_investments_past_investment_id_idx" ON "public"."investor_past_investments"("past_investment_id");

-- CreateIndex
CREATE INDEX "investor_past_investments_created_at_idx" ON "public"."investor_past_investments"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "investor_past_investments_investor_id_past_investment_id_key" ON "public"."investor_past_investments"("investor_id", "past_investment_id");

-- CreateIndex
CREATE INDEX "investor_markets_investor_id_idx" ON "public"."investor_markets"("investor_id");

-- CreateIndex
CREATE INDEX "investor_markets_market_id_idx" ON "public"."investor_markets"("market_id");

-- CreateIndex
CREATE INDEX "investor_markets_created_at_idx" ON "public"."investor_markets"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "investor_markets_investor_id_market_id_key" ON "public"."investor_markets"("investor_id", "market_id");

-- CreateIndex
CREATE INDEX "Shortlist_user_id_idx" ON "public"."Shortlist"("user_id");

-- CreateIndex
CREATE INDEX "Shortlist_investor_id_idx" ON "public"."Shortlist"("investor_id");

-- CreateIndex
CREATE UNIQUE INDEX "Shortlist_user_id_investor_id_key" ON "public"."Shortlist"("user_id", "investor_id");

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
ALTER TABLE "public"."Shortlist" ADD CONSTRAINT "Shortlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Shortlist" ADD CONSTRAINT "Shortlist_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
