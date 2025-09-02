-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "firstname" TEXT,
ADD COLUMN     "lastname" TEXT,
ADD COLUMN     "publicMetaData" JSONB;
