import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AnalyticsCardType,
  AnalyticsComparison,
  AnalyticsMetricKey,
  AnalyticsValueFormat,
  DashboardVisibility,
  LeadStage,
  Prisma,
  Role,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  AnalyticsQueryDto,
  AnalyticsQueryFiltersDto,
  CreateCardDto,
  CreateDashboardDto,
  UpdateCardDto,
  UpdateDashboardDto,
} from "./dto/analytics.dto";

type AuthUser = { userId: string; role: Role; email: string };
type DateRange = { start: Date; end: Date };
type SeriesPoint = { date: string; value: number };
type FunnelSegment = { key: string; label: string; value: number };
type MetricResult = {
  value: number;
  series?: SeriesPoint[];
  segments?: FunnelSegment[];
};

const STAGE_METRICS: Partial<Record<AnalyticsMetricKey, LeadStage>> = {
  CALL_REQUESTED: LeadStage.CALL_REQUESTED,
  CALL_ATTEMPT: LeadStage.CALL_ATTEMPT,
  CALL_ANSWERED: LeadStage.CALL_ANSWERED,
  RV0_PLANNED: LeadStage.RV0_PLANNED,
  RV0_HONORED: LeadStage.RV0_HONORED,
  RV1_PLANNED: LeadStage.RV1_PLANNED,
  RV1_HONORED: LeadStage.RV1_HONORED,
  CONTRACT_SIGNED: LeadStage.CONTRACT_SIGNED,
  WON: LeadStage.WON,
};

const FINANCIAL_METRICS = new Set<AnalyticsMetricKey>([
  AnalyticsMetricKey.CASH_IN,
  AnalyticsMetricKey.AD_SPEND,
  AnalyticsMetricKey.ROAS,
]);

const CATALOG = [
  [
    "LEADS_RECEIVED",
    "Leads reçus",
    "Prospects créés sur la période",
    "NUMBER",
    ["KPI", "LINE"],
  ],
  [
    "CALL_REQUESTED",
    "Demandes d'appel",
    "Prospects entrés en demande d'appel",
    "NUMBER",
    ["KPI", "LINE"],
  ],
  [
    "CALL_ATTEMPT",
    "Appels passés",
    "Prospects ayant eu au moins une tentative d'appel",
    "NUMBER",
    ["KPI", "LINE"],
  ],
  [
    "CALL_ANSWERED",
    "Appels répondus",
    "Prospects joints par un setter",
    "NUMBER",
    ["KPI", "LINE"],
  ],
  [
    "RV0_PLANNED",
    "RV0 planifiés",
    "Premiers rendez-vous planifiés",
    "NUMBER",
    ["KPI", "LINE"],
  ],
  [
    "RV0_HONORED",
    "RV0 honorés",
    "Premiers rendez-vous honorés",
    "NUMBER",
    ["KPI", "LINE"],
  ],
  [
    "RV1_PLANNED",
    "RDV closer planifiés",
    "Rendez-vous closer planifiés",
    "NUMBER",
    ["KPI", "LINE"],
  ],
  [
    "RV1_HONORED",
    "RDV closer honorés",
    "Rendez-vous closer honorés",
    "NUMBER",
    ["KPI", "LINE"],
  ],
  [
    "CONTRACT_SIGNED",
    "Contrats signés",
    "Prospects ayant signé un contrat",
    "NUMBER",
    ["KPI", "LINE"],
  ],
  [
    "WON",
    "Ventes",
    "Prospects gagnés sur la période",
    "NUMBER",
    ["KPI", "LINE"],
  ],
  [
    "REVENUE",
    "Chiffre d'affaires",
    "Montant des ventes gagnées",
    "CURRENCY",
    ["KPI", "LINE"],
  ],
  [
    "CASH_IN",
    "CA encaissé",
    "Encaissements enregistrés dans les budgets",
    "CURRENCY",
    ["KPI"],
  ],
  [
    "AD_SPEND",
    "Dépenses publicitaires",
    "Budgets publicitaires hebdomadaires",
    "CURRENCY",
    ["KPI"],
  ],
  [
    "CLOSING_RATE",
    "Taux de closing",
    "Ventes divisées par les RDV closer honorés",
    "PERCENTAGE",
    ["KPI"],
  ],
  [
    "SHOW_RATE",
    "Taux de présence",
    "RDV closer honorés divisés par les RDV planifiés",
    "PERCENTAGE",
    ["KPI"],
  ],
  [
    "ROAS",
    "ROAS",
    "Chiffre d'affaires divisé par les dépenses",
    "NUMBER",
    ["KPI"],
  ],
  [
    "PIPELINE_FUNNEL",
    "Funnel commercial",
    "Progression du lead à la vente",
    "NUMBER",
    ["FUNNEL"],
  ],
] as const;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  catalog() {
    return CATALOG.map(([key, label, description, format, visualizations]) => ({
      key,
      label,
      description,
      format,
      visualizations,
      adminOnly: FINANCIAL_METRICS.has(key as AnalyticsMetricKey),
    }));
  }

  async listDashboards(user: AuthUser) {
    const where: Prisma.AnalyticsDashboardWhereInput = {
      OR: [
        { ownerId: user.userId },
        {
          visibility: DashboardVisibility.ORGANIZATION,
          OR: [{ roleScope: null }, { roleScope: user.role }],
        },
      ],
    };
    let dashboards = await this.prisma.analyticsDashboard.findMany({
      where,
      include: { cards: { orderBy: { sortOrder: "asc" } } },
      orderBy: [
        { isDefault: "desc" },
        { sortOrder: "asc" },
        { createdAt: "asc" },
      ],
    });
    if (!dashboards.length) {
      await this.createStarterDashboard(user);
      dashboards = await this.prisma.analyticsDashboard.findMany({
        where,
        include: { cards: { orderBy: { sortOrder: "asc" } } },
        orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
      });
    }
    return dashboards;
  }

  async getDashboard(user: AuthUser, id: string) {
    const dashboard = await this.prisma.analyticsDashboard.findUnique({
      where: { id },
      include: {
        cards: { orderBy: { sortOrder: "asc" } },
        owner: { select: { id: true, firstName: true, email: true } },
      },
    });
    if (!dashboard || !this.canView(user, dashboard)) {
      throw new NotFoundException("Tableau introuvable");
    }
    return dashboard;
  }

  async createDashboard(user: AuthUser, body: CreateDashboardDto) {
    const visibility = body.visibility ?? DashboardVisibility.PERSONAL;
    if (
      visibility === DashboardVisibility.ORGANIZATION &&
      user.role !== Role.ADMIN
    ) {
      throw new ForbiddenException(
        "Seul un administrateur peut publier un tableau à l'organisation",
      );
    }
    return this.prisma.analyticsDashboard.create({
      data: {
        name: body.name.trim(),
        description: body.description?.trim() || null,
        visibility,
        roleScope:
          visibility === DashboardVisibility.ORGANIZATION
            ? body.roleScope
            : null,
        ownerId: user.userId,
        filters: {},
      },
      include: { cards: true },
    });
  }

  async updateDashboard(user: AuthUser, id: string, body: UpdateDashboardDto) {
    const dashboard = await this.requireManageDashboard(user, id);
    if (
      body.visibility === DashboardVisibility.ORGANIZATION &&
      user.role !== Role.ADMIN
    ) {
      throw new ForbiddenException(
        "Seul un administrateur peut publier un tableau à l'organisation",
      );
    }
    if (body.isDefault) {
      await this.prisma.analyticsDashboard.updateMany({
        where: { ownerId: dashboard.ownerId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return this.prisma.analyticsDashboard.update({
      where: { id },
      data: {
        name: body.name?.trim(),
        description:
          body.description === undefined
            ? undefined
            : body.description.trim() || null,
        visibility: body.visibility,
        roleScope:
          body.visibility === DashboardVisibility.PERSONAL
            ? null
            : body.roleScope,
        isDefault: body.isDefault,
        sortOrder: body.sortOrder,
      },
      include: { cards: { orderBy: { sortOrder: "asc" } } },
    });
  }

  async duplicateDashboard(user: AuthUser, id: string) {
    const source = await this.getDashboard(user, id);
    return this.prisma.analyticsDashboard.create({
      data: {
        name: `${source.name} — copie`,
        description: source.description,
        visibility: DashboardVisibility.PERSONAL,
        ownerId: user.userId,
        filters: (source.filters ?? {}) as Prisma.InputJsonValue,
        cards: {
          create: source.cards.map((card) => ({
            title: card.title,
            subtitle: card.subtitle,
            type: card.type,
            metricKey: card.metricKey,
            valueFormat: card.valueFormat,
            comparison: card.comparison,
            filters: (card.filters ?? {}) as Prisma.InputJsonValue,
            layout: card.layout as Prisma.InputJsonValue,
            sortOrder: card.sortOrder,
          })),
        },
      },
      include: { cards: { orderBy: { sortOrder: "asc" } } },
    });
  }

  async createCard(user: AuthUser, dashboardId: string, body: CreateCardDto) {
    await this.requireManageDashboard(user, dashboardId);
    this.validateMetricAccess(user, body.metricKey);
    this.validateVisualization(body.metricKey, body.type);
    return this.prisma.analyticsCard.create({
      data: {
        dashboardId,
        title: body.title.trim(),
        subtitle: body.subtitle?.trim() || null,
        type: body.type,
        metricKey: body.metricKey,
        valueFormat: body.valueFormat,
        comparison: body.comparison ?? AnalyticsComparison.PREVIOUS_PERIOD,
        layout: { ...body.layout },
        filters: {},
        sortOrder: body.sortOrder ?? 0,
      },
    });
  }

  async updateCard(user: AuthUser, id: string, body: UpdateCardDto) {
    const card = await this.prisma.analyticsCard.findUnique({
      where: { id },
      include: { dashboard: true },
    });
    if (!card) throw new NotFoundException("Carte introuvable");
    await this.requireManageDashboard(user, card.dashboardId);
    const metricKey = body.metricKey ?? card.metricKey;
    const type = body.type ?? card.type;
    this.validateMetricAccess(user, metricKey);
    this.validateVisualization(metricKey, type);
    return this.prisma.analyticsCard.update({
      where: { id },
      data: {
        title: body.title?.trim(),
        subtitle:
          body.subtitle === undefined
            ? undefined
            : body.subtitle.trim() || null,
        type: body.type,
        metricKey: body.metricKey,
        valueFormat: body.valueFormat,
        comparison: body.comparison,
        layout: body.layout ? { ...body.layout } : undefined,
        sortOrder: body.sortOrder,
      },
    });
  }

  async deleteCard(user: AuthUser, id: string) {
    const card = await this.prisma.analyticsCard.findUnique({ where: { id } });
    if (!card) throw new NotFoundException("Carte introuvable");
    await this.requireManageDashboard(user, card.dashboardId);
    await this.prisma.analyticsCard.delete({ where: { id } });
    return { ok: true };
  }

  async query(user: AuthUser, body: AnalyticsQueryDto) {
    if (body.cards.length > 40)
      throw new BadRequestException("Maximum 40 cartes par requête");
    const current = this.parseRange(body.from, body.to);
    const duration = current.end.getTime() - current.start.getTime();
    const previous = {
      start: new Date(current.start.getTime() - duration),
      end: new Date(current.start),
    };
    const filters = this.scopedFilters(user, body.filters);
    const cache = new Map<string, Promise<MetricResult>>();
    const computeCached = (key: AnalyticsMetricKey, range: DateRange) => {
      const cacheKey = `${key}:${range.start.toISOString()}:${range.end.toISOString()}`;
      const found = cache.get(cacheKey);
      if (found) return found;
      const promise = this.computeMetric(key, range, filters);
      cache.set(cacheKey, promise);
      return promise;
    };

    const rows = await Promise.all(
      body.cards.map(async (card) => {
        this.validateMetricAccess(user, card.metricKey);
        const value = await computeCached(card.metricKey, current);
        const previousValue =
          card.comparison === AnalyticsComparison.PREVIOUS_PERIOD
            ? await computeCached(card.metricKey, previous)
            : null;
        const delta =
          previousValue && previousValue.value !== 0
            ? Number(
                (
                  ((value.value - previousValue.value) / previousValue.value) *
                  100
                ).toFixed(1),
              )
            : null;
        return [
          card.id,
          { ...value, previous: previousValue?.value ?? null, delta },
        ] as const;
      }),
    );
    return {
      period: { from: body.from, to: body.to },
      results: Object.fromEntries(rows),
    };
  }

  private async createStarterDashboard(user: AuthUser) {
    const dashboard = await this.prisma.analyticsDashboard.create({
      data: {
        name: "Vue pilotage",
        description: "Les signaux essentiels du marketing jusqu’à la vente.",
        visibility: DashboardVisibility.PERSONAL,
        isDefault: true,
        ownerId: user.userId,
        filters: {},
      },
    });
    const cards: Array<
      [
        string,
        AnalyticsMetricKey,
        AnalyticsCardType,
        AnalyticsValueFormat,
        number,
        number,
      ]
    > = [
      [
        "Leads reçus",
        AnalyticsMetricKey.LEADS_RECEIVED,
        AnalyticsCardType.KPI,
        AnalyticsValueFormat.NUMBER,
        0,
        3,
      ],
      [
        "RDV closer honorés",
        AnalyticsMetricKey.RV1_HONORED,
        AnalyticsCardType.KPI,
        AnalyticsValueFormat.NUMBER,
        1,
        3,
      ],
      [
        "Ventes",
        AnalyticsMetricKey.WON,
        AnalyticsCardType.KPI,
        AnalyticsValueFormat.NUMBER,
        2,
        3,
      ],
      [
        "Chiffre d'affaires",
        AnalyticsMetricKey.REVENUE,
        AnalyticsCardType.KPI,
        AnalyticsValueFormat.CURRENCY,
        3,
        3,
      ],
      [
        "Taux de closing",
        AnalyticsMetricKey.CLOSING_RATE,
        AnalyticsCardType.KPI,
        AnalyticsValueFormat.PERCENTAGE,
        4,
        3,
      ],
      [
        "Évolution des leads",
        AnalyticsMetricKey.LEADS_RECEIVED,
        AnalyticsCardType.LINE,
        AnalyticsValueFormat.NUMBER,
        5,
        6,
      ],
      [
        "Funnel commercial",
        AnalyticsMetricKey.PIPELINE_FUNNEL,
        AnalyticsCardType.FUNNEL,
        AnalyticsValueFormat.NUMBER,
        6,
        6,
      ],
    ];
    await this.prisma.analyticsCard.createMany({
      data: cards.map(
        ([title, metricKey, type, valueFormat, sortOrder, w]) => ({
          dashboardId: dashboard.id,
          title,
          type,
          metricKey,
          valueFormat,
          comparison:
            type === AnalyticsCardType.FUNNEL
              ? AnalyticsComparison.NONE
              : AnalyticsComparison.PREVIOUS_PERIOD,
          filters: {},
          layout: {
            x: (sortOrder * 3) % 12,
            y: Math.floor(sortOrder / 4) * 2,
            w,
            h: type === AnalyticsCardType.KPI ? 2 : 4,
          },
          sortOrder,
        }),
      ),
    });
  }

  private canView(
    user: AuthUser,
    dashboard: {
      ownerId: string;
      visibility: DashboardVisibility;
      roleScope: Role | null;
    },
  ) {
    return (
      dashboard.ownerId === user.userId ||
      (dashboard.visibility === DashboardVisibility.ORGANIZATION &&
        (!dashboard.roleScope || dashboard.roleScope === user.role))
    );
  }

  private async requireManageDashboard(user: AuthUser, id: string) {
    const dashboard = await this.prisma.analyticsDashboard.findUnique({
      where: { id },
    });
    if (!dashboard) throw new NotFoundException("Tableau introuvable");
    if (dashboard.ownerId !== user.userId && user.role !== Role.ADMIN) {
      throw new ForbiddenException("Vous ne pouvez pas modifier ce tableau");
    }
    return dashboard;
  }

  private validateMetricAccess(user: AuthUser, metricKey: AnalyticsMetricKey) {
    if (FINANCIAL_METRICS.has(metricKey) && user.role !== Role.ADMIN) {
      throw new ForbiddenException(
        "Cette métrique financière est réservée aux administrateurs",
      );
    }
  }

  private validateVisualization(
    metricKey: AnalyticsMetricKey,
    type: AnalyticsCardType,
  ) {
    if (
      (metricKey === AnalyticsMetricKey.PIPELINE_FUNNEL) !==
      (type === AnalyticsCardType.FUNNEL)
    ) {
      throw new BadRequestException(
        "Le funnel nécessite la visualisation Funnel",
      );
    }
    const definition = CATALOG.find(([key]) => key === metricKey);
    if (!definition || !(definition[4] as readonly string[]).includes(type)) {
      throw new BadRequestException(
        "Visualisation incompatible avec cette métrique",
      );
    }
  }

  private parseRange(from: string, to: string): DateRange {
    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start >= end
    ) {
      throw new BadRequestException("Période invalide");
    }
    return { start, end };
  }

  private scopedFilters(
    user: AuthUser,
    input?: AnalyticsQueryFiltersDto,
  ): AnalyticsQueryFiltersDto {
    const filters = { ...input };
    if (user.role === Role.SETTER) filters.setterIds = [user.userId];
    if (user.role === Role.CLOSER) filters.closerIds = [user.userId];
    return filters;
  }

  private leadWhere(filters: AnalyticsQueryFiltersDto): Prisma.LeadWhereInput {
    const sourceFilter =
      filters.sources?.length || filters.excludeSources?.length
        ? {
            source: {
              ...(filters.sources?.length ? { in: filters.sources } : {}),
              ...(filters.excludeSources?.length
                ? { notIn: filters.excludeSources }
                : {}),
            },
          }
        : {};
    return {
      ...sourceFilter,
      ...(filters.setterIds?.length
        ? { setterId: { in: filters.setterIds } }
        : {}),
      ...(filters.closerIds?.length
        ? { closerId: { in: filters.closerIds } }
        : {}),
      ...(filters.tags?.length ? { tag: { in: filters.tags } } : {}),
    };
  }

  private async computeMetric(
    key: AnalyticsMetricKey,
    range: DateRange,
    filters: AnalyticsQueryFiltersDto,
  ): Promise<MetricResult> {
    if (key === AnalyticsMetricKey.PIPELINE_FUNNEL)
      return this.computeFunnel(range, filters);
    if (key === AnalyticsMetricKey.CLOSING_RATE) {
      const [won, honored] = await Promise.all([
        this.computeMetric(AnalyticsMetricKey.WON, range, filters),
        this.computeMetric(AnalyticsMetricKey.RV1_HONORED, range, filters),
      ]);
      return {
        value: honored.value
          ? Number(((won.value / honored.value) * 100).toFixed(1))
          : 0,
      };
    }
    if (key === AnalyticsMetricKey.SHOW_RATE) {
      const [honored, planned] = await Promise.all([
        this.computeMetric(AnalyticsMetricKey.RV1_HONORED, range, filters),
        this.computeMetric(AnalyticsMetricKey.RV1_PLANNED, range, filters),
      ]);
      return {
        value: planned.value
          ? Number(((honored.value / planned.value) * 100).toFixed(1))
          : 0,
      };
    }
    if (key === AnalyticsMetricKey.ROAS) {
      const [revenue, spend] = await Promise.all([
        this.computeMetric(AnalyticsMetricKey.REVENUE, range, filters),
        this.computeMetric(AnalyticsMetricKey.AD_SPEND, range, filters),
      ]);
      return {
        value: spend.value
          ? Number((revenue.value / spend.value).toFixed(2))
          : 0,
      };
    }
    if (
      key === AnalyticsMetricKey.AD_SPEND ||
      key === AnalyticsMetricKey.CASH_IN
    ) {
      const rows = await this.prisma.budget.findMany({
        where: {
          period: "WEEKLY",
          weekStart: { gte: range.start, lt: range.end },
        },
        select: { amount: true, caEncaisse: true },
      });
      return {
        value: rows.reduce(
          (sum, row) =>
            sum +
            (key === AnalyticsMetricKey.AD_SPEND ? row.amount : row.caEncaisse),
          0,
        ),
      };
    }
    if (key === AnalyticsMetricKey.LEADS_RECEIVED) {
      const rows = await this.prisma.lead.findMany({
        where: {
          ...this.leadWhere(filters),
          createdAt: { gte: range.start, lt: range.end },
        },
        select: { createdAt: true },
      });
      return {
        value: rows.length,
        series: this.toSeries(
          rows.map((row) => ({ date: row.createdAt, value: 1 })),
        ),
      };
    }
    if (key === AnalyticsMetricKey.REVENUE) {
      const rows = await this.prisma.stageEvent.findMany({
        where: {
          toStage: LeadStage.WON,
          occurredAt: { gte: range.start, lt: range.end },
          lead: this.leadWhere(filters),
        },
        select: { occurredAt: true, lead: { select: { saleValue: true } } },
      });
      const values = rows.map((row) => ({
        date: row.occurredAt,
        value: row.lead.saleValue ?? 0,
      }));
      return {
        value: values.reduce((sum, row) => sum + row.value, 0),
        series: this.toSeries(values),
      };
    }
    const stage = STAGE_METRICS[key];
    if (!stage) throw new BadRequestException("Métrique non prise en charge");
    const rows = await this.prisma.stageEvent.findMany({
      where: {
        toStage: stage,
        occurredAt: { gte: range.start, lt: range.end },
        lead: this.leadWhere(filters),
      },
      select: { occurredAt: true },
    });
    return {
      value: rows.length,
      series: this.toSeries(
        rows.map((row) => ({ date: row.occurredAt, value: 1 })),
      ),
    };
  }

  private async computeFunnel(
    range: DateRange,
    filters: AnalyticsQueryFiltersDto,
  ): Promise<MetricResult> {
    const definitions: Array<[AnalyticsMetricKey, string]> = [
      [AnalyticsMetricKey.LEADS_RECEIVED, "Leads"],
      [AnalyticsMetricKey.CALL_ANSWERED, "Joints"],
      [AnalyticsMetricKey.RV0_PLANNED, "RV0"],
      [AnalyticsMetricKey.RV1_PLANNED, "RDV closer"],
      [AnalyticsMetricKey.RV1_HONORED, "Honorés"],
      [AnalyticsMetricKey.WON, "Ventes"],
    ];
    const values = await Promise.all(
      definitions.map(([key]) => this.computeMetric(key, range, filters)),
    );
    const segments = definitions.map(([key, label], index) => ({
      key,
      label,
      value: values[index].value,
    }));
    return { value: values.at(-1)?.value ?? 0, segments };
  }

  private toSeries(rows: Array<{ date: Date; value: number }>): SeriesPoint[] {
    const buckets = new Map<string, number>();
    for (const row of rows) {
      const day = row.date.toISOString().slice(0, 10);
      buckets.set(day, (buckets.get(day) ?? 0) + row.value);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, value }));
  }
}
