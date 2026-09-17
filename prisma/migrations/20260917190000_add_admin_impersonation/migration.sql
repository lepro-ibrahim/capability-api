-- CreateTable
CREATE TABLE "ImpersonationSession" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "actorId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,

    CONSTRAINT "ImpersonationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImpersonationAuditLog" (
    "id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,

    CONSTRAINT "ImpersonationAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImpersonationSession_actorId_startedAt_idx" ON "ImpersonationSession"("actorId", "startedAt");
CREATE INDEX "ImpersonationSession_targetId_startedAt_idx" ON "ImpersonationSession"("targetId", "startedAt");
CREATE INDEX "ImpersonationSession_endedAt_idx" ON "ImpersonationSession"("endedAt");
CREATE INDEX "ImpersonationAuditLog_sessionId_createdAt_idx" ON "ImpersonationAuditLog"("sessionId", "createdAt");
CREATE INDEX "ImpersonationAuditLog_actorId_createdAt_idx" ON "ImpersonationAuditLog"("actorId", "createdAt");
CREATE INDEX "ImpersonationAuditLog_targetId_createdAt_idx" ON "ImpersonationAuditLog"("targetId", "createdAt");

-- AddForeignKey
ALTER TABLE "ImpersonationSession" ADD CONSTRAINT "ImpersonationSession_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImpersonationSession" ADD CONSTRAINT "ImpersonationSession_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImpersonationAuditLog" ADD CONSTRAINT "ImpersonationAuditLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ImpersonationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImpersonationAuditLog" ADD CONSTRAINT "ImpersonationAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImpersonationAuditLog" ADD CONSTRAINT "ImpersonationAuditLog_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
