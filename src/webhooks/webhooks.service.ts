import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttributionService } from '../attribution/attribution.service';
import * as crypto from 'crypto';

import {
  AppointmentStatus,
  AppointmentType,
  LeadStage,
  Role,
  type Lead,
  type User,
} from '@prisma/client';

@Injectable()
export class WebhooksService {
  constructor(
    private prisma: PrismaService,
    private attribution: AttributionService,
  ) {}

  /** ---------- HMAC ---------- */
  private verifySignature(rawBody: string, signature?: string) {
    const secret = process.env.GHL_WEBHOOK_SECRET || '';
    if (!secret) {
      if (process.env.NODE_ENV === 'production') throw new UnauthorizedException('Webhook is not configured');
      return;
    }
    if (!signature) throw new UnauthorizedException('Missing signature');
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (expected !== signature) throw new UnauthorizedException('Invalid signature');
  }

  private hashPayload(obj: any) {
    return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
  }

  private externalIdFrom(body: any): string {
    const id = body?.id || body?.eventId || body?.payload?.id;
    if (id) return String(id);
    const base = `${body?.type || body?.event || 'unknown'}:${body?.timestamp || Date.now()}:${body?.payload?.email || ''}`;
    return crypto.createHash('sha256').update(base).digest('hex');
  }
/** Utilitaire: lecture de valeur par "a.b.c" dans un objet. */
private getByPath(obj: any, path?: string): any {
  if (!obj || !path) return undefined;
  try {
    return path.split('.').reduce((acc: any, k: string) => (acc != null ? acc[k] : undefined), obj);
  } catch { return undefined; }
}

/** Normalisation email. */
private normEmail(v?: any) {
  const s = String(v || '').trim().toLowerCase();
  return s.includes('@') ? s : null;
}

/** Find user by email (insensitive). */
private async findUserByEmailInsensitive(email?: string | null) {
  const e = this.normEmail(email);
  if (!e) return null;
  return this.prisma.user.findFirst({
    where: { email: { equals: e, mode: 'insensitive' }, isActive: true },
    select: { id: true, role: true, firstName: true, lastName: true, email: true },
  });
}

/** Find user by name (approx: contains on firstName OR lastName). */
private async findUserByNameApprox(q?: string | null, role?: 'SETTER'|'CLOSER') {
  const s = String(q || '').trim();
  if (!s) return null;
  return this.prisma.user.findFirst({
    where: {
      isActive: true,
      ...(role ? { role } : {}),
      OR: [
        { firstName: { contains: s, mode: 'insensitive' } },
        { lastName:  { contains: s, mode: 'insensitive' } },
      ],
    },
    select: { id: true, role: true, firstName: true, lastName: true, email: true },
  });
}

/** Round-robin simple pour SETTER actif. */
private async pickNextActiveSetter() {
  const setters = await this.prisma.user.findMany({
    where: { isActive: true, role: 'SETTER' },
    orderBy: { firstName: 'asc' },
    select: { id: true },
  });
  if (!setters.length) return null;

  const st = await this.prisma.setting.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
    select: { lastSetterId: true },
  });

  const idx = Math.max(0, setters.findIndex(u => u.id === st.lastSetterId));
  const next = setters[(idx + 1) % setters.length];

  if (next?.id !== st.lastSetterId) {
    await this.prisma.setting.update({
      where: { id: 1 },
      data: { lastSetterId: next.id },
    });
  }
  return next;
}

/** Évalue mappingJson.assign sur un payload (retourne setterId/closerId). */
private async resolveAssignmentFromMapping(payload: any, mapping?: any): Promise<{ setterId?: string; closerId?: string }> {
  const out: { setterId?: string; closerId?: string } = {};
  const assign = mapping?.assign || {};

  const rules: Array<{
    role: 'SETTER'|'CLOSER';
    by: 'email'|'name'|'static';
    from?: string;
    match?: { equals?: string; contains?: string; regex?: string };
    userId?: string;
  }> = Array.isArray(assign?.rules) ? assign.rules : [];

  // Helper pour poser le rôle dans out
  const put = (role: 'SETTER'|'CLOSER', id?: string | null) => {
    if (!id) return;
    if (role === 'SETTER') out.setterId = id;
    if (role === 'CLOSER') out.closerId = id;
  };

  for (const r of rules) {
    const role = (r?.role === 'CLOSER' ? 'CLOSER' : 'SETTER') as 'SETTER'|'CLOSER';
    const mode = (r?.by || 'email') as 'email'|'name'|'static';

    if (mode === 'email') {
      const raw = this.getByPath(payload, r.from);
      const email = this.normEmail(raw);
      if (!email) continue;
      const u = await this.findUserByEmailInsensitive(email);
      if (u && u.role === role) { put(role, u.id); continue; }
    }

    if (mode === 'name') {
      const name = String(this.getByPath(payload, r.from) || '').trim();
      if (!name) continue;
      const u = await this.findUserByNameApprox(name, role);
      if (u?.id) { put(role, u.id); continue; }
    }

    if (mode === 'static') {
      const val = String(this.getByPath(payload, r.from) ?? '').trim();
      const { equals, contains, regex } = r.match || {};
      let ok = false;
      if (equals != null)   ok ||= val.toLowerCase() === String(equals).toLowerCase();
      if (contains != null) ok ||= val.toLowerCase().includes(String(contains).toLowerCase());
      if (regex) {
        try { ok ||= new RegExp(regex, 'i').test(val); } catch {}
      }
      if (ok && r.userId) { put(role, r.userId); continue; }
    }
  }

  // Fallback round-robin pour SETTER ?
  if (!out.setterId && assign?.roundRobin?.setter) {
    const next = await this.pickNextActiveSetter();
    if (next) out.setterId = next.id;
  }

  // (Optionnel) Fallback round-robin pour CLOSER si tu l’actives un jour
  // if (!out.closerId && assign?.roundRobin?.closer) { ... }

  return out;
}

  /** ---------- Ingest Lead (GHL) ---------- */
async ingestLead(payload: {
  firstName: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  tag?: string | null;
  ghlContactId?: string | null;
  opportunityValue?: number | null; // <- accepte une valeur entrante, sinon défaut 5000
}) {
  const safeEmail =
    payload.email && String(payload.email).includes('@')
      ? String(payload.email).trim().toLowerCase()
      : null;

  // 1) upsert par email si présent, sinon par ghlContactId (ou placeholder)
  const createData: any = {
    firstName: payload.firstName,
    lastName: payload.lastName ?? null,
    email: safeEmail,
    phone: payload.phone ?? null,
    tag: payload.tag ?? null,
    source: 'GHL',
    ghlContactId: payload.ghlContactId ?? null,
    // défaut opportunité si non fournie
    opportunityValue: Number.isFinite(payload.opportunityValue as any)
      ? Number(payload.opportunityValue)
      : 5000,
  };

  const lead = await this.prisma.lead.upsert({
    where: safeEmail
      ? { email: safeEmail }
      : { ghlContactId: payload.ghlContactId ?? crypto.randomUUID() },
    update: {
      firstName: payload.firstName,
      lastName: payload.lastName ?? undefined,
      phone: payload.phone ?? undefined,
      tag: payload.tag ?? undefined,
      source: 'GHL',
      ghlContactId: payload.ghlContactId ?? undefined,
      // ne PAS écraser si la valeur existe déjà ; si tu veux forcer, enlève la condition
      ...(Number.isFinite(payload.opportunityValue as any)
        ? { opportunityValue: Number(payload.opportunityValue) }
        : {}),
    },
    create: createData,
  });

  // 2) auto-assignation (setter/closer) d’après le payload complet
// après l’upsert du lead
const mapping = (payload as any).__mappingJson ?? undefined;
const assign = await this.resolveAssignmentFromMapping((payload as any).__rawPayload ?? payload, mapping);

if (assign.setterId || assign.closerId) {
  await this.prisma.lead.update({
    where: { id: lead.id },
    data: {
      ...(assign.setterId ? { setterId: assign.setterId } : {}),
      ...(assign.closerId ? { closerId: assign.closerId } : {}),
    },
  });
} else {
  if (!lead.setterId) {
    await this.attribution.ensureSetter(lead.id);
  }
}


  return this.prisma.lead.findUnique({ where: { id: lead.id }, include: { setter: true, closer: true } });
}

  /** ---------- Helpers RDV ---------- */
  private toAppointmentType(v: any): AppointmentType {
    const s = String(v || 'RV1').toUpperCase();
    if (s.includes('RV0')) return AppointmentType.RV0;
    if (s.includes('RV2')) return AppointmentType.RV2;
    return AppointmentType.RV1;
  }

  private toAppointmentStatus(v: any): AppointmentStatus {
    const s = String(v || 'HONORED').toUpperCase().replace('-', '_').replace(' ', '_');
    if (s.includes('REPORT') || s.includes('POST')) return AppointmentStatus.POSTPONED;
    if (s.includes('ANNUL') || s.includes('CANCEL')) return AppointmentStatus.CANCELED;
    if (s.includes('NO') && s.includes('SHOW')) return AppointmentStatus.NO_SHOW;
    if (s.includes('NON') && s.includes('QUAL')) return AppointmentStatus.NOT_QUALIFIED;
    return AppointmentStatus.HONORED;
  }

  /** ---------- Ingest Appointment (GHL) ---------- */
  private async onAppointmentUpsert(body: any) {
    const leadEmail =
      body?.payload?.leadEmail || body?.payload?.contact?.email || body?.leadEmail || null;

    let lead: Lead | null = null;
    if (leadEmail) {
      lead = await this.prisma.lead.findFirst({ where: { email: String(leadEmail) } });
    }
    if (!lead && body?.payload?.ghlContactId) {
      lead = await this.prisma.lead.findFirst({
        where: { ghlContactId: String(body.payload.ghlContactId) },
      });
    }
    if (!lead) return;

    const ownerEmail =
      body?.payload?.ownerEmail || body?.payload?.user?.email || body?.ownerEmail || null;

    let user: User | null = null;
    if (ownerEmail) {
      user = await this.prisma.user.findFirst({ where: { email: String(ownerEmail) } });
    }

const mapping = (body as any).__mappingJson ?? undefined;
const assign = await this.resolveAssignmentFromMapping(body, mapping);
if (assign.closerId || assign.setterId) {
  await this.prisma.lead.update({
    where: { id: lead.id },
    data: {
      ...(assign.setterId ? { setterId: assign.setterId } : {}),
      ...(assign.closerId ? { closerId: assign.closerId } : {}),
    },
  });
}

    const type = this.toAppointmentType(body?.payload?.type);
    const status = this.toAppointmentStatus(body?.payload?.status);
    const iso = body?.payload?.scheduledAt || body?.payload?.startTime || new Date().toISOString();

    await this.prisma.appointment.create({
      data: {
        type,
        status,
        scheduledAt: new Date(iso),
        lead: { connect: { id: lead.id } },
        ...(user ? { user: { connect: { id: user.id } } } : {}),
      },
    });

    // Mise à jour du stage (kanban) + closer si l'utilisateur est un closer
    if (type === AppointmentType.RV0 || type === AppointmentType.RV1 || type === AppointmentType.RV2) {
      const next =
        type === AppointmentType.RV0 ? LeadStage.RV0_PLANNED :
        type === AppointmentType.RV1 ? LeadStage.RV1_PLANNED :
        LeadStage.RV2_PLANNED;

      await this.prisma.lead.update({
        where: { id: lead.id },
        data: {
          stage: next,
          stageUpdatedAt: new Date(),
          ...(user && user.role === Role.CLOSER ? { closerId: user.id } : {}),
        },
      });
    }
  }
/** Résout un user par email (case-insensitive). */
private async findUserByEmail(email?: string | null) {
  if (!email) return null;
  const e = String(email).trim().toLowerCase();
  if (!e.includes("@")) return null;
  return this.prisma.user.findFirst({
    where: { email: { equals: e, mode: 'insensitive' }, isActive: true },
    select: { id: true, role: true, firstName: true, email: true },
  });
}

/** Détermine les IDs d’assignation (setterId / closerId) à partir du payload reçu. */
private async resolveAssignmentFromPayload(payload: any): Promise<{ setterId?: string; closerId?: string }> {
  // Les chemins les plus fréquents côté GHL :
  const ownerEmail =
    payload?.payload?.ownerEmail ||
    payload?.payload?.user?.email ||
    payload?.ownerEmail ||
    payload?.user?.email ||
    null;

  const closerEmail =
    payload?.payload?.closerEmail ||
    payload?.closerEmail ||
    null;

  let setterId: string | undefined;
  let closerId: string | undefined;

  // 1) si ownerEmail pointe sur un SETTER existant → setterId
  const owner = await this.findUserByEmail(ownerEmail);
  if (owner?.role === 'SETTER') setterId = owner.id;
  if (owner?.role === 'CLOSER') closerId = owner.id;

  // 2) si closerEmail pointe sur un CLOSER existant → closerId (prioritaire si renseigné)
  const closer = await this.findUserByEmail(closerEmail);
  if (closer?.role === 'CLOSER') closerId = closer.id;

  // 3) fallback round-robin pour setter si rien trouvé
  if (!setterId) {
    const next = await this.pickNextActiveSetter();
    if (next) setterId = next.id;
  }

  return { setterId, closerId };
}

  /** ---------- Entrée principale du webhook ---------- */
  async handleGhlWebhook(rawBody: string, headers: Record<string, any>, body: any) {
    // 1) signature (si configurée)
    const sig = (headers['x-ghl-signature'] || headers['X-GHL-Signature']) as string | undefined;
    this.verifySignature(rawBody, sig);

    // 2) idempotence
    const type = String(body?.type || body?.event || 'unknown');
    const externalId = this.externalIdFrom(body);
    const payloadHash = this.hashPayload(body);

    const existing = await this.prisma.webhookEvent.findUnique({ where: { externalId } });
    if (existing && existing.payloadHash === payloadHash) {
      await this.prisma.webhookEvent.upsert({
        where: { externalId },
        update: { status: 'DUPLICATE' },
        create: { externalId, type, payloadHash, status: 'DUPLICATE' },
      });
      return { ok: true, duplicate: true };
    }

    await this.prisma.webhookEvent.upsert({
      where: { externalId },
      update: { type, payloadHash, status: 'RECEIVED' },
      create: { externalId, type, payloadHash, status: 'RECEIVED' },
    });

    // 3) routage
    try {
      if (type === 'lead.created' || type === 'contact.created') {
 await this.ingestLead({
  firstName: body?.payload?.firstName || body?.payload?.contact?.firstName || 'Unknown',
  lastName: body?.payload?.lastName || body?.payload?.contact?.lastName || null,
  email: body?.payload?.email || body?.payload?.contact?.email || null,
  phone: body?.payload?.phone || body?.payload?.contact?.phone || null,
  tag: body?.payload?.tag || body?.payload?.source || 'GHL',
  ghlContactId: body?.payload?.id || body?.payload?.contactId || null,
  // Si ton source envoie une valeur d’opportunité → on la prend, sinon défaut 5000 dans ingestLead
  opportunityValue: body?.payload?.opportunityValue ?? null,
  // On attache le raw pour l’auto-assignation
  ...(body ? { __rawPayload: body } : {}),
} as any);

      } else if (type === 'appointment.created' || type === 'appointment.updated') {
        await this.onAppointmentUpsert(body);
      }

      await this.prisma.webhookEvent.update({
        where: { externalId },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      return { ok: true };
    } catch (err: any) {
      await this.prisma.webhookEvent.update({
        where: { externalId },
        data: { status: 'ERROR', error: err?.message ?? String(err) },
      });
      throw err;
    }
  }
  
}
