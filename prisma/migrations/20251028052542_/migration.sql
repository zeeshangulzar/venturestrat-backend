-- AlterEnum
ALTER TYPE "public"."MessageStatus" ADD VALUE 'SCHEDULED';

-- AlterTable
ALTER TABLE "public"."Message" ADD COLUMN     "gmailMessageId" TEXT,
ADD COLUMN     "gmailReferences" TEXT,
ADD COLUMN     "jobId" TEXT,
ADD COLUMN     "previous_message_id" TEXT,
ADD COLUMN     "scheduledFor" TIMESTAMP(3),
ADD COLUMN     "threadId" TEXT;

-- CreateIndex
CREATE INDEX "Message_previous_message_id_idx" ON "public"."Message"("previous_message_id");

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_previous_message_id_fkey" FOREIGN KEY ("previous_message_id") REFERENCES "public"."Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
