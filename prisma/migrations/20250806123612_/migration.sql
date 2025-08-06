-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Investor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "investment_stage" TEXT NOT NULL,
    "investment_focus" TEXT NOT NULL,
    "investment_type" TEXT NOT NULL,
    "previous_investments" TEXT[],
    "website" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "social_links" JSONB NOT NULL,

    CONSTRAINT "Investor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Shortlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,

    CONSTRAINT "Shortlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Investor_email_key" ON "public"."Investor"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Shortlist_userId_investorId_key" ON "public"."Shortlist"("userId", "investorId");

-- AddForeignKey
ALTER TABLE "public"."Shortlist" ADD CONSTRAINT "Shortlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Shortlist" ADD CONSTRAINT "Shortlist_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "public"."Investor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
