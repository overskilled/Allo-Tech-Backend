-- AlterTable: Add message type and file fields to Message
ALTER TABLE "Message" ADD COLUMN "messageType" TEXT NOT NULL DEFAULT 'text';
ALTER TABLE "Message" ADD COLUMN "fileUrl" TEXT;
ALTER TABLE "Message" ADD COLUMN "fileName" TEXT;
ALTER TABLE "Message" ADD COLUMN "fileSize" INTEGER;
ALTER TABLE "Message" ADD COLUMN "duration" INTEGER;

-- AlterTable: Add missionId to Conversation
ALTER TABLE "Conversation" ADD COLUMN "missionId" TEXT;

-- CreateIndex: unique constraint on Conversation.missionId
CREATE UNIQUE INDEX "Conversation_missionId_key" ON "Conversation"("missionId");

-- CreateIndex: index on Conversation.missionId
CREATE INDEX "Conversation_missionId_idx" ON "Conversation"("missionId");

-- AddForeignKey: Conversation.missionId -> Mission.id
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
