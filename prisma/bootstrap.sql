-- Bootstrap a NEW, EMPTY database using the current Prisma schema.
-- All changes are transactional. This intentionally baselines the historical migrations.
BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') THEN
   RAISE EXCEPTION 'Refusing to bootstrap a non-empty public schema';
 END IF;
END $$;
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SETTER', 'CLOSER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('RV0', 'RV1', 'RV2');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('HONORED', 'POSTPONED', 'CANCELED', 'NO_SHOW', 'NOT_QUALIFIED');

-- CreateEnum
CREATE TYPE "BudgetPeriod" AS ENUM ('WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('LEADS_RECEIVED', 'CALL_REQUESTED', 'CALL_ATTEMPT', 'CALL_ANSWERED', 'SETTER_NO_SHOW', 'FOLLOW_UP', 'FOLLOW_UP_CLOSER', 'RV0_PLANNED', 'RV0_HONORED', 'RV0_NO_SHOW', 'RV0_POSTPONED', 'RV0_CANCELED', 'RV1_PLANNED', 'RV1_HONORED', 'RV1_NO_SHOW', 'RV1_POSTPONED', 'RV1_CANCELED', 'RV2_PLANNED', 'RV2_HONORED', 'RV2_NO_SHOW', 'RV2_POSTPONED', 'RV2_CANCELED', 'RV0_NOT_QUALIFIED', 'RV1_NOT_QUALIFIED', 'NOT_QUALIFIED', 'LOST', 'CONTRACT_SIGNED', 'WON');

-- CreateEnum
CREATE TYPE "DayPart" AS ENUM ('MORNING', 'AFTERNOON');

-- CreateEnum
CREATE TYPE "CallRequestStatus" AS ENUM ('REQUESTED', 'SCHEDULED', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('ANSWERED', 'NO_ANSWER', 'BUSY', 'VOICEMAIL', 'WRONG_NUMBER');

-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('OFF', 'DRY_RUN', 'ON');

-- CreateEnum
CREATE TYPE "PipelineMetricKey" AS ENUM ('LEADS_RECEIVED', 'CALL_REQUESTED', 'CALL_ATTEMPT', 'CALL_ANSWERED', 'SETTER_NO_SHOW', 'FOLLOW_UP', 'RV0_PLANNED', 'RV0_HONORED', 'RV0_NO_SHOW', 'RV0_CANCELED', 'RV1_PLANNED', 'RV1_HONORED', 'RV1_NO_SHOW', 'RV1_POSTPONED', 'RV1_CANCELED', 'RV2_PLANNED', 'RV2_HONORED', 'RV2_NO_SHOW', 'RV2_POSTPONED', 'RV2_CANCELED', 'WON');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "passwordHash" TEXT,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "tag" TEXT,
    "source" TEXT,
    "stage" "LeadStage" NOT NULL DEFAULT 'LEADS_RECEIVED',
    "stageUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stageId" TEXT,
    "boardColumnKey" TEXT,
    "opportunityValue" DOUBLE PRECISION,
    "saleValue" DOUBLE PRECISION,
    "setterId" TEXT,
    "closerId" TEXT,
    "ghlContactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "isWon" BOOLEAN NOT NULL DEFAULT false,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'INTERNAL',
    "externalId" TEXT NOT NULL,
    "type" "AppointmentType" NOT NULL,
    "status" "AppointmentStatus" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leadId" TEXT,
    "userId" TEXT,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "deposit" DOUBLE PRECISION,
    "monthly" DOUBLE PRECISION,
    "total" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "leadId" TEXT,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "period" "BudgetPeriod" NOT NULL,
    "amount" INTEGER NOT NULL,
    "weekStart" TIMESTAMP(3),
    "monthStart" TIMESTAMP(3),
    "caEncaisse" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Availability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" "DayOfWeek" NOT NULL,
    "part" "DayPart" NOT NULL,

    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastSetterId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallRequest" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "createdById" TEXT,
    "channel" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledAt" TIMESTAMP(3),
    "status" "CallRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallAttempt" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "outcome" "CallOutcome" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationEvent" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "contentType" TEXT,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "result" JSONB,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "AutomationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "routeKey" TEXT NOT NULL,
    "status" "AutomationStatus" NOT NULL DEFAULT 'ON',
    "mappingJson" JSONB,
    "rulesJson" JSONB,
    "metaJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetricConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardMetricConfig" (
    "id" TEXT NOT NULL,
    "key" "PipelineMetricKey" NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardMetricConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectsColumnConfig" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "stage" "LeadStage",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectsColumnConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadBoardEvent" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "columnKey" TEXT NOT NULL,
    "previousKey" TEXT,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadBoardEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadEvent" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "meta" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageEvent" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "fromStage" "LeadStage",
    "toStage" "LeadStage" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "externalId" TEXT,
    "dedupHash" TEXT,
    "userId" TEXT,

    CONSTRAINT "StageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadStageHistory" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_email_key" ON "Lead"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_ghlContactId_key" ON "Lead"("ghlContactId");

-- CreateIndex
CREATE INDEX "Lead_stage_stageUpdatedAt_idx" ON "Lead"("stage", "stageUpdatedAt");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_setterId_idx" ON "Lead"("setterId");

-- CreateIndex
CREATE INDEX "Lead_closerId_idx" ON "Lead"("closerId");

-- CreateIndex
CREATE INDEX "Lead_stage_setterId_idx" ON "Lead"("stage", "setterId");

-- CreateIndex
CREATE INDEX "Lead_stage_closerId_idx" ON "Lead"("stage", "closerId");

-- CreateIndex
CREATE INDEX "Lead_stage_createdAt_idx" ON "Lead"("stage", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_stage_stageUpdatedAt_setterId_idx" ON "Lead"("stage", "stageUpdatedAt", "setterId");

-- CreateIndex
CREATE INDEX "Lead_stage_stageUpdatedAt_closerId_idx" ON "Lead"("stage", "stageUpdatedAt", "closerId");

-- CreateIndex
CREATE INDEX "Lead_stageId_idx" ON "Lead"("stageId");

-- CreateIndex
CREATE INDEX "Lead_boardColumnKey_idx" ON "Lead"("boardColumnKey");

-- CreateIndex
CREATE UNIQUE INDEX "Stage_slug_key" ON "Stage"("slug");

-- CreateIndex
CREATE INDEX "Appointment_userId_type_scheduledAt_idx" ON "Appointment"("userId", "type", "scheduledAt");

-- CreateIndex
CREATE INDEX "Appointment_userId_type_status_scheduledAt_idx" ON "Appointment"("userId", "type", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Appointment_type_status_scheduledAt_idx" ON "Appointment"("type", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Appointment_status_scheduledAt_idx" ON "Appointment"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Appointment_leadId_type_scheduledAt_idx" ON "Appointment"("leadId", "type", "scheduledAt");

-- CreateIndex
CREATE INDEX "Appointment_leadId_type_status_scheduledAt_idx" ON "Appointment"("leadId", "type", "status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_provider_externalId_key" ON "Appointment"("provider", "externalId");

-- CreateIndex
CREATE INDEX "Contract_userId_createdAt_idx" ON "Contract"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Contract_leadId_createdAt_idx" ON "Contract"("leadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_period_weekStart_key" ON "Budget"("period", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "Availability_userId_day_part_key" ON "Availability"("userId", "day", "part");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_externalId_key" ON "WebhookEvent"("externalId");

-- CreateIndex
CREATE INDEX "WebhookEvent_type_receivedAt_idx" ON "WebhookEvent"("type", "receivedAt");

-- CreateIndex
CREATE INDEX "CallRequest_leadId_requestedAt_idx" ON "CallRequest"("leadId", "requestedAt");

-- CreateIndex
CREATE INDEX "CallRequest_status_requestedAt_idx" ON "CallRequest"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "CallRequest_createdAt_idx" ON "CallRequest"("createdAt");

-- CreateIndex
CREATE INDEX "CallAttempt_leadId_startedAt_idx" ON "CallAttempt"("leadId", "startedAt");

-- CreateIndex
CREATE INDEX "CallAttempt_userId_startedAt_idx" ON "CallAttempt"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "CallAttempt_outcome_startedAt_idx" ON "CallAttempt"("outcome", "startedAt");

-- CreateIndex
CREATE INDEX "CallAttempt_createdAt_idx" ON "CallAttempt"("createdAt");

-- CreateIndex
CREATE INDEX "AutomationEvent_automationId_receivedAt_idx" ON "AutomationEvent"("automationId", "receivedAt");

-- CreateIndex
CREATE INDEX "AutomationEvent_status_receivedAt_idx" ON "AutomationEvent"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "AutomationEvent_payloadHash_idx" ON "AutomationEvent"("payloadHash");

-- CreateIndex
CREATE UNIQUE INDEX "Automation_routeKey_key" ON "Automation"("routeKey");

-- CreateIndex
CREATE UNIQUE INDEX "MetricConfig_key_key" ON "MetricConfig"("key");

-- CreateIndex
CREATE INDEX "MetricConfig_order_idx" ON "MetricConfig"("order");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardMetricConfig_key_key" ON "DashboardMetricConfig"("key");

-- CreateIndex
CREATE INDEX "DashboardMetricConfig_position_idx" ON "DashboardMetricConfig"("position");

-- CreateIndex
CREATE INDEX "ProspectsColumnConfig_order_idx" ON "ProspectsColumnConfig"("order");

-- CreateIndex
CREATE INDEX "LeadBoardEvent_movedAt_idx" ON "LeadBoardEvent"("movedAt");

-- CreateIndex
CREATE INDEX "LeadEvent_type_occurredAt_idx" ON "LeadEvent"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "LeadEvent_leadId_occurredAt_idx" ON "LeadEvent"("leadId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "StageEvent_externalId_key" ON "StageEvent"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "StageEvent_dedupHash_key" ON "StageEvent"("dedupHash");

-- CreateIndex
CREATE INDEX "StageEvent_toStage_occurredAt_idx" ON "StageEvent"("toStage", "occurredAt");

-- CreateIndex
CREATE INDEX "StageEvent_leadId_toStage_occurredAt_idx" ON "StageEvent"("leadId", "toStage", "occurredAt");

-- CreateIndex
CREATE INDEX "StageEvent_userId_occurredAt_idx" ON "StageEvent"("userId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "StageEvent_leadId_toStage_key" ON "StageEvent"("leadId", "toStage");

-- CreateIndex
CREATE INDEX "lead_stage_by_stage_date" ON "LeadStageHistory"("stage", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeadStageHistory_leadId_stage_key" ON "LeadStageHistory"("leadId", "stage");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_setterId_fkey" FOREIGN KEY ("setterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_closerId_fkey" FOREIGN KEY ("closerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRequest" ADD CONSTRAINT "CallRequest_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRequest" ADD CONSTRAINT "CallRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallAttempt" ADD CONSTRAINT "CallAttempt_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallAttempt" ADD CONSTRAINT "CallAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallAttempt" ADD CONSTRAINT "CallAttempt_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CallRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationEvent" ADD CONSTRAINT "AutomationEvent_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadBoardEvent" ADD CONSTRAINT "LeadBoardEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEvent" ADD CONSTRAINT "LeadEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageEvent" ADD CONSTRAINT "StageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageEvent" ADD CONSTRAINT "StageEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;


CREATE TABLE "_prisma_migrations" (
 "id" VARCHAR(36) PRIMARY KEY NOT NULL,
 "checksum" VARCHAR(64) NOT NULL,
 "finished_at" TIMESTAMPTZ,
 "migration_name" VARCHAR(255) NOT NULL,
 "logs" TEXT,
 "rolled_back_at" TIMESTAMPTZ,
 "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
 "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('21ff188a-abdf-4f4c-81f5-f516ac6bdbd8', '0fa8c776dd7995ba8f32fab16d65a9f6b690ff7a3d30aa97c4cb5445fd8cc4cc', now(), '20251001113701_init', 1);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('9a1f5281-4cdb-4402-bac1-6a7c6e1151a8', 'b7b4cd140262d96c2609f4a73606f3e69418029e569fac9892746a6556605e4d', now(), '20251002180141_automation_webhooks', 1);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('ace1d627-9267-4fba-b6b2-93ee550af39d', '15c181ef5c09f3aaffd39b7308086e27990eb956b796c7264cdf002817c17301', now(), '20251004051857_stage_table_and_nullable_stageid', 1);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('90665c52-880a-401e-ad3c-37c528ce3018', '2e7716489fcd7d869d3164eee46cc5f4bc523e1d6aa53eaf762ece5c8a4fe1c6', now(), '20251004060304_stage_table_and_nullable', 1);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('a11f3be5-089e-4466-8935-3729ce8f87f9', '80fef633d9d98146ec94a42f986f2a801a466447629a3f26a20671acbc9a0ca9', now(), '20251013131533_add_metric_config', 1);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('4fadd29c-7021-439f-8c21-b5119092f515', 'd5d46eea099b06bb024cf40241b42b774e3a39256a6705636dac02ee6fd85ae5', now(), '20251013161216_add_follow_up_and_postponed_metrics', 1);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('680ce776-bceb-4963-b092-4044db6a86d8', '758f7e0de59bc3c743f817912c42c84b61e9c110e8ffc04b0ed8ffe209c24bdf', now(), '20251015141921_prospects_board_columns', 1);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('2c00c034-af97-4c19-b5c5-2a1e86ce2736', '58a046235279eb349e2301211f89e262b71029c20e05ffe1b00455889604c342', now(), '20251015192931_leadstage_pipeline_enum_v2', 1);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('22d44edc-488d-4674-aad9-21e36f8e21d5', '122d743a0403e77ad7e0ed9447f5b8826f2fbdbc55612d936eff004dd13c2eec', now(), '20251015194223_leadstage_pipeline_enum_v3', 1);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('46509566-b563-4040-8ac5-9619145f83ba', '313e74e1f24c49b47dc496ac7ba1aa907229e539270d350490aa1a6405c61dc9', now(), '20251024_baseline_current_state', 1);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('6f386770-ec91-4711-be39-b30619d391e9', '304fbefb77707c8d741b79bd61430677d5b6032c7fe765471018a145ff4b8c84', now(), '20251027211923_add_stage_events', 1);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('4deed8d0-09a1-4e76-8fbb-b1f8a93faf0e', 'da7723cbc5152aafe7a5fe81e22abcf6dc8657d9b330f05e727664bbce395b01', now(), '20251027212341_uniq_stageevent_lead_stage', 1);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('35448cdd-65b0-4b3a-95d5-4488778d455e', '2bd1663e08d8af2a9aeb63ebc30cb1cd0759c7695efee25b6e09f3cfb399f78f', now(), '20251102092150_add_lead_stage_history', 1);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('b8d59571-2b05-4678-b07d-89261562339d', '135a9f3a623b4c8c84c6346cc1c285cc04712beb70854bdc43efb9ed43296a76', now(), '20251111160442_20251102092150_add_appointment_canceled', 1);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('3491c5d1-3d4d-462f-95ef-79c829ddb9a7', '4f55157797aacf615ace0412779d66cf8615d3d79245873320a65af982fd4b10', now(), '20251114114404_add_rvx_canceled_stages', 1);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('c1c8f892-8986-4a54-a185-65bd6d1528f9', '0067d27c0186a69a8845cb4682e3e09380c2d3fe223b29f1f656f7f996ca124d', now(), '20251114114807_add_rvx_canceled_stages_1', 1);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('d6fbd23c-c3b8-4a9b-ad0d-d79bb70e58c8', '63589d887871bb0e950d586f07d3363f47e3d13a08e4cb369f35a5da5bff84bc', now(), '20251114162000_add_rvx_canceled_stages_2', 1);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('e7519705-2fb5-4069-b0db-627ed81013ae', '646dee29a7d389075244095923de9b4765a93bc9d8cb63d9927c486ad2e73eef', now(), '20251120175535_add_rv2_no_show_stages', 1);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('e1f4ab9d-bbc0-49d2-8e96-5073430f06ec', 'f3d7d4d810387b2d98a85ae7bce80fd3f7f9c131db8080e4388ed04ada5bff83', now(), '20251127062501_add_user_to_stage_event', 1);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('0681b3f9-a72e-49f5-825b-921e98e7e692', 'a4b41462e6f35dcf4787a619028d35ab94193c7805b96e83936eab735a473526', now(), '20251127073435_add_rv_non_qualified_stages', 1);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('9ef83fcb-3f17-4bc7-9521-619ef30ec988', 'a1a8f1176c12678c8a7f5e7f6f28659e06174986207e35c002f31b45b2b623a8', now(), '20251127074451_add_follow_up_closer', 1);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('816fec2b-332f-453f-bdbd-c1e02fde0a52', '90f98df7372665969737cbd5f73a64f2b12d38cbdcc23ec0a86892146f6fee37', now(), '20251128063108_add_contract_signed_stage', 1);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ('74ae3850-78ee-4c1c-a535-8ed0144ab121', '86dc3a5cd00f3a0282bd3c8694a8a40b539d252f4de5d9d4342f7a48d8a6d0d2', now(), '20251128080422_mise_a_jour_model_budget', 1);
COMMIT;
