import { AnalyticsComparison, AnalyticsMetricKey, Role } from "@prisma/client";
import { ForbiddenException } from "@nestjs/common";
import { AnalyticsService } from "./analytics.service";

describe("AnalyticsService", () => {
  it("scopes setter metrics to the authenticated setter and compares periods", async () => {
    const leadFindMany = jest
      .fn()
      .mockResolvedValueOnce([
        { createdAt: new Date("2026-09-10T10:00:00Z") },
        { createdAt: new Date("2026-09-11T10:00:00Z") },
      ])
      .mockResolvedValueOnce([{ createdAt: new Date("2026-09-03T10:00:00Z") }]);
    const prisma = { lead: { findMany: leadFindMany } };
    const service = new AnalyticsService(prisma as never);

    const result = await service.query(
      {
        userId: "setter-1",
        role: Role.SETTER,
        email: "setter@example.invalid",
      },
      {
        from: "2026-09-08",
        to: "2026-09-14",
        cards: [
          {
            id: "card-1",
            metricKey: AnalyticsMetricKey.LEADS_RECEIVED,
            comparison: AnalyticsComparison.PREVIOUS_PERIOD,
          },
        ],
        filters: { setterIds: ["another-setter"] },
      },
    );

    expect(result.results["card-1"]).toMatchObject({
      value: 2,
      previous: 1,
      delta: 100,
    });
    expect(leadFindMany).toHaveBeenCalledTimes(2);
    expect(leadFindMany.mock.calls[0][0].where.setterId).toEqual({
      in: ["setter-1"],
    });
  });

  it("prevents non-admin users from querying financial metrics", async () => {
    const service = new AnalyticsService({} as never);
    await expect(
      service.query(
        {
          userId: "closer-1",
          role: Role.CLOSER,
          email: "closer@example.invalid",
        },
        {
          from: "2026-09-01",
          to: "2026-09-15",
          cards: [
            {
              id: "spend",
              metricKey: AnalyticsMetricKey.AD_SPEND,
              comparison: AnalyticsComparison.NONE,
            },
          ],
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("exposes only server-approved metric definitions", () => {
    const service = new AnalyticsService({} as never);
    const catalog = service.catalog();
    expect(catalog.length).toBeGreaterThan(10);
    expect(
      catalog.find((metric) => metric.key === "PIPELINE_FUNNEL")
        ?.visualizations,
    ).toEqual(["FUNNEL"]);
    expect(catalog.find((metric) => metric.key === "AD_SPEND")?.adminOnly).toBe(
      true,
    );
  });
});
