import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateProspectEventDto,
  StageDto,
  normalizeStage,
} from './dto/create-prospect-event.dto';

import { PrismaService } from '../prisma/prisma.service';
import { LeadStage, Role } from '@prisma/client';
import { StageEventsService } from '../modules/leads/stage-events.service';

/* =========================================================
   ========  NOUVEAU : Catalogue & colonnes ops  =========== 
   ========================================================= */


export type PipelineMetricKey =
  | 'LEADS_RECEIVED'
  | 'CALL_REQUESTED'
  | 'CALL_ATTEMPT'
  | 'CALL_ANSWERED'
  | 'SETTER_NO_SHOW'
  | 'FOLLOW_UP'
  | 'FOLLOW_UP_CLOSER'
  | 'RV0_PLANNED'
  | 'RV0_HONORED'
  | 'RV0_NO_SHOW'
  | 'RV0_POSTPONED'
  | 'RV0_CANCELED'
  | 'RV1_PLANNED'
  | 'RV1_HONORED'
  | 'RV1_NO_SHOW'
  | 'RV1_POSTPONED'
  | 'RV1_CANCELED'
  | 'RV2_PLANNED'
  | 'RV2_HONORED'
  | 'RV2_NO_SHOW'
  | 'RV2_POSTPONED'
  | 'RV2_CANCELED'
  | 'RV0_NOT_QUALIFIED'
  | 'RV1_NOT_QUALIFIED'
  | 'NOT_QUALIFIED'
  | 'LOST'
  | 'CONTRACT_SIGNED'
  | 'WON'
  | 'APPOINTMENT_CANCELED';


const DEFAULT_METRICS: Array<{
  key: PipelineMetricKey;
  label: string;
  sourcePath: string;
  order: number;
  enabled: boolean;
}> = [
  { key: 'LEADS_RECEIVED',       label: 'Leads reçus',                sourcePath: 'funnel.totals.leads',               order: 0,    enabled: true },
  { key: 'CALL_REQUESTED',       label: 'Demandes d’appel',           sourcePath: 'funnel.totals.callRequests',        order: 1,    enabled: true },
  { key: 'CALL_ATTEMPT',         label: 'Appels passés',              sourcePath: 'funnel.totals.callsTotal',          order: 2,    enabled: true },
  { key: 'CALL_ANSWERED',        label: 'Appels répondus',            sourcePath: 'funnel.totals.callsAnswered',       order: 3,    enabled: true },
  { key: 'SETTER_NO_SHOW',       label: 'No-show Setter',             sourcePath: 'funnel.totals.setterNoShow',        order: 4,    enabled: true },
  { key: 'FOLLOW_UP',            label: 'Follow Up (Setter)',         sourcePath: 'funnel.totals.followUp',            order: 5,    enabled: true },
  { key: 'FOLLOW_UP_CLOSER',     label: 'Follow Up Closer',           sourcePath: 'funnel.totals.followUpCloser',      order: 5.5,  enabled: true },

  { key: 'RV0_PLANNED',          label: 'RV0 planifiés',              sourcePath: 'funnel.totals.rv0Planned',          order: 6,    enabled: true },
  { key: 'RV0_HONORED',          label: 'RV0 honorés',                sourcePath: 'funnel.totals.rv0Honored',          order: 7,    enabled: true },
  { key: 'RV0_NO_SHOW',          label: 'RV0 no-show',                sourcePath: 'funnel.totals.rv0NoShow',           order: 8,    enabled: true },
  { key: 'RV0_POSTPONED',        label: 'RV0 reportés',               sourcePath: 'funnel.totals.rv0Postponed',        order: 8.2,  enabled: false },
  { key: 'RV0_CANCELED',         label: 'RV0 annulés',                sourcePath: 'funnel.totals.rv0Canceled',         order: 8.5,  enabled: false },

  { key: 'RV1_PLANNED',          label: 'RV1 planifiés',              sourcePath: 'funnel.totals.rv1Planned',          order: 9,    enabled: true },
  { key: 'RV1_HONORED',          label: 'RV1 honorés',                sourcePath: 'funnel.totals.rv1Honored',          order: 10,   enabled: true },
  { key: 'RV1_NO_SHOW',          label: 'RV1 no-show',                sourcePath: 'funnel.totals.rv1NoShow',           order: 11,   enabled: true },
  { key: 'RV1_POSTPONED',        label: 'RV1 reportés',               sourcePath: 'funnel.totals.rv1Postponed',        order: 12,   enabled: true },
  { key: 'RV1_CANCELED',         label: 'RV1 annulés',                sourcePath: 'funnel.totals.rv1Canceled',         order: 12.5, enabled: true },
  { key: 'RV1_NOT_QUALIFIED',    label: 'RV1 non qualifiés',          sourcePath: 'funnel.totals.rv1NotQualified',     order: 12.7, enabled: false },

  { key: 'RV2_PLANNED',          label: 'RV2 planifiés',              sourcePath: 'funnel.totals.rv2Planned',          order: 13,   enabled: false },
  { key: 'RV2_HONORED',          label: 'RV2 honorés',                sourcePath: 'funnel.totals.rv2Honored',          order: 14,   enabled: false },
  { key: 'RV2_NO_SHOW',          label: 'RV2 no-show',                sourcePath: 'funnel.totals.rv2NoShow',           order: 20,   enabled: false },
  { key: 'RV2_POSTPONED',        label: 'RV2 reportés',               sourcePath: 'funnel.totals.rv2Postponed',        order: 15,   enabled: false },
  { key: 'RV2_CANCELED',         label: 'RV2 annulés',                sourcePath: 'funnel.totals.rv2Canceled',         order: 15.5, enabled: false },

  { key: 'APPOINTMENT_CANCELED', label: 'RDV annulés (tous)',         sourcePath: 'funnel.totals.appointmentCanceled', order: 16,   enabled: true },

  { key: 'RV0_NOT_QUALIFIED',    label: 'RV0 non qualifiés',          sourcePath: 'funnel.totals.rv0NotQualified',     order: 17,   enabled: false },
  { key: 'NOT_QUALIFIED',        label: 'Non qualifiés (global)',     sourcePath: 'funnel.totals.notQualified',        order: 17.5, enabled: true },
  { key: 'LOST',                 label: 'Perdus',                     sourcePath: 'funnel.totals.lost',                order: 18,   enabled: true },
  { key: 'CONTRACT_SIGNED',      label: 'Contrats signés',            sourcePath: 'funnel.totals.contractsSigned',     order: 18.5, enabled: true },
  { key: 'WON',                  label: 'Ventes (WON)',               sourcePath: 'funnel.totals.wonCount',            order: 19,   enabled: true },
];

// mapping LeadStage -> type d'événement à logger (legacy leadEvent)
const STAGE_TO_EVENT: Partial<Record<LeadStage, string>> = {
  LEADS_RECEIVED:   'LEAD_CREATED',
  CALL_REQUESTED:   'CALL_REQUESTED',
  CALL_ATTEMPT:     'CALL_ATTEMPT',
  CALL_ANSWERED:    'CALL_ANSWERED',
  SETTER_NO_SHOW:   'SETTER_NO_SHOW',
  FOLLOW_UP:        'FOLLOW_UP',
  FOLLOW_UP_CLOSER: 'FOLLOW_UP_CLOSER',

  RV0_PLANNED:      'APPOINTMENT_PLANNED_RV0',
  RV0_HONORED:      'APPOINTMENT_HONORED_RV0',
  RV0_NO_SHOW:      'APPOINTMENT_NOSHOW_RV0',
  RV0_POSTPONED:    'APPOINTMENT_POSTPONED_RV0',
  RV0_CANCELED:     'APPOINTMENT_CANCELED_RV0',

  RV1_PLANNED:      'APPOINTMENT_PLANNED_RV1',
  RV1_HONORED:      'APPOINTMENT_HONORED_RV1',
  RV1_NO_SHOW:      'APPOINTMENT_NOSHOW_RV1',
  RV1_POSTPONED:    'APPOINTMENT_POSTPONED_RV1',
  RV1_CANCELED:     'APPOINTMENT_CANCELED_RV1',

  RV2_PLANNED:      'APPOINTMENT_PLANNED_RV2',
  RV2_HONORED:      'APPOINTMENT_HONORED_RV2',
  RV2_NO_SHOW:      'APPOINTMENT_NOSHOW_RV2',
  RV2_POSTPONED:    'APPOINTMENT_POSTPONED_RV2',
  RV2_CANCELED:     'APPOINTMENT_CANCELED_RV2',

  RV0_NOT_QUALIFIED:'RV0_NOT_QUALIFIED',
  RV1_NOT_QUALIFIED:'RV1_NOT_QUALIFIED',
  NOT_QUALIFIED:    'NOT_QUALIFIED',
  LOST:             'LOST',
  CONTRACT_SIGNED:  'CONTRACT_SIGNED',
  WON:              'WON',
};

// Événements cumulés via leadEvent (legacy) pour moveStage
const EVENT_BASED_STAGES: LeadStage[] = [
  'CALL_REQUESTED',
  'CALL_ATTEMPT',
  'CALL_ANSWERED',
  'SETTER_NO_SHOW',
  'FOLLOW_UP',
  'FOLLOW_UP_CLOSER',
  'NOT_QUALIFIED',
  'RV0_NOT_QUALIFIED',
  'RV1_NOT_QUALIFIED',
  'LOST',
  'RV0_CANCELED',
  'RV1_CANCELED',
  'RV2_CANCELED',
  'CONTRACT_SIGNED',
];


type OpsColumn = { key: PipelineMetricKey; label: string; count: number };

/* =========================================================
   ====================  EXISTANT  =========================
   ========================================================= */

type BoardArgs = {
  from?: string;
  to?: string;
  limit?: number;
  setterIds?: string[];
  closerIds?: string[];
};

type MoveStageBody = { stage: LeadStage; saleValue?: number; confirmSame?: boolean };

type EditLeadBody = {
  firstName?: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  tag?: string | null;
  source?: string | null;
  opportunityValue?: number | null;
  saleValue?: number | null;
  setterId?: string | null;
  closerId?: string | null;
};

type CreateLeadBody = {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  tag?: string | null;
  source?: string | null;
  opportunityValue?: number | null;
  saleValue?: number | null;
  stage?: LeadStage;
  setterId?: string | null;
  closerId?: string | null;
};

/* -------------------- Helpers -------------------- */
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* -------------------- Helpers UTC -------------------- */
type RangeUTC = { from?: Date; to?: Date };

function toUTCDateOnly(s?: string) {
  if (!s) return undefined;
  if (s.includes('T')) {
    const d = new Date(s);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  }
  const [y, m, d] = s.split('-').map((x) => Number(x));
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}
const startOfDayUTC = (s?: string) => (s ? toUTCDateOnly(s) : undefined);
function endOfDayUTC(s?: string) {
  if (!s) return undefined;
  const d0 = toUTCDateOnly(s)!;
  const d1 = new Date(d0.getTime());
  d1.setUTCHours(23, 59, 59, 999);
  return d1;
}
function toRange(from?: string, to?: string): RangeUTC {
  return { from: startOfDayUTC(from), to: endOfDayUTC(to) };
}

/** Inclusif (gte/lte), en UTC */
function between(
  field: 'createdAt' | 'scheduledAt' | 'stageUpdatedAt' | 'occurredAt',
  r: RangeUTC,
) {
  if (!r.from && !r.to) return {};
  return { [field]: { gte: r.from ?? undefined, lte: r.to ?? undefined } } as any;
}

@Injectable()
export class ProspectsService {
  constructor(
    private prisma: PrismaService,
    private stageEvents: StageEventsService,
  ) {}

  /* =========================================================
     =============  NOUVEAU : lecture “ops”  =================
     ========================================================= */

  getMetricsCatalog() {
    return {
      ok: true,
      catalog: DEFAULT_METRICS.map(({ key, label, sourcePath, order, enabled }) => ({
        key, label, sourcePath, order, enabled,
      })),
    };
  }

  /**
   * Calcule un mini-funnel interne à partir de Lead + StageEvent,
   * pour alimenter les colonnes "ops".
   */
  private async computePipelineMetrics(
    from?: string,
    to?: string,
  ): Promise<Record<PipelineMetricKey, number>> {
    const r = toRange(from, to);
    const metrics: Record<PipelineMetricKey, number> = {} as any;

    // Init à 0
    for (const m of DEFAULT_METRICS) metrics[m.key] = 0;

    // 1) Leads reçus = leads créés
    metrics.LEADS_RECEIVED = await this.prisma.lead.count({
      where: between('createdAt', r),
    });

    // 2) Entrées dans les stages = StageEvent.toStage dans la période
    const stageRows = await this.prisma.stageEvent.groupBy({
      by: ['toStage'],
      where: between('occurredAt', r),
      _count: { _all: true },
    });

    for (const row of stageRows) {
      const key = row.toStage as PipelineMetricKey;
      if (metrics[key] != null) {
        metrics[key] = row._count._all;
      }
    }

    // ✅ APPOINTMENT_CANCELED = somme des 3 cancellations (historique)
    const rv0Canceled = stageRows.find(r => r.toStage === 'RV0_CANCELED')?._count._all ?? 0;
    const rv1Canceled = stageRows.find(r => r.toStage === 'RV1_CANCELED')?._count._all ?? 0;
    const rv2Canceled = stageRows.find(r => r.toStage === 'RV2_CANCELED')?._count._all ?? 0;
    metrics.APPOINTMENT_CANCELED = rv0Canceled + rv1Canceled + rv2Canceled;

    return metrics;

    // 3) RDV annulés (colonne libre optionnelle)
    /*const rdvAnnulesColumn = await this.prisma.prospectsColumnConfig.findFirst({
      where: { label: 'RDV annulés' },
      select: { id: true },
    });
    if (rdvAnnulesColumn) {
      metrics.APPOINTMENT_CANCELED = await this.prisma.lead.count({
        where: { boardColumnKey: rdvAnnulesColumn.id, ...between('stageUpdatedAt', r) },
      });
    } else {
      metrics.APPOINTMENT_CANCELED = 0;
    }

    return metrics;*/
  }

  async getOpsColumns(
    from?: string,
    to?: string,
  ): Promise<{ ok: true; columns: OpsColumn[]; period: { from?: string; to?: string } }> {
    let configs = await this.prisma.metricConfig.findMany({ orderBy: { order: 'asc' } });
    if (!configs.length) {
      await this.prisma.$transaction(
        DEFAULT_METRICS.map((m) =>
          this.prisma.metricConfig.create({
            data: { key: m.key, label: m.label, sourcePath: m.sourcePath, order: m.order, enabled: m.enabled },
          }),
        ),
      );
      configs = await this.prisma.metricConfig.findMany({ orderBy: { order: 'asc' } });
    }

    const metrics = await this.computePipelineMetrics(from, to);

    const columns: OpsColumn[] = configs
      .filter((c) => c.enabled)
      .sort((a, b) => a.order - b.order)
      .map((c) => ({
        key: c.key as PipelineMetricKey,
        label: c.label,
        count: metrics[c.key as PipelineMetricKey] ?? 0,
      }));

    return { ok: true, columns, period: { from, to } };
  }

  /* ---------- Déplacement dans une “colonne libre” ---------- */
  async moveToFreeColumn(leadId: string, columnKey: string) {
    if (!columnKey) throw new BadRequestException('columnKey requis');

    const [lead, column] = await Promise.all([
      this.prisma.lead.findUnique({ where: { id: leadId } }),
      this.prisma.prospectsColumnConfig.findUnique({ where: { id: columnKey } }).catch(() => null),
    ]);
    if (!lead) throw new NotFoundException('Lead introuvable');

    const prevBoardKey = (lead as any).boardColumnKey ?? null;

    // journal visuel (si table dispo)
    try {
      await (this.prisma as any).leadBoardEvent?.create?.({
        data: { leadId, columnKey, previousKey: prevBoardKey, movedAt: new Date() },
      });
    } catch {}

    // MAJ position visuelle
    try {
      await this.prisma.lead.update({
        where: { id: leadId },
        data: { boardColumnKey: columnKey as any },
      });
    } catch {}

    // Si colonne mappée à un stage → log legacy + StageEvent + refléter stage
    if (column?.stage) {
      const toStage = column.stage as LeadStage;

      // legacy (optionnel)
      try {
        await (this.prisma as any).leadEvent?.create?.({
          data: {
            leadId,
            type: STAGE_TO_EVENT[toStage],
            meta: { source: 'board-drop', columnKey, stage: toStage },
            occurredAt: new Date(),
          },
        });
      } catch {}

      const updated = await this.prisma.lead.update({
        where: { id: leadId },
        data: { stage: toStage, stageUpdatedAt: new Date() },
      });

      // StageEvent normalisé (source de vérité funnel)
      await this.stageEvents.recordStageEntry({
        leadId,
        fromStage: (lead as any).stage ?? null,
        toStage,
        source: 'board-drop',
        occurredAt: updated.stageUpdatedAt,
      });
    }

    return { ok: true };
  }

  /* =========================================================
     =======  ProspectsColumnConfig (CRUD)  ========
     ========================================================= */

  private DEFAULT_BOARD_COLUMNS: Array<{ label: string; stage?: LeadStage | null; order: number; enabled: boolean }> = [
  { label: 'Leads reçus',        stage: 'LEADS_RECEIVED',   order: 0,    enabled: true },
  { label: 'Demandes d’appel',   stage: 'CALL_REQUESTED',   order: 1,    enabled: true },
  { label: 'Appels passés',      stage: 'CALL_ATTEMPT',     order: 2,    enabled: true },
  { label: 'Appels répondus',    stage: 'CALL_ANSWERED',    order: 3,    enabled: true },
  { label: 'No-show Setter',     stage: 'SETTER_NO_SHOW',   order: 4,    enabled: false },
  { label: 'Follow Up Setter',   stage: 'FOLLOW_UP',        order: 5,    enabled: true },
  { label: 'Follow Up Closer',   stage: 'FOLLOW_UP_CLOSER', order: 5.5,  enabled: true },

  { label: 'RV0 planifiés',      stage: 'RV0_PLANNED',      order: 10,   enabled: true },
  { label: 'RV0 honorés',        stage: 'RV0_HONORED',      order: 11,   enabled: false },
  { label: 'RV0 no-show',        stage: 'RV0_NO_SHOW',      order: 12,   enabled: false },
  { label: 'RV0 reportés',       stage: 'RV0_POSTPONED',    order: 12.2, enabled: false },
  { label: 'RV0 annulés',        stage: 'RV0_CANCELED',     order: 12.5, enabled: false },

  { label: 'RV1 planifiés',      stage: 'RV1_PLANNED',      order: 20,   enabled: true },
  { label: 'RV1 honorés',        stage: 'RV1_HONORED',      order: 21,   enabled: true },
  { label: 'RV1 no-show',        stage: 'RV1_NO_SHOW',      order: 22,   enabled: false },
  { label: 'RV1 reportés',       stage: 'RV1_POSTPONED',    order: 23,   enabled: false },
  { label: 'RV1 annulés',        stage: 'RV1_CANCELED',     order: 23.5, enabled: true },
  { label: 'RV1 non qualifiés',  stage: 'RV1_NOT_QUALIFIED',order: 23.7, enabled: false },

  { label: 'RV2 planifiés',      stage: 'RV2_PLANNED',      order: 30,   enabled: false },
  { label: 'RV2 honorés',        stage: 'RV2_HONORED',      order: 31,   enabled: false },
  { label: 'RV2 no-show',        stage: 'RV2_NO_SHOW',      order: 29,   enabled: false },
  { label: 'RV2 reportés',       stage: 'RV2_POSTPONED',    order: 32,   enabled: false },
  { label: 'RV2 annulés',        stage: 'RV2_CANCELED',     order: 32.5, enabled: false },

  { label: 'RV0 non qualifiés',  stage: 'RV0_NOT_QUALIFIED',order: 80,   enabled: false },
  { label: 'Non qualifiés',      stage: 'NOT_QUALIFIED',    order: 90,   enabled: true },
  { label: 'Perdus',             stage: 'LOST',             order: 91,   enabled: true },
  { label: 'Contrats signés',    stage: 'CONTRACT_SIGNED',  order: 95,   enabled: true },
  { label: 'Ventes (WON)',       stage: 'WON',              order: 99,   enabled: true },
];

  /** GET /prospects/columns-config */
  async getColumnsConfig() {
    let rows = await this.prisma.prospectsColumnConfig.findMany({ orderBy: { order: 'asc' } });

    if (!rows.length) {
      await this.prisma.$transaction(
        this.DEFAULT_BOARD_COLUMNS.map((c) =>
          this.prisma.prospectsColumnConfig.create({
            data: { label: c.label, stage: c.stage ?? null, order: c.order, enabled: c.enabled },
          }),
        ),
      );
      rows = await this.prisma.prospectsColumnConfig.findMany({ orderBy: { order: 'asc' } });
    }

    return { ok: true, columns: rows };
  }

  /** PUT /prospects/columns-config */
async putColumnsConfig(payload: Array<{
  id?: string;
  label?: string;
  order?: number;
  enabled?: boolean;
  stage?: LeadStage | null;
}>) {
  if (!Array.isArray(payload)) throw new BadRequestException('Payload invalide');

  // Normalisation + on neutralise les ids vides/temporaires
  const normalized = payload.map((c, idx) => {
    const safeId =
      typeof c.id === 'string' && c.id.trim().length > 0 ? c.id.trim() : undefined;

    return {
      id: safeId,
      label: c.label,
      order: typeof c.order === 'number' ? c.order : idx,
      enabled: typeof c.enabled === 'boolean' ? c.enabled : true,
      stage: c.stage ?? null as LeadStage | null,
    };
  });

  await this.prisma.$transaction(
    normalized.map((c) => {
      // Si on a un id : on fait un UPSERT (évite P2025 si l'id n'existe pas)
      if (c.id) {
        return this.prisma.prospectsColumnConfig.upsert({
          where: { id: c.id },
          update: {
            label: c.label ?? undefined,
            order: c.order,
            enabled: c.enabled,
            stage: c.stage as any, // peut être null
          },
          create: {
            id: c.id, // on respecte l'id fourni si tu veux le conserver
            label: c.label || 'Sans nom',
            order: c.order,
            enabled: c.enabled,
            stage: c.stage as any,
          },
        });
      }

      // Pas d'id ⇒ création classique
      return this.prisma.prospectsColumnConfig.create({
        data: {
          label: c.label || 'Sans nom',
          order: c.order,
          enabled: c.enabled,
          stage: c.stage as any,
        },
      });
    }),
  );

  const rows = await this.prisma.prospectsColumnConfig.findMany({ orderBy: { order: 'asc' } });
  return { ok: true, columns: rows };
}


  /* -------------------- Kanban (UTC aligné) -------------------- */

  private buildRangeOr(from?: string, to?: string) {
    const r = toRange(from, to);
    if (!r.from && !r.to) return {};
    return {
      OR: [
        { createdAt: { gte: r.from ?? undefined, lte: r.to ?? undefined } },
        { stageUpdatedAt: { gte: r.from ?? undefined, lte: r.to ?? undefined } },
      ],
    };
  }

  async getBoard({ from, to, limit = 200, setterIds, closerIds }: BoardArgs) {
    const base = this.buildRangeOr(from, to);
    const where = {
      ...base,
      ...(setterIds?.length ? { setterId: { in: setterIds } } : {}),
      ...(closerIds?.length ? { closerId: { in: closerIds } } : {}),
    };

    const leads = await this.prisma.lead.findMany({
      where,
      orderBy: { stageUpdatedAt: 'desc' },
      include: {
        setter: { select: { id: true, firstName: true, email: true } },
        closer: { select: { id: true, firstName: true, email: true } },
      },
      take: 2000,
    });

    const emptyCol = () => ({
      count: 0,
      sumOpportunity: 0,
      sumSales: 0,
      items: [] as typeof leads,
    });

    const allStages: LeadStage[] = [
      'LEADS_RECEIVED',
      'CALL_REQUESTED',
      'CALL_ATTEMPT',
      'CALL_ANSWERED',
      'SETTER_NO_SHOW',
      'FOLLOW_UP',
      'FOLLOW_UP_CLOSER',

      'RV0_PLANNED',
      'RV0_HONORED',
      'RV0_NO_SHOW',
      'RV0_POSTPONED',
      'RV0_CANCELED',

      'RV1_PLANNED',
      'RV1_HONORED',
      'RV1_NO_SHOW',
      'RV1_POSTPONED',
      'RV1_CANCELED',

      'RV2_PLANNED',
      'RV2_HONORED',
      'RV2_NO_SHOW',
      'RV2_POSTPONED',
      'RV2_CANCELED',

      'RV0_NOT_QUALIFIED',
      'RV1_NOT_QUALIFIED',
      'NOT_QUALIFIED',
      'LOST',
      'CONTRACT_SIGNED',
      'WON',
    ];


    const columns: Record<LeadStage, ReturnType<typeof emptyCol>> = {} as any;
    for (const s of allStages) columns[s] = emptyCol();

    // 1) colonnes "stage" (hors colonne libre)
    for (const l of leads) {
      const hasFreeColumn = (l as any).boardColumnKey != null;
      if (hasFreeColumn) continue;
      const col = columns[l.stage as LeadStage] ?? columns['LEADS_RECEIVED'];
      if (col.items.length < limit) col.items.push(l);
      col.count += 1;
      col.sumOpportunity += l.opportunityValue ?? 0;
      col.sumSales += l.saleValue ?? 0;
    }

    // 2) groupage par colonne libre
    const extraByColumnKey: Record<string, typeof leads> = {};
    for (const l of leads) {
      const key = (l as any).boardColumnKey as string | null;
      if (!key) continue;
      if (!extraByColumnKey[key]) extraByColumnKey[key] = [];
      if (extraByColumnKey[key].length < limit) extraByColumnKey[key].push(l);
    }

    return { columns, extraByColumnKey };
  }

  /* -------------------- Déplacement de stage (WON inclus) -------------------- */

  private ensureNonNegative(label: string, v: number | null | undefined) {
    if (v == null) return;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      throw new BadRequestException(`${label} doit être un nombre >= 0`);
    }
  }

  async moveStage(id: string, body: MoveStageBody) {
    const target = body.stage;
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new BadRequestException('Lead introuvable');

    const prev = lead.stage;

    // Cas WON: sécuriser saleValue
    if (target === 'WON') {
      let saleValueToSet: number | null = null;

      if (typeof body.saleValue === 'number') {
        this.ensureNonNegative('saleValue', body.saleValue);
        saleValueToSet = Math.round(body.saleValue);
      } else if (body.confirmSame && lead.opportunityValue != null) {
        this.ensureNonNegative('opportunityValue', lead.opportunityValue);
        saleValueToSet = Math.round(lead.opportunityValue);
      } else if (lead.saleValue != null) {
        this.ensureNonNegative('saleValue', lead.saleValue);
        saleValueToSet = lead.saleValue;
      } else {
        throw new BadRequestException({
          code: 'SALE_VALUE_REQUIRED',
          message: 'Merci de renseigner la valeur réelle de la vente (>= 0) ou de confirmer la valeur d’opportunité.',
        });
      }

      const updated = await this.prisma.lead.update({
        where: { id },
        data: { stage: 'WON', saleValue: saleValueToSet, stageUpdatedAt: new Date() },
        include: {
          setter: { select: { id: true, firstName: true, email: true } },
          closer: { select: { id: true, firstName: true, email: true } },
        },
      });

      // legacy event optionnel
      try {
        await (this.prisma as any).leadEvent?.create?.({
          data: { leadId: id, type: 'WON', occurredAt: new Date(), meta: { source: 'moveStage' } },
        });
      } catch {}

      // StageEvent systematique
      await this.stageEvents.recordStageEntry({
        leadId: id,
        fromStage: prev,
        toStage: 'WON',
        source: 'moveStage',
        occurredAt: updated.stageUpdatedAt,
      });

      return { ok: true, lead: updated };
    }

    // MAJ stage générique
    const updated = await this.prisma.lead.update({
      where: { id },
      data: { stage: target, stageUpdatedAt: new Date() },
      include: {
        setter: { select: { id: true, firstName: true, email: true } },
        closer: { select: { id: true, firstName: true, email: true } },
      },
    });

    // StageEvent systématique
    await this.stageEvents.recordStageEntry({
      leadId: id,
      fromStage: prev,
      toStage: target,
      source: 'moveStage',
      occurredAt: updated.stageUpdatedAt,
    });

    // legacy (optionnel)
    if (EVENT_BASED_STAGES.includes(target)) {
      try {
        await (this.prisma as any).leadEvent?.create?.({
          data: { leadId: id, type: target, occurredAt: new Date(), meta: { source: 'moveStage' } },
        });
      } catch {}
    }

    return { ok: true, lead: updated };
  }

  /* -------------------- Lecture fiche -------------------- */

  async getOne(id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        setter: { select: { id: true, firstName: true, email: true } },
        closer: { select: { id: true, firstName: true, email: true } },
      },
    });
    if (!lead) throw new BadRequestException('Lead introuvable');
    return lead;
  }

  /* -------------------- Mise à jour fiche -------------------- */

  async updateOne(id: string, body: EditLeadBody) {
    if ('opportunityValue' in body) this.ensureNonNegative('opportunityValue', body.opportunityValue ?? null);
    if ('saleValue' in body) this.ensureNonNegative('saleValue', body.saleValue ?? null);

    const current = await this.prisma.lead.findUnique({
      where: { id },
      select: { stage: true },
    });
    if (!current) throw new BadRequestException('Lead introuvable');

    const data: any = {
      firstName: body.firstName ?? undefined,
      lastName: body.lastName ?? undefined,
      email: body.email ?? undefined,
      phone: body.phone ?? undefined,
      tag: body.tag ?? undefined,
      source: body.source ?? undefined,
      opportunityValue:
        typeof body.opportunityValue === 'number' || body.opportunityValue === null
          ? body.opportunityValue
          : undefined,
      saleValue:
        typeof body.saleValue === 'number' || body.saleValue === null
          ? body.saleValue
          : undefined,
      setterId: body.setterId === null ? null : body.setterId ?? undefined,
      closerId: body.closerId === null ? null : body.closerId ?? undefined,
    };

    if (
      current.stage === 'WON' &&
      body.saleValue === undefined &&
      (typeof body.opportunityValue === 'number' || body.opportunityValue === null)
    ) {
      data.saleValue = body.opportunityValue ?? 0;
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data,
      include: {
        setter: { select: { id: true, firstName: true, email: true } },
        closer: { select: { id: true, firstName: true, email: true } },
      },
    });
    return { ok: true, lead: updated };
  }

  /* -------------------- Création manuelle -------------------- */

  async createLead(body: CreateLeadBody) {
    if ('opportunityValue' in body) this.ensureNonNegative('opportunityValue', body.opportunityValue ?? null);
    if ('saleValue' in body) this.ensureNonNegative('saleValue', body.saleValue ?? null);

    const stage: LeadStage = (body.stage as LeadStage) || 'LEADS_RECEIVED';

    let saleValueToSet =
      typeof body.saleValue === 'number' || body.saleValue === null
        ? body.saleValue
        : undefined;

    if (stage === 'WON' && saleValueToSet === undefined) {
      saleValueToSet = body.opportunityValue ?? 0;
    }

    const payload: any = {
      firstName: body.firstName || 'Unknown',
      lastName: body.lastName ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      tag: body.tag ?? null,
      source: body.source ?? 'MANUAL',
      opportunityValue: body.opportunityValue ?? null,
      saleValue: saleValueToSet,
      stage,
      setterId: body.setterId ?? undefined,
      closerId: body.closerId ?? undefined,
    };

    const lead = await this.prisma.lead.create({ data: payload });

    // legacy création (optionnel)
    try {
      await (this.prisma as any).leadEvent?.create?.({
        data: {
          leadId: lead.id,
          type: 'LEAD_CREATED',
          occurredAt: lead.createdAt,
          meta: { source: 'createLead' },
        },
      });
    } catch {}

    // StageEvent pour LEADS_RECEIVED (1er passage) — optionnel :
    await this.stageEvents.recordStageEntry({
      leadId: lead.id,
      fromStage: null,
      toStage: stage,
      source: 'createLead',
      occurredAt: lead.createdAt,
    });

    return { ok: true, lead };
  }

  /* -------------------- Acteurs -------------------- */

  async listActors() {
    const [setters, closers] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: Role.SETTER, isActive: true },
        select: { id: true, firstName: true, email: true },
        orderBy: { firstName: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { role: Role.CLOSER, isActive: true },
        select: { id: true, firstName: true, email: true },
        orderBy: { firstName: 'asc' },
      }),
    ]);
    return { setters, closers };
  }

  /* -------------------- Modèle CSV & Import CSV -------------------- */

  buildCsvTemplate() {
    const header = [
      'firstName',
      'lastName',
      'email',
      'phone',
      'tag',
      'source',
      'opportunityValue',
      'stage',
      'setterEmail',
      'closerEmail',
    ].join(',');

    const sample1 = [
      'Alice',
      'Durand',
      'alice@example.com',
      '+33600000001',
      'FB',
      'CSV',
      '5000',
      'LEADS_RECEIVED',
      '',
      '',
    ].join(',');

    const sample2 = [
      'Bob',
      'Martin',
      'bob@example.com',
      '+33600000002',
      'IG',
      'CSV',
      '3000',
      'RV1_PLANNED',
      'setter1@example.com',
      'closer1@example.com',
    ].join(',');

    return `\uFEFF${header}\n${sample1}\n${sample2}\n`;
  }

  async importCsv(buffer: Buffer) {
    const text = buffer.toString('utf8');
    const lines = text
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);
    if (lines.length === 0) throw new BadRequestException('CSV vide');

    const header = lines[0].split(',').map((h) => h.trim());
    const idx = (name: string) =>
      header.findIndex((h) => h.toLowerCase() === name.toLowerCase());

    const col = {
      firstName: idx('firstName'),
      lastName: idx('lastName'),
      email: idx('email'),
      phone: idx('phone'),
      tag: idx('tag'),
      source: idx('source'),
      opportunityValue: idx('opportunityValue'),
      stage: idx('stage'),
      setterEmail: idx('setterEmail'),
      closerEmail: idx('closerEmail'),
    };

    const results = { created: 0, updated: 0, errors: 0 };

    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i];
      if (!raw.trim()) continue;

      const parts = this.splitCsvLine(raw, header.length);
      try {
        const firstName = (parts[col.firstName] || '').trim() || 'Unknown';
        const lastName = (parts[col.lastName] || '').trim() || null;
        const email = (parts[col.email] || '').trim() || null;
        const phone = (parts[col.phone] || '').trim() || null;
        const tag = (parts[col.tag] || '').trim() || null;
        const source = (parts[col.source] || '').trim() || 'CSV';
        const opportunityValue = this.parseNum(parts[col.opportunityValue]);
        const stageInput = (
          (parts[col.stage] || '').trim().toUpperCase() || 'LEADS_RECEIVED'
        ) as any;
        const setterEmail = (parts[col.setterEmail] || '').trim();
        const closerEmail = (parts[col.closerEmail] || '').trim();

        const stage = this.safeStage(stageInput);

        const setter =
          setterEmail &&
          (await this.prisma.user.findFirst({
            where: { email: setterEmail, role: 'SETTER' },
          }));
        const closer =
          closerEmail &&
          (await this.prisma.user.findFirst({
            where: { email: closerEmail, role: 'CLOSER' },
          }));

        if (email) {
          const existing = await this.prisma.lead.findUnique({ where: { email } });
          if (existing) {
            await this.prisma.lead.update({
              where: { id: existing.id },
              data: {
                firstName,
                lastName,
                phone,
                tag,
                source,
                opportunityValue,
                saleValue: stage === 'WON' ? opportunityValue ?? 0 : undefined,
                stage,
                setterId: setter ? setter.id : undefined,
                closerId: closer ? closer.id : undefined,
                stageUpdatedAt: new Date(),
              },
            });
            // StageEvent sur update/import (optionnel mais recommandé)
            await this.stageEvents.recordStageEntry({
              leadId: existing.id,
              fromStage: existing.stage,
              toStage: stage,
              source: 'importCsv',
              occurredAt: new Date(),
            });

            results.updated++;
          } else {
            const created = await this.prisma.lead.create({
              data: {
                firstName,
                lastName,
                email,
                phone,
                tag,
                source,
                opportunityValue,
                saleValue: stage === 'WON' ? opportunityValue ?? 0 : undefined,
                stage,
                setterId: setter ? setter.id : undefined,
                closerId: closer ? closer.id : undefined,
              },
            });
            try {
              await (this.prisma as any).leadEvent?.create?.({
                data: {
                  leadId: created.id,
                  type: 'LEAD_CREATED',
                  occurredAt: created.createdAt,
                  meta: { source: 'importCsv' },
                },
              });
            } catch {}

            await this.stageEvents.recordStageEntry({
              leadId: created.id,
              fromStage: null,
              toStage: stage,
              source: 'importCsv',
              occurredAt: created.createdAt,
            });

            results.created++;
          }
        } else {
          const created = await this.prisma.lead.create({
            data: {
              firstName,
              lastName,
              phone,
              tag,
              source,
              opportunityValue,
              saleValue: stage === 'WON' ? opportunityValue ?? 0 : undefined,
              stage,
              setterId: setter ? setter.id : undefined,
              closerId: closer ? closer.id : undefined,
            },
          });
          try {
            await (this.prisma as any).leadEvent?.create?.({
              data: {
                leadId: created.id,
                type: 'LEAD_CREATED',
                occurredAt: created.createdAt,
                meta: { source: 'importCsv' },
              },
            });
          } catch {}

          await this.stageEvents.recordStageEntry({
            leadId: created.id,
            fromStage: null,
            toStage: stage,
            source: 'importCsv',
            occurredAt: created.createdAt,
          });

          results.created++;
        }
      } catch {
        results.errors++;
      }
    }

    return { ok: true, ...results };
  }

  private splitCsvLine(line: string, expectedCols: number) {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    while (out.length < expectedCols) out.push('');
    return out;
  }

  private parseNum(v: string | undefined) {
    if (!v) return null;
    const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(n) || n < 0)
      throw new BadRequestException('opportunityValue doit être >= 0');
    return n;
  }

  private safeStage(s: string | LeadStage): LeadStage {
  const allowed: LeadStage[] = [
    'LEADS_RECEIVED',
    'CALL_REQUESTED',
    'CALL_ATTEMPT',
    'CALL_ANSWERED',
    'SETTER_NO_SHOW',
    'FOLLOW_UP',
    'FOLLOW_UP_CLOSER',

    'RV0_PLANNED',
    'RV0_HONORED',
    'RV0_NO_SHOW',
    'RV0_POSTPONED',
    'RV0_CANCELED',

    'RV1_PLANNED',
    'RV1_HONORED',
    'RV1_NO_SHOW',
    'RV1_POSTPONED',
    'RV1_CANCELED',

    'RV2_PLANNED',
    'RV2_HONORED',
    'RV2_NO_SHOW',
    'RV2_POSTPONED',
    'RV2_CANCELED',

    'RV0_NOT_QUALIFIED',
    'RV1_NOT_QUALIFIED',
    'NOT_QUALIFIED',
    'LOST',
    'CONTRACT_SIGNED',
    'WON',
  ];
  const up = String(s).toUpperCase();
  return (allowed as string[]).includes(up) ? (up as LeadStage) : 'LEADS_RECEIVED';
}

  /* ===================== CONFIG (CRUD simple) ===================== */

  async getMetricsConfig() {
    let rows = await this.prisma.metricConfig.findMany({ orderBy: { order: 'asc' } });
    if (!rows.length) {
      await this.prisma.$transaction(
        DEFAULT_METRICS.map((m) =>
          this.prisma.metricConfig.create({
            data: {
              key: m.key,
              label: m.label,
              sourcePath: m.sourcePath,
              order: m.order,
              enabled: m.enabled,
            },
          }),
        ),
      );
      rows = await this.prisma.metricConfig.findMany({ orderBy: { order: 'asc' } });
    }
    return { ok: true, metrics: rows };
  }

  async putMetricsConfig(payload: Array<{
    key: PipelineMetricKey;
    label?: string;
    sourcePath?: string;
    order?: number;
    enabled?: boolean;
  }>) {
    if (!Array.isArray(payload)) throw new BadRequestException('Payload invalide');

    await this.prisma.$transaction(
      payload.map((m, idx) =>
        this.prisma.metricConfig.upsert({
          where: { key: m.key },
          update: {
            label: m.label ?? undefined,
            sourcePath: m.sourcePath ?? undefined,
            order: typeof m.order === 'number' ? m.order : idx,
            enabled: typeof m.enabled === 'boolean' ? m.enabled : undefined,
          },
          create: {
            key: m.key,
            label:
              m.label ??
              DEFAULT_METRICS.find((x) => x.key === m.key)?.label ??
              m.key,
            sourcePath:
              m.sourcePath ??
              DEFAULT_METRICS.find((x) => x.key === m.key)?.sourcePath ??
              'funnel.totals.leads',
            order: typeof m.order === 'number' ? m.order : idx,
            enabled: typeof m.enabled === 'boolean' ? m.enabled : true,
          },
        }),
      ),
    );

    return this.getMetricsConfig();
  }

  async resetMetricsConfig() {
    await this.prisma.metricConfig.deleteMany({});
    await this.prisma.$transaction(
      DEFAULT_METRICS.map((m) =>
        this.prisma.metricConfig.create({
          data: {
            key: m.key,
            label: m.label,
            sourcePath: m.sourcePath,
            order: m.order,
            enabled: m.enabled,
          },
        }),
      ),
    );
    return this.getMetricsConfig();
  }

  /* ===================== EVENTS (drag & drop) ===================== */

  /**
   * /prospects/:id/events
   * Body conforme à CreateProspectEventDto :
   * { type: "STAGE_ENTERED" | "STAGE_LEFT" | "NOTE", stage?: StageDto, ... }
   */
  async addEvent(leadId: string, dto: CreateProspectEventDto) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead introuvable');

    // NOTE : pour l’instant on ne traite que STAGE_ENTERED
    if (dto.type === 'NOTE') {
      return { ok: true };
    }
    if (dto.type !== 'STAGE_ENTERED') {
      return { ok: true };
    }

    // On normalise le stage (au cas où ça vienne en FR, avec accents, etc.)
    const normalized = dto.stage ? normalizeStage(dto.stage) : normalizeStage(dto.status);
    if (!normalized) throw new BadRequestException('Stage manquant ou invalide');

    // Map StageDto (FR) -> LeadStage (enum Prisma)
    const stageMap: Partial<Record<StageDto, LeadStage>> = {
      [StageDto.LEAD_RECU]:     'LEADS_RECEIVED',
      [StageDto.DEMANDE_APPEL]: 'CALL_REQUESTED',
      [StageDto.APPEL_PASSE]:   'CALL_ATTEMPT',
      [StageDto.APPEL_REPONDU]: 'CALL_ANSWERED',
      [StageDto.NO_SHOW_SETTER]:'SETTER_NO_SHOW',

      [StageDto.RV0_PLANIFIE]:  'RV0_PLANNED',
      [StageDto.RV0_HONORE]:    'RV0_HONORED',
      [StageDto.RV0_NO_SHOW]:   'RV0_NO_SHOW',

      [StageDto.RV1_PLANIFIE]:  'RV1_PLANNED',
      [StageDto.RV1_HONORE]:    'RV1_HONORED',
      [StageDto.RV1_NO_SHOW]:   'RV1_NO_SHOW',

      [StageDto.RV2_PLANIFIE]:  'RV2_PLANNED',
      [StageDto.RV2_HONORE]:    'RV2_HONORED',
      [StageDto.RV2_NO_SHOW]:   'RV2_NO_SHOW',

      [StageDto.RV0_ANNULE]:    'RV0_CANCELED',
      [StageDto.RV1_ANNULE]:    'RV1_CANCELED',
      [StageDto.RV2_ANNULE]:    'RV2_CANCELED',

      [StageDto.WON]:           'WON',
      [StageDto.LOST]:          'LOST',
      [StageDto.NOT_QUALIFIED]: 'NOT_QUALIFIED',
    };

    const toStage = stageMap[normalized];
    if (!toStage) throw new BadRequestException('Stage inconnu');

    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

    // StageEvent via service (idempotent par dedupHash)
    try {
      await this.stageEvents.recordStageEntry({
        leadId,
        fromStage: lead.stage,
        toStage,
        source: 'prospects-board',
        externalId: null,
        occurredAt,
      });
    } catch {}

    // Refléter le stage sur la fiche
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { stage: toStage, stageUpdatedAt: occurredAt },
    });

    return { ok: true };
  }

  // Colonne libre (clé persistée sur le lead)
  async updateBoardColumn(id: string, columnKey: string | null) {
    return this.prisma.lead.update({
      where: { id },
      data: { boardColumnKey: columnKey },
    });
  }
}
