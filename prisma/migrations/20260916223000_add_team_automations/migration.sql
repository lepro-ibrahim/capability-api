CREATE TYPE "TeamAutomationStatus" AS ENUM ('ACTIVE', 'PAUSED');
CREATE TYPE "TeamAutomationTrigger" AS ENUM ('LEAD_STAGE_CHANGED');
CREATE TYPE "TeamAutomationRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED');
CREATE TYPE "TeamTaskStatus" AS ENUM ('TODO', 'DONE', 'CANCELED');
CREATE TYPE "TeamTaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

CREATE TABLE "TeamAutomationRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "TeamAutomationStatus" NOT NULL DEFAULT 'ACTIVE',
    "trigger" "TeamAutomationTrigger" NOT NULL,
    "triggerConfig" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeamAutomationRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamAutomationRun" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "triggerKey" TEXT NOT NULL,
    "status" "TeamAutomationRunStatus" NOT NULL DEFAULT 'RUNNING',
    "context" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "TeamAutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TeamTaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "TeamTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "assigneeId" TEXT NOT NULL,
    "leadId" TEXT,
    "ruleId" TEXT,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeamTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamNotification" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'AUTOMATION',
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "metadata" JSONB,
    "userId" TEXT NOT NULL,
    "ruleId" TEXT,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TeamAutomationRule_status_trigger_idx" ON "TeamAutomationRule"("status", "trigger");
CREATE INDEX "TeamAutomationRule_createdById_updatedAt_idx" ON "TeamAutomationRule"("createdById", "updatedAt");
CREATE UNIQUE INDEX "TeamAutomationRun_ruleId_triggerKey_key" ON "TeamAutomationRun"("ruleId", "triggerKey");
CREATE INDEX "TeamAutomationRun_status_startedAt_idx" ON "TeamAutomationRun"("status", "startedAt");
CREATE INDEX "TeamTask_assigneeId_status_dueAt_idx" ON "TeamTask"("assigneeId", "status", "dueAt");
CREATE INDEX "TeamTask_leadId_createdAt_idx" ON "TeamTask"("leadId", "createdAt");
CREATE INDEX "TeamTask_ruleId_createdAt_idx" ON "TeamTask"("ruleId", "createdAt");
CREATE INDEX "TeamNotification_userId_readAt_createdAt_idx" ON "TeamNotification"("userId", "readAt", "createdAt");
CREATE INDEX "TeamNotification_ruleId_createdAt_idx" ON "TeamNotification"("ruleId", "createdAt");

ALTER TABLE "TeamAutomationRule" ADD CONSTRAINT "TeamAutomationRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeamAutomationRun" ADD CONSTRAINT "TeamAutomationRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "TeamAutomationRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeamTask" ADD CONSTRAINT "TeamTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeamTask" ADD CONSTRAINT "TeamTask_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TeamTask" ADD CONSTRAINT "TeamTask_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "TeamAutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TeamTask" ADD CONSTRAINT "TeamTask_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TeamAutomationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TeamNotification" ADD CONSTRAINT "TeamNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeamNotification" ADD CONSTRAINT "TeamNotification_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "TeamAutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TeamNotification" ADD CONSTRAINT "TeamNotification_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TeamAutomationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
