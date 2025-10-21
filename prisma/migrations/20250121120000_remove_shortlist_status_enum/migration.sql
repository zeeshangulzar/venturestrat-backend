-- AlterTable
ALTER TABLE "Shortlist" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Shortlist" ALTER COLUMN "status" TYPE TEXT;
ALTER TABLE "Shortlist" ALTER COLUMN "status" SET DEFAULT 'TARGET';

-- DropEnum
DROP TYPE "ShortlistStatus";
