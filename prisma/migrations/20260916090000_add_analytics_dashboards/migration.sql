CREATE TYPE "DashboardVisibility" AS ENUM ('PERSONAL', 'ORGANIZATION');
CREATE TYPE "AnalyticsCardType" AS ENUM ('KPI', 'LINE', 'FUNNEL');
CREATE TYPE "AnalyticsMetricKey" AS ENUM ('LEADS_RECEIVED', 'CALL_REQUESTED', 'CALL_ATTEMPT', 'CALL_ANSWERED', 'RV0_PLANNED', 'RV0_HONORED', 'RV1_PLANNED', 'RV1_HONORED', 'CONTRACT_SIGNED', 'WON', 'REVENUE', 'CASH_IN', 'AD_SPEND', 'CLOSING_RATE', 'SHOW_RATE', 'ROAS', 'PIPELINE_FUNNEL');
CREATE TYPE "AnalyticsValueFormat" AS ENUM ('NUMBER', 'CURRENCY', 'PERCENTAGE');
CREATE TYPE "AnalyticsComparison" AS ENUM ('NONE', 'PREVIOUS_PERIOD');

CREATE TABLE "AnalyticsDashboard" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "visibility" "DashboardVisibility" NOT NULL DEFAULT 'PERSONAL',
  "roleScope" "Role",
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "filters" JSONB,
  "ownerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnalyticsDashboard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnalyticsCard" (
  "id" TEXT NOT NULL,
  "dashboardId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "subtitle" TEXT,
  "type" "AnalyticsCardType" NOT NULL DEFAULT 'KPI',
  "metricKey" "AnalyticsMetricKey" NOT NULL,
  "valueFormat" "AnalyticsValueFormat" NOT NULL DEFAULT 'NUMBER',
  "comparison" "AnalyticsComparison" NOT NULL DEFAULT 'PREVIOUS_PERIOD',
  "filters" JSONB,
  "layout" JSONB NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnalyticsCard_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnalyticsDashboard_ownerId_sortOrder_idx" ON "AnalyticsDashboard"("ownerId", "sortOrder");
CREATE INDEX "AnalyticsDashboard_visibility_roleScope_idx" ON "AnalyticsDashboard"("visibility", "roleScope");
CREATE INDEX "AnalyticsCard_dashboardId_sortOrder_idx" ON "AnalyticsCard"("dashboardId", "sortOrder");
ALTER TABLE "AnalyticsDashboard" ADD CONSTRAINT "AnalyticsDashboard_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalyticsCard" ADD CONSTRAINT "AnalyticsCard_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "AnalyticsDashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
