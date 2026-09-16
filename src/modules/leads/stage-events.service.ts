import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { LeadStage } from "@prisma/client";
import { TeamAutomationsService } from "../../team-automations/team-automations.service";

@Injectable()
export class StageEventsService {
  constructor(
    private prisma: PrismaService,
    private readonly teamAutomations: TeamAutomationsService,
  ) {}

  /**
   * Enregistre le 1er passage d’un lead dans un stage donné.
   *
   * - Un lead ne peut avoir QU’UN SEUL StageEvent par (leadId, toStage)
   *   → grâce à dedupHash @unique.
   * - Si on rappelle la méthode pour le même (leadId, toStage), on ne
   *   modifie rien : on garde la date du premier passage.
   */
  async recordStageEntry(opts: {
    leadId: string;
    fromStage?: LeadStage | null;
    toStage: LeadStage;
    source?: string | null;
    externalId?: string | null;
    occurredAt?: Date;
  }) {
    const {
      leadId,
      fromStage = null,
      toStage,
      source,
      externalId,
      occurredAt,
    } = opts;

    const when = occurredAt ?? new Date();

    // 1 event max par (lead, stage) → dedupHash unique
    const dedupHash = `${leadId}|${toStage}`;

    const event = await this.prisma.stageEvent.upsert({
      where: { dedupHash },
      update: {}, // ne rien changer : on garde le 1er event
      create: {
        leadId,
        fromStage,
        toStage,
        occurredAt: when,
        source: source ?? null,
        externalId: externalId ?? null,
        dedupHash,
      },
    });

    await this.teamAutomations.handleStageChanged({
      leadId,
      fromStage,
      toStage,
      occurredAt: event.occurredAt,
      source,
    });

    return event;
  }
}
