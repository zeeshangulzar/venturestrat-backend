-- Add cc column to Message table
ALTER TABLE "Message" ADD COLUMN "cc" TEXT[] DEFAULT '{}';
