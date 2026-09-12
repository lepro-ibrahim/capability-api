// src/integrations/ghl/ghl.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as qs from 'querystring';
import { LeadStage } from '@prisma/client';
import { StageEventsService } from '../../modules/leads/stage-events.service';

type InboxItem = {
  id: string;
  receivedAt: string;
  contentType: string;
  headers: any;
  query: any;
  raw: string;
  parsed: any;
  hash: string;
};

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
const DATA_DIR = path.resolve(process.cwd(), '.data', 'webhooks');

function safeJsonParse(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

function smartParse(raw: string, contentType: string): any {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('application/json')) {
    const j = safeJsonParse(raw);
    if (j) return j;
  }
  if (ct.includes('application/x-www-form-urlencoded') || raw.includes('=')) {
    const obj = qs.parse(raw);
    const flattened: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      const key = k.replace(/\]/g, '').replace(/\[/g, '.');
      flattened[key] = Array.isArray(v) ? v[0] : v;
    }
    return flattened;
  }
  return safeJsonParse(raw) ?? { text: raw };
}

function getByPath(obj: any, p?: string): any {
  if (!obj || !p) return undefined;
  return p.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), obj);
}

/* ------------------------------------------------------------------
   Normalisation & mapping STAGES (FR/EN/typos) → clé canonique
-------------------------------------------------------------------*/
function normalizeKey(input?: string): string {
  if (!input) return '';
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Variantes → clé canonique
const STAGE_ALIASES: Record<string, LeadStage | string> = {
  LEAD_RECU: 'LEADS_RECEIVED',
  LEAD_REÇU: 'LEADS_RECEIVED',
  LEADS_RECEIVED: 'LEADS_RECEIVED',

  DEMANDE_APPEL: 'CALL_REQUESTED',
  CALL_REQUESTED: 'CALL_REQUESTED',
  APPEL_PASSE: 'CALL_ATTEMPT',
  CALL_ATTEMPT: 'CALL_ATTEMPT',
  APPEL_REPONDU: 'CALL_ANSWERED',
  CALL_ANSWERED: 'CALL_ANSWERED',
  NO_SHOW_SETTER: 'SETTER_NO_SHOW',
  SETTER_NO_SHOW: 'SETTER_NO_SHOW',

  RV0_PLANIFIE: 'RV0_PLANNED',
  RV0_PLANIFIÉ: 'RV0_PLANNED',
  RV0_PLANNED: 'RV0_PLANNED',
  RV0_HONORE: 'RV0_HONORED',
  RV0_HONORÉ: 'RV0_HONORED',
  RV0_HONORED: 'RV0_HONORED',
  RV0_NO_SHOW: 'RV0_NO_SHOW',
  RV0_CANCELED: 'RV0_CANCELED',
  RV0_CANCELLED: 'RV0_CANCELLED',

  RV1_PLANIFIE: 'RV1_PLANNED',
  RV1_PLANIFIÉ: 'RV1_PLANNED',
  RV1_PLANNED: 'RV1_PLANNED',
  RV1_HONORE: 'RV1_HONORED',
  RV1_HONORÉ: 'RV1_HONORED',
  RV1_HONORED: 'RV1_HONORED',
  RV1_NO_SHOW: 'RV1_NO_SHOW',
  RV1_CANCELED: 'RV1_CANCELED',
  RV1_CANCELLED: 'RV1_CANCELLED',

  RV2_PLANIFIE: 'RV2_PLANNED',
  RV2_PLANIFIÉ: 'RV2_PLANNED',
  RV2_PLANNED: 'RV2_PLANNED',
  RV2_HONORE: 'RV2_HONORED',
  RV2_HONORÉ: 'RV2_HONORED',
  RV2_HONORED: 'RV2_HONORED',
  RV2_POSTPONED: 'RV2_POSTPONED',
  RV2_CANCELED: 'RV2_CANCELED',
  RV2_CANCELLED: 'RV0_CANCELLED',


  NON_QUALIFIE: 'NOT_QUALIFIED',
  NON_QUALIFIÉ: 'NOT_QUALIFIED',
  NOT_QUALIFIED: 'NOT_QUALIFIED',
  PERDU: 'LOST',
  LOST: 'LOST',
  WON: 'WON',
};

function resolveStageKey(input?: string | LeadStage): LeadStage | string | undefined {
  if (!input) return undefined;
  if (Object.values(LeadStage).includes(input as LeadStage)) return input as LeadStage;
  const norm = normalizeKey(String(input));
  const mapped = STAGE_ALIASES[norm] || norm;
  if (Object.values(LeadStage).includes(mapped as LeadStage)) return mapped as LeadStage;
  return mapped; // slug non-enum éventuellement
}

// Compat avec ton ancienne fonction pour ne pas casser le reste
function mapStageNameToLeadStage(name?: string): LeadStage | undefined {
  const key = resolveStageKey(name);
  return Object.values(LeadStage).includes(key as LeadStage) ? (key as LeadStage) : undefined;
}

function mapAppointmentToStage(type?: string | null, status?: string | null): LeadStage | null {
  const t = normalizeKey(type || '');
  const s = normalizeKey(status || '');

  // planned
  if (s === 'SCHEDULED' || s === 'PLANNED' || s === 'BOOKED' || s === '') {
    if (t === 'RV2') return 'RV2_PLANNED';
    if (t === 'RV1') return 'RV1_PLANNED';
    if (t === 'RV0') return 'RV0_PLANNED';
  }
  // honored / show
  if (s === 'SHOW' || s === 'HONORED' || s === 'COMPLETED' || s === 'DONE') {
    if (t === 'RV2') return 'RV2_HONORED';
    if (t === 'RV1') return 'RV1_HONORED';
    if (t === 'RV0') return 'RV0_HONORED';
  }
  // no-show
  if (s === 'NO_SHOW' || s === 'NOSHOW') {
    if (t === 'RV1') return 'RV1_NO_SHOW';
    if (t === 'RV0') return 'RV0_NO_SHOW';
    // si tu crées RV2_NO_SHOW plus tard, mape-le ici
  }
  // reporté
  if (s === 'RESCHEDULED' || s === 'POSTPONED') {
    if (t === 'RV2') return 'RV2_POSTPONED';
    if (t === 'RV1') return 'RV1_PLANNED'; // on redevient “planifié”
    if (t === 'RV0') return 'RV0_PLANNED';
  }
  // canceled → pas de stage
  if (s === 'CANCELED' || s === 'CANCELLED') {
    if (t === 'RV0') return 'RV0_CANCELED';
    if (t === 'RV1') return 'RV1_CANCELED';
    if (t === 'RV2') return 'RV2_CANCELED';
  }

  // fallback: si seul le type est connu
  if (t === 'RV2') return 'RV2_PLANNED';
  if (t === 'RV1') return 'RV1_PLANNED';
  if (t === 'RV0') return 'RV0_PLANNED';
  return null;
}

@Injectable()
export class GhlService {
  constructor(
    private prisma: PrismaService,
    private readonly stageEvents: StageEventsService,
  ) {}

  /**
   * Déduplication idempotente.
   * Retourne true si fresh, false si duplicate.
   * Requiert une contrainte unique sur webhookEvent.externalId (recommandé).
   */
  async deduplicate(eventId?: string): Promise<boolean> {
    if (!eventId) return true;
    try {
      await this.prisma.webhookEvent.create({
        data: {
          externalId: eventId,
          status: 'RECEIVED',
          type: 'ghl',
          payloadHash: eventId,
          receivedAt: new Date(),
        } as any,
      });
      return true; // fresh
    } catch {
      // existe déjà → duplicate
      await this.prisma.webhookEvent.updateMany({
        where: { externalId: eventId },
        data: { status: 'RECEIVED', receivedAt: new Date() },
      });
      return false;
    }
  }

  /* ==================== CONTACT ==================== */
  async upsertContact(args: {
    firstName?: string;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    tag?: string | null;
    sourceTag?: string | null;
    ghlContactId?: string | null;
  }) {
    return this.upsertLead({
      ghlContactId: args.ghlContactId || undefined,
      firstName: args.firstName || 'Unknown',
      lastName: args.lastName ?? null,
      email: args.email ?? null,
      phone: args.phone ?? null,
      source: 'GHL',
      tag: args.tag ?? args.sourceTag ?? null,
    });
  }

  /* ==================== OPPORTUNITY ==================== */
  async upsertOpportunity(args: {
    contactEmail?: string | null;
    ghlContactId?: string | null;
    amount?: number | null;
    stage?: string | null;
    saleValue?: number | null;
    eventId?: string | null; // pour idempotence StageEvents
  }) {
    const toFiniteNumber = (value: unknown): number | undefined => {
      if (value === null || value === undefined || value === '') return undefined;
      const n = Number(value);
      return Number.isFinite(n) ? n : undefined;
    };
    const saleValueFromPayload = toFiniteNumber(args.saleValue);
    const amountFromPayload = toFiniteNumber(args.amount);
    const resolvedSaleValue = saleValueFromPayload ?? amountFromPayload;
    const lead = await this.findLeadByEmailOrGhlId(
      (args.contactEmail || '').toLowerCase() || null,
      args.ghlContactId || null,
    );

    const mapped = resolveStageKey(args.stage || undefined);

    // Pas de lead → on crée minimal et applique le stage si fourni
    if (!lead) {
      const created = await this.prisma.lead.create({
        data: {
          firstName: 'Unknown',
          lastName: null,
          email: args.contactEmail?.toLowerCase() || null,
          source: 'GHL',
          ghlContactId: args.ghlContactId ?? null,
          ...(mapped && Object.values(LeadStage).includes(mapped as LeadStage)
            ? { stage: mapped as LeadStage, stageUpdatedAt: new Date() }
            : {}),
          ...(mapped === 'WON' && resolvedSaleValue != null ? { saleValue: resolvedSaleValue } : {}),
        },
      });

      if (mapped) {
        await this.safeRecordStageEntry({
          leadId: created.id,
          toStage: mapped as any,
          fromStage: 'LEADS_RECEIVED',
          source: 'webhook:ghl:opportunity',
          externalId: args.eventId ?? args.ghlContactId ?? args.contactEmail ?? undefined,
        });
      }
      return created;
    }

    // Lead existe → maj + event
    const update: any = {};
    if (mapped) {
      if (Object.values(LeadStage).includes(mapped as LeadStage)) {
        update.stage = mapped;
        update.stageUpdatedAt = new Date();
        if (
          mapped === 'WON' &&
          resolvedSaleValue != null &&
          lead.saleValue == null
        ) {
          update.saleValue = resolvedSaleValue;
        }
        await this.safeRecordStageEntry({
          leadId: lead.id,
          fromStage: (lead.stage as any) ?? 'LEADS_RECEIVED',
          toStage: mapped as any,
          source: 'webhook:ghl:opportunity',
          externalId: args.eventId ?? args.ghlContactId ?? args.contactEmail ?? undefined,
        });
      }
    }
    if (
      resolvedSaleValue != null &&
      lead.stage === 'WON' &&
      lead.saleValue == null
    ) {
      update.saleValue = resolvedSaleValue;
    }
    if (args.ghlContactId && !lead.ghlContactId) update.ghlContactId = args.ghlContactId;

    if (Object.keys(update).length === 0) return lead;
    return this.prisma.lead.update({ where: { id: lead.id }, data: update });
  }

  /* ==================== APPOINTMENT ==================== */
  async upsertAppointment(args: {
    id?: string | null;
    type?: string | null;     // RV0 | RV1 | RV2 | ...
    status?: string | null;   // SCHEDULED | HONORED | NO_SHOW | POSTPONED | CANCELED ...
    startTime?: string | null;
    contactEmail?: string | null;
    ghlContactId?: string | null;
    ownerEmail?: string | null;
    eventId?: string | null;
  }) {
    const lead = await this.findLeadByEmailOrGhlId(
      (args.contactEmail || '').toLowerCase() || null,
      args.ghlContactId || null,
    );
    const leadId = lead?.id ?? null;

    const user = args.ownerEmail
      ? await this.prisma.user.findFirst({ where: { email: args.ownerEmail.toLowerCase() } })
      : null;

    try {
      const scheduledAt = args.startTime ? new Date(args.startTime) : new Date();
      const typeNorm = normalizeKey(args.type || '');
      const statusNorm = normalizeKey(args.status || '');

      // 1) Upsert appointment
      const appt = args.id
        ? await (this.prisma as any).appointment.upsert({
            where: { id: args.id },
            update: {
              type: typeNorm,
              status: statusNorm,
              scheduledAt,
              ...(leadId ? { leadId } : {}),
              ...(user?.id ? { userId: user.id } : {}),
            },
            create: {
              id: args.id,
              type: typeNorm,
              status: statusNorm,
              scheduledAt,
              ...(leadId ? { leadId } : {}),
              ...(user?.id ? { userId: user.id } : {}),
            },
          })
        : await (this.prisma as any).appointment.create({
            data: {
              type: typeNorm,
              status: statusNorm,
              scheduledAt,
              ...(leadId ? { leadId } : {}),
              ...(user?.id ? { userId: user.id } : {}),
            },
          });

      // 2) Stage depuis RDV (idempotent via StageEventsService + unique lead/stage)
      if (leadId) {
        const toStage = mapAppointmentToStage(args.type, args.status);
        if (toStage) {
          await this.safeRecordStageEntry({
            leadId,
            fromStage: (lead?.stage as any) ?? 'LEADS_RECEIVED',
            toStage,
            source: 'webhook:ghl:appointment',
            externalId: args.eventId ?? args.id ?? undefined,
          });

          await this.prisma.lead.update({
            where: { id: leadId },
            data: { stage: toStage as LeadStage, stageUpdatedAt: new Date(), boardColumnKey: null },
          });
        }
      }

      return appt;
    } catch {
      return { ok: true };
    }
  }

  /* ==================== Inbox fichiers + auto-process ==================== */

  async captureInbox(args: { raw: string; headers: any; query: any; contentType: string }): Promise<InboxItem> {
    ensureDir(DATA_DIR);
    const id = crypto.randomUUID();
    const hash = crypto.createHash('sha256').update(args.raw || '').digest('hex');
    const parsed = smartParse(args.raw || '', args.contentType || '');

    const item: InboxItem = {
      id,
      receivedAt: new Date().toISOString(),
      contentType: args.contentType || '',
      headers: args.headers || {},
      query: args.query || {},
      raw: args.raw || '',
      parsed,
      hash,
    };

    const file = path.join(DATA_DIR, `${id}.json`);
    fs.writeFileSync(file, JSON.stringify(item, null, 2), 'utf8');

    await this.prisma.webhookEvent.upsert({
      where: { externalId: hash },
      update: { status: 'RECEIVED', payloadHash: hash, type: 'ghl', receivedAt: new Date() },
      create: {
        externalId: hash,
        status: 'RECEIVED',
        payloadHash: hash,
        type: 'ghl',
        receivedAt: new Date(),
      },
    });

    return item;
  }

  async listInbox(limit = 50) {
    ensureDir(DATA_DIR);
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort().reverse();
    const out: Array<Pick<InboxItem, 'id'|'receivedAt'|'contentType'>> = [];
    for (const f of files.slice(0, limit)) {
      const j = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
      out.push({ id: j.id, receivedAt: j.receivedAt, contentType: j.contentType });
    }
    return { ok: true, items: out };
  }

  async getInboxItem(id: string): Promise<InboxItem> {
    const file = path.join(DATA_DIR, `${id}.json`);
    if (!fs.existsSync(file)) throw new Error('Inbox item not found');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  async tryAutoProcess(item: InboxItem) {
    const p = item.parsed || {};
    const firstName = p['contact.first_name'] ?? p['first_name'] ?? p['firstName'] ?? p['contact.name']?.split(' ')?.[0];
    const lastName  = p['contact.last_name']  ?? p['last_name']  ?? p['lastName']  ?? (p['contact.name']?.split(' ')?.slice(1).join(' ') || null);
    const email     = p['contact.email']      ?? p['email']      ?? null;
    const phone     = p['contact.phone']      ?? p['phone']      ?? null;

    const stageName = p['opportunity.stage_name'] ?? p['stage_name'] ?? p['stageName'] ?? undefined;
    const saleValue = Number(p['opportunity.monetary_value'] ?? p['monetary_value'] ?? p['saleValue'] ?? NaN);
    const ghlContactId = p['contact.id'] ?? p['contactId'] ?? p['id'] ?? undefined;

    if (!firstName && !email && !phone) return;

    await this.upsertLead({
      ghlContactId,
      firstName: firstName || 'Unknown',
      lastName: lastName || null,
      email: email || null,
      phone: phone || null,
      source: 'GHL',
      tag: null,
      stageName,
      saleValue: Number.isFinite(saleValue) ? saleValue : undefined,
      createdAtISO: undefined,
    });
  }

  async processWithMapping(inboxId: string, mapping: Record<string, string>, defaults: Record<string, any> = {}) {
    const item = await this.getInboxItem(inboxId);
    const p = item.parsed || {};
    const pick = (k?: string) => (k ? getByPath(p, k) : undefined);

    const payload = {
      ghlContactId: String(pick(mapping['ghlContactId']) ?? p['contact.id'] ?? p['contactId'] ?? ''),
      firstName: (pick(mapping['firstName']) ?? defaults.firstName ?? 'Unknown') as string,
      lastName: (pick(mapping['lastName']) ?? defaults.lastName ?? null) as string | null,
      email: (pick(mapping['email']) ?? defaults.email ?? null) as string | null,
      phone: (pick(mapping['phone']) ?? defaults.phone ?? null) as string | null,
      source: (pick(mapping['source']) ?? defaults.source ?? 'GHL') as string | null,
      tag: (pick(mapping['tag']) ?? defaults.tag ?? null) as string | null,
      stageName: (pick(mapping['stageName']) ?? defaults.stageName ?? undefined) as string | undefined,
      saleValue: Number(pick(mapping['saleValue']) ?? defaults.saleValue ?? NaN),
      createdAtISO: (pick(mapping['createdAt']) ?? undefined) as string | undefined,
    };

    if (!Number.isFinite(payload.saleValue)) delete (payload as any).saleValue;

    const lead = await this.upsertLead(payload as any);
    return { ok: true, lead };
  }

  /* ==================== Lead upsert interne ==================== */
  private async upsertLead(args: {
    ghlContactId?: string;
    firstName: string;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    source?: string | null;
    tag?: string | null;
    stageName?: string;
    saleValue?: number;
    createdAtISO?: string;
  }) {
    const whereOr: any[] = [];
    if (args.ghlContactId) whereOr.push({ ghlContactId: args.ghlContactId });
    if (args.email) whereOr.push({ email: (args.email || '').toLowerCase() });
    if (args.phone) whereOr.push({ phone: args.phone });

    let existing: any = null;
    if (whereOr.length) {
      existing = await this.prisma.lead.findFirst({ where: { OR: whereOr } as any });
    }

    const stage = mapStageNameToLeadStage(args.stageName);
    const baseData: any = {
      firstName: args.firstName || 'Unknown',
      lastName: args.lastName ?? null,
      email: args.email ? args.email.toLowerCase() : null,
      phone: args.phone ?? null,
      source: args.source ?? 'GHL',
      tag: args.tag ?? null,
      ghlContactId: args.ghlContactId ?? null,
    };

    let lead;
    if (!existing) {
      lead = await this.prisma.lead.create({
        data: {
          ...baseData,
          ...(args.createdAtISO ? { createdAt: new Date(args.createdAtISO) } : {}),
          ...(stage ? { stage, stageUpdatedAt: new Date() } : {}),
          ...(args.saleValue != null && stage === 'WON' ? { saleValue: args.saleValue } : {}),
        },
      });

      if (stage) {
        await this.safeRecordStageEntry({
          leadId: lead.id,
          fromStage: 'LEADS_RECEIVED',
          toStage: stage,
          source: 'webhook:ghl:lead-upsert',
          externalId: args.ghlContactId ?? args.email ?? undefined,
        });
      }
    } else {
      const update: any = { ...baseData };
      if (stage) { update.stage = stage; update.stageUpdatedAt = new Date(); }
      if (args.saleValue != null && stage === 'WON') update.saleValue = args.saleValue;

      lead = await this.prisma.lead.update({
        where: { id: existing.id },
        data: update,
      });

      if (stage) {
        await this.safeRecordStageEntry({
          leadId: lead.id,
          fromStage: (existing.stage as any) ?? 'LEADS_RECEIVED',
          toStage: stage,
          source: 'webhook:ghl:lead-upsert',
          externalId: args.ghlContactId ?? args.email ?? undefined,
        });
      }
    }
    return lead;
  }

  /* ==================== Utils ==================== */

  private async findLeadByEmailOrGhlId(email?: string | null, ghlId?: string | null) {
    if (email) {
      const byEmail = await this.prisma.lead.findUnique({ where: { email } });
      if (byEmail) return byEmail;
    }
    if (ghlId) {
      const byGhl = await this.prisma.lead.findFirst({ where: { ghlContactId: ghlId } as any });
      if (byGhl) return byGhl;
    }
    return null;
  }

  /** Enveloppe idempotente pour StageEventsService, pour éviter les doublons “externes”. */
  private async safeRecordStageEntry(args: {
    leadId: string;
    fromStage: LeadStage | string;
    toStage: LeadStage | string;
    source?: string;
    externalId?: string;
  }) {
    try {
      await this.stageEvents.recordStageEntry({
        leadId: args.leadId,
        fromStage: args.fromStage as any,
        toStage: args.toStage as any,
        source: args.source ?? 'webhook:ghl',
        externalId: args.externalId,
      });
    } catch {
      // Silencieux si déjà existant (unique par (leadId, stage) gérée en aval)
    }
  }
}
