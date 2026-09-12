// src/integrations/ghl/ghl.controller.ts
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { GhlService } from './ghl.service';

import { Public } from '../../auth/public.decorator';
import { WebhookSecretGuard } from '../../auth/webhook-secret.guard';

type GhlWebhookBody = {
  eventId?: string;
  type?: string; // e.g. 'contact.created' | 'appointment.created' | 'opportunity.updated' ...
  payload?: any;
};

@Controller('integrations/ghl')
export class GhlController {
  constructor(private readonly ghl: GhlService) {}

  /**
   * Endpoint unique pour les webhooks GHL.
   * Idempotent (déduplication via eventId) + routage simple vers le service.
   */
  @Public()
  @UseGuards(WebhookSecretGuard)
  @Post('webhook')
  @HttpCode(200)
  async webhook(@Body() body: GhlWebhookBody) {
    // 1) Normalisation des champs usuels
    const payload = body?.payload || body;
    const rawType = (body?.type || payload?.type || '').toString();
    const type = rawType.toLowerCase();
    const eventId =
      body?.eventId ??
      payload?.eventId ??
      payload?.id ?? // certains events
      payload?.appointmentId ??
      payload?.opportunityId ??
      undefined;

    // 2) Idempotence : si déjà traité on ignore
    const fresh = await this.ghl.deduplicate(eventId);
    if (!fresh) {
      return { ok: true, handled: 'duplicate' };
    }

    // 3) Contact events
    if (type.startsWith('contact')) {
      await this.ghl.upsertContact({
        firstName: payload?.firstName ?? payload?.contact?.firstName,
        lastName: payload?.lastName ?? payload?.contact?.lastName,
        email: payload?.email ?? payload?.contact?.email,
        phone: payload?.phone ?? payload?.contact?.phone,
        tag: payload?.tag ?? payload?.source,
        ghlContactId: payload?.id ?? payload?.contactId ?? payload?.contact?.id,
        sourceTag: payload?.source,
      });
      return { ok: true, handled: 'contact' };
    }

    // 4) Opportunity / deal events
    if (type.includes('opportunity')) {
      await this.ghl.upsertOpportunity({
        contactEmail: payload?.contactEmail ?? payload?.email ?? payload?.contact?.email,
        ghlContactId: payload?.contactId ?? payload?.ghlContactId ?? payload?.contact?.id,
        amount: payload?.amount ?? payload?.opportunityValue,
        stage:
          payload?.stage ??
          payload?.pipelineStage ??
          payload?.stage_name ??
          payload?.opportunity?.stage_name,
        saleValue: payload?.saleValue ?? payload?.opportunity?.monetary_value,
        eventId,
      });
      return { ok: true, handled: 'opportunity' };
    }

    // 5) Appointment / calendar events
    if (type.includes('appointment')) {
      await this.ghl.upsertAppointment({
        id: payload?.id ?? payload?.eventId ?? payload?.appointmentId,
        type: payload?.type ?? payload?.appointmentType,       // RV0 | RV1 | RV2
        status: payload?.status,                               // SCHEDULED | HONORED | NO_SHOW | ...
        startTime: payload?.scheduledAt ?? payload?.startTime, // ISO
        contactEmail: payload?.leadEmail ?? payload?.contact?.email,
        ghlContactId: payload?.contactId ?? payload?.ghlContactId ?? payload?.contact?.id,
        ownerEmail: payload?.ownerEmail ?? payload?.user?.email,
        eventId,
      });
      return { ok: true, handled: 'appointment' };
    }

    // 6) Fallback best-effort (GHL envoie parfois des payloads sans type)
    if (payload?.contact || payload?.email) {
      await this.ghl.upsertContact({
        firstName: payload?.firstName ?? payload?.contact?.firstName,
        lastName: payload?.lastName ?? payload?.contact?.lastName,
        email: payload?.email ?? payload?.contact?.email,
        phone: payload?.phone ?? payload?.contact?.phone,
        tag: payload?.tag ?? payload?.source,
        ghlContactId: payload?.id ?? payload?.contactId ?? payload?.contact?.id,
        sourceTag: payload?.source,
      });
      return { ok: true, handled: 'contact-fallback' };
    }

    // 7) Rien de pertinent
    return { ok: true, handled: 'ignored' };
  }
}
