-- CreateEnum
CREATE TYPE "PaymentScope" AS ENUM ('FULL', 'LABOR_ONLY');

-- AlterTable: payment scope + platform commission + technician payout on quotations
ALTER TABLE "Quotation" ADD COLUMN     "paymentScope" "PaymentScope" NOT NULL DEFAULT 'FULL',
ADD COLUMN     "platformCommission" DECIMAL(10,2),
ADD COLUMN     "payoutAmount" DECIMAL(10,2);
