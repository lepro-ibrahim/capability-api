-- CreateEnum
CREATE TYPE "public"."CloserReportOutcome" AS ENUM ('FOLLOW_UP', 'WON', 'LOST', 'NOT_QUALIFIED');

-- CreateEnum
CREATE TYPE "public"."CloserLedgerType" AS ENUM ('PAYMENT', 'REFUND');

-- CreateEnum
CREATE TYPE "public"."CloserLedgerStatus" AS ENUM ('PAID', 'PENDING', 'OVERDUE', 'FAILED');

-- CreateTable
CREATE TABLE "public"."CloserSettings" (
    "userId" TEXT NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "monthlyTarget" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CloserSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "public"."CloserReport" (
    "id" TEXT NOT NULL,
    "outcome" "public"."CloserReportOutcome" NOT NULL,
    "proposalMade" BOOLEAN NOT NULL DEFAULT false,
    "objections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closerId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "appointmentId" TEXT,
    CONSTRAINT "CloserReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CloserLedgerEntry" (
    "id" TEXT NOT NULL,
    "type" "public"."CloserLedgerType" NOT NULL,
    "status" "public"."CloserLedgerStatus" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "label" TEXT,
    "sourceKey" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closerId" TEXT NOT NULL,
    "leadId" TEXT,
    "contractId" TEXT,
    CONSTRAINT "CloserLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "CloserReport_appointmentId_key" ON "public"."CloserReport"("appointmentId");
CREATE INDEX "CloserReport_closerId_reportedAt_idx" ON "public"."CloserReport"("closerId", "reportedAt");
CREATE INDEX "CloserReport_leadId_reportedAt_idx" ON "public"."CloserReport"("leadId", "reportedAt");
CREATE INDEX "CloserReport_outcome_reportedAt_idx" ON "public"."CloserReport"("outcome", "reportedAt");
CREATE UNIQUE INDEX "CloserLedgerEntry_sourceKey_key" ON "public"."CloserLedgerEntry"("sourceKey");
CREATE INDEX "CloserLedgerEntry_closerId_occurredAt_idx" ON "public"."CloserLedgerEntry"("closerId", "occurredAt");
CREATE INDEX "CloserLedgerEntry_closerId_status_dueAt_idx" ON "public"."CloserLedgerEntry"("closerId", "status", "dueAt");
CREATE INDEX "CloserLedgerEntry_contractId_occurredAt_idx" ON "public"."CloserLedgerEntry"("contractId", "occurredAt");
CREATE INDEX "CloserLedgerEntry_leadId_occurredAt_idx" ON "public"."CloserLedgerEntry"("leadId", "occurredAt");

-- Foreign keys
ALTER TABLE "public"."CloserSettings" ADD CONSTRAINT "CloserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."CloserReport" ADD CONSTRAINT "CloserReport_closerId_fkey" FOREIGN KEY ("closerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."CloserReport" ADD CONSTRAINT "CloserReport_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."CloserReport" ADD CONSTRAINT "CloserReport_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "public"."Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."CloserLedgerEntry" ADD CONSTRAINT "CloserLedgerEntry_closerId_fkey" FOREIGN KEY ("closerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."CloserLedgerEntry" ADD CONSTRAINT "CloserLedgerEntry_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."CloserLedgerEntry" ADD CONSTRAINT "CloserLedgerEntry_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing contract deposits become collected payments. sourceKey makes this idempotent.
INSERT INTO "public"."CloserLedgerEntry" (
  "id", "type", "status", "amount", "label", "sourceKey", "occurredAt", "paidAt",
  "createdAt", "updatedAt", "closerId", "leadId", "contractId"
)
SELECT
  'deposit_' || c."id", 'PAYMENT'::"public"."CloserLedgerType", 'PAID'::"public"."CloserLedgerStatus",
  c."deposit", 'Acompte initial', 'contract-deposit:' || c."id", c."createdAt", c."createdAt",
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, c."userId", c."leadId", c."id"
FROM "public"."Contract" c
WHERE c."deposit" IS NOT NULL AND c."deposit" > 0
ON CONFLICT ("sourceKey") DO NOTHING;

-- Initialize every active closer with an explicit commission configuration.
INSERT INTO "public"."CloserSettings" (
  "userId", "commissionRate", "createdAt", "updatedAt"
)
SELECT u."id", 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "public"."User" u
WHERE u."role" = 'CLOSER' AND u."isActive" = true
ON CONFLICT ("userId") DO NOTHING;

-- Populate coherent demo reports from existing honored closer appointments.
-- The existing Capability dataset is synthetic; deterministic hashes keep the seed reproducible.
INSERT INTO "public"."CloserReport" (
  "id", "outcome", "proposalMade", "objections", "reportedAt", "createdAt", "updatedAt",
  "closerId", "leadId", "appointmentId"
)
SELECT
  'report_' || a."id",
  CASE
    WHEN l."stage" = 'WON' THEN 'WON'::"public"."CloserReportOutcome"
    WHEN l."stage" = 'LOST' THEN 'LOST'::"public"."CloserReportOutcome"
    WHEN l."stage" IN ('NOT_QUALIFIED', 'RV0_NOT_QUALIFIED', 'RV1_NOT_QUALIFIED') THEN 'NOT_QUALIFIED'::"public"."CloserReportOutcome"
    ELSE 'FOLLOW_UP'::"public"."CloserReportOutcome"
  END,
  (ABS(hashtext(a."id")) % 100) < 72,
  CASE ABS(hashtext(a."id")) % 5
    WHEN 0 THEN ARRAY['Prix']::TEXT[]
    WHEN 1 THEN ARRAY['Timing']::TEXT[]
    WHEN 2 THEN ARRAY['Besoin de réfléchir', 'Prix']::TEXT[]
    WHEN 3 THEN ARRAY['Financement']::TEXT[]
    ELSE ARRAY['Décideur absent']::TEXT[]
  END,
  a."scheduledAt" + interval '1 hour', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  a."userId", a."leadId", a."id"
FROM "public"."Appointment" a
JOIN "public"."Lead" l ON l."id" = a."leadId"
JOIN "public"."User" u ON u."id" = a."userId" AND u."role" = 'CLOSER'
WHERE a."type" IN ('RV1', 'RV2')
  AND a."status" = 'HONORED'
  AND a."leadId" IS NOT NULL
  AND a."userId" IS NOT NULL
ON CONFLICT ("appointmentId") DO NOTHING;
