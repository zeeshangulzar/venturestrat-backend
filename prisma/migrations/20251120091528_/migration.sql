/*
  Warnings:

  - A unique constraint covering the columns `[stripeCustomerId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripeSubscriptionId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripePaymentMethodId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."SubscriptionPlan" AS ENUM ('FREE', 'STARTER', 'PRO', 'SCALE');

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripePaymentMethodId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "subscriptionCurrentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "subscriptionPlan" "public"."SubscriptionPlan" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "subscriptionStatus" TEXT;

-- CreateTable
CREATE TABLE "public"."usage_tracking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aiDraftsUsed" INTEGER NOT NULL DEFAULT 0,
    "emailsSent" INTEGER NOT NULL DEFAULT 0,
    "investorsAdded" INTEGER NOT NULL DEFAULT 0,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "monthlyEmailsSent" INTEGER NOT NULL DEFAULT 0,
    "monthlyInvestorsAdded" INTEGER NOT NULL DEFAULT 0,
    "monthlyFollowUpEmailsSent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_tracking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usage_tracking_userId_idx" ON "public"."usage_tracking"("userId");

-- CreateIndex
CREATE INDEX "usage_tracking_date_idx" ON "public"."usage_tracking"("date");

-- CreateIndex
CREATE INDEX "usage_tracking_month_year_idx" ON "public"."usage_tracking"("month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "usage_tracking_userId_date_key" ON "public"."usage_tracking"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "public"."User"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeSubscriptionId_key" ON "public"."User"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripePaymentMethodId_key" ON "public"."User"("stripePaymentMethodId");

-- AddForeignKey
ALTER TABLE "public"."usage_tracking" ADD CONSTRAINT "usage_tracking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
