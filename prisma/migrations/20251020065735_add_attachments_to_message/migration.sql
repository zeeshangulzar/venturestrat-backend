-- AlterTable
ALTER TABLE "public"."Message" ADD COLUMN     "attachments" JSONB DEFAULT '[]';
