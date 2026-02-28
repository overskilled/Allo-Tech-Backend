-- AlterTable: Make needId and quotationId optional on Mission, add appointmentId
ALTER TABLE "Mission" ALTER COLUMN "needId" DROP NOT NULL;
ALTER TABLE "Mission" ALTER COLUMN "quotationId" DROP NOT NULL;

-- AddColumn: appointmentId to Mission
ALTER TABLE "Mission" ADD COLUMN "appointmentId" TEXT;

-- CreateIndex: unique constraint on appointmentId
CREATE UNIQUE INDEX "Mission_appointmentId_key" ON "Mission"("appointmentId");

-- CreateIndex: index on appointmentId
CREATE INDEX "Mission_appointmentId_idx" ON "Mission"("appointmentId");

-- AddForeignKey: Mission.appointmentId -> Appointment.id
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
