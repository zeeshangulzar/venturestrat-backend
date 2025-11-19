/*
  Warnings:

  - The `status` column on the `Shortlist` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "public"."Shortlist" DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'TARGET';

-- DropEnum
DROP TYPE "public"."ShortlistStatus";
