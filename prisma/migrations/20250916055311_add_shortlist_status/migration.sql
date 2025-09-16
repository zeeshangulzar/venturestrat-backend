-- CreateEnum
CREATE TYPE "public"."ShortlistStatus" AS ENUM ('TARGET', 'CONTACTED', 'NO_RESPONSE', 'NOT_INTERESTED', 'INTERESTED');

-- AlterTable
ALTER TABLE "public"."Shortlist" ADD COLUMN     "status" "public"."ShortlistStatus" NOT NULL DEFAULT 'TARGET';
