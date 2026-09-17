ALTER TYPE "public"."AppointmentStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';

ALTER TABLE "public"."Appointment"
  ADD COLUMN "endAt" TIMESTAMP(3),
  ADD COLUMN "title" TEXT NOT NULL DEFAULT 'Rendez-vous',
  ADD COLUMN "description" TEXT,
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
  ADD COLUMN "attendeeName" TEXT,
  ADD COLUMN "attendeeEmail" TEXT,
  ADD COLUMN "attendeePhone" TEXT,
  ADD COLUMN "meetingUrl" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "bookingEventTypeId" TEXT;

CREATE TABLE "public"."IntegrationConnection" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'USER',
  "status" TEXT NOT NULL DEFAULT 'CONNECTED',
  "displayName" TEXT,
  "accountEmail" TEXT,
  "externalAccountId" TEXT,
  "config" JSONB,
  "secretEncrypted" TEXT,
  "refreshTokenEncrypted" TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "webhookKey" TEXT NOT NULL,
  "lastSyncedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."IntegrationOAuthState" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL,
  CONSTRAINT "IntegrationOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."BookingEventType" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "durationMin" INTEGER NOT NULL DEFAULT 45,
  "color" TEXT NOT NULL DEFAULT '#6366f1',
  "appointmentType" "public"."AppointmentType" NOT NULL DEFAULT 'RV1',
  "locationType" TEXT NOT NULL DEFAULT 'GOOGLE_MEET',
  "locationValue" TEXT,
  "bufferBeforeMin" INTEGER NOT NULL DEFAULT 0,
  "bufferAfterMin" INTEGER NOT NULL DEFAULT 15,
  "minNoticeHours" INTEGER NOT NULL DEFAULT 12,
  "maxDaysAhead" INTEGER NOT NULL DEFAULT 30,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "ownerId" TEXT NOT NULL,
  CONSTRAINT "BookingEventType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."CalendarAvailabilityRule" (
  "id" TEXT NOT NULL,
  "day" "public"."DayOfWeek" NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "CalendarAvailabilityRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationConnection_webhookKey_key" ON "public"."IntegrationConnection"("webhookKey");
CREATE UNIQUE INDEX "IntegrationConnection_userId_provider_key" ON "public"."IntegrationConnection"("userId", "provider");
CREATE INDEX "IntegrationConnection_provider_status_idx" ON "public"."IntegrationConnection"("provider", "status");
CREATE INDEX "IntegrationConnection_scope_status_idx" ON "public"."IntegrationConnection"("scope", "status");
CREATE UNIQUE INDEX "IntegrationOAuthState_state_key" ON "public"."IntegrationOAuthState"("state");
CREATE INDEX "IntegrationOAuthState_provider_expiresAt_idx" ON "public"."IntegrationOAuthState"("provider", "expiresAt");
CREATE UNIQUE INDEX "BookingEventType_slug_key" ON "public"."BookingEventType"("slug");
CREATE INDEX "BookingEventType_ownerId_isActive_idx" ON "public"."BookingEventType"("ownerId", "isActive");
CREATE UNIQUE INDEX "CalendarAvailabilityRule_userId_day_startTime_endTime_key" ON "public"."CalendarAvailabilityRule"("userId", "day", "startTime", "endTime");
CREATE INDEX "CalendarAvailabilityRule_userId_day_isActive_idx" ON "public"."CalendarAvailabilityRule"("userId", "day", "isActive");
CREATE INDEX "Appointment_userId_scheduledAt_endAt_idx" ON "public"."Appointment"("userId", "scheduledAt", "endAt");
CREATE INDEX "Appointment_bookingEventTypeId_scheduledAt_idx" ON "public"."Appointment"("bookingEventTypeId", "scheduledAt");

ALTER TABLE "public"."IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."IntegrationOAuthState" ADD CONSTRAINT "IntegrationOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."BookingEventType" ADD CONSTRAINT "BookingEventType_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."CalendarAvailabilityRule" ADD CONSTRAINT "CalendarAvailabilityRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Appointment" ADD CONSTRAINT "Appointment_bookingEventTypeId_fkey" FOREIGN KEY ("bookingEventTypeId") REFERENCES "public"."BookingEventType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "public"."CalendarAvailabilityRule" (
  "id", "day", "startTime", "endTime", "timezone", "isActive", "createdAt", "updatedAt", "userId"
)
SELECT
  'availability_' || lower(u."id") || '_' || d.day,
  d.day::"public"."DayOfWeek",
  '09:00',
  '18:00',
  'Europe/Paris',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  u."id"
FROM "public"."User" u
CROSS JOIN (VALUES ('MON'), ('TUE'), ('WED'), ('THU'), ('FRI')) AS d(day)
WHERE u."role" IN ('CLOSER', 'SETTER') AND u."isActive" = true
ON CONFLICT ("userId", "day", "startTime", "endTime") DO NOTHING;
