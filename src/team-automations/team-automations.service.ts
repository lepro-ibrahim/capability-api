import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  LeadStage,
  Prisma,
  Role,
  TeamAutomationRunStatus,
  TeamAutomationStatus,
  TeamAutomationTrigger,
  TeamTaskPriority,
  TeamTaskStatus,
} from "@prisma/client";
import { isIP } from "node:net";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateManualTeamTaskDto,
  CreateTeamAutomationRuleDto,
  UpdateTeamAutomationRuleDto,
} from "./dto/team-automation.dto";

type AuthUser = { userId: string; role: Role; email: string };
type RecipientStrategy =
  "LEAD_SETTER" | "LEAD_CLOSER" | "ADMINS" | "SPECIFIC_USER";
type TriggerConfig = {
  fromStages?: LeadStage[];
  toStages?: LeadStage[];
  sources?: string[];
  tags?: string[];
};
type CreateTaskAction = {
  type: "CREATE_TASK";
  title: string;
  description?: string;
  assignee: RecipientStrategy;
  userId?: string;
  dueInMinutes?: number;
  priority?: TeamTaskPriority;
};
type NotificationAction = {
  type: "SEND_NOTIFICATION";
  title: string;
  message: string;
  recipient: RecipientStrategy;
  userId?: string;
};
type WebhookAction = {
  type: "OUTGOING_WEBHOOK";
  url: string;
};
type TeamAutomationAction =
  CreateTaskAction | NotificationAction | WebhookAction;
type StageChangedInput = {
  leadId: string;
  fromStage?: LeadStage | null;
  toStage: LeadStage;
  occurredAt: Date;
  source?: string | null;
};
type LeadContext = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  tag: string | null;
  stage: LeadStage;
  setterId: string | null;
  closerId: string | null;
};

const RECIPIENT_STRATEGIES = new Set<RecipientStrategy>([
  "LEAD_SETTER",
  "LEAD_CLOSER",
  "ADMINS",
  "SPECIFIC_USER",
]);

const RULE_TEMPLATES = [
  {
    key: "CALL_REQUESTED",
    name: "Nouveau lead à appeler",
    description:
      "Crée une tâche urgente et prévient le setter dès qu’un lead demande un appel.",
    triggerConfig: { toStages: [LeadStage.CALL_REQUESTED] },
    actions: [
      {
        type: "CREATE_TASK",
        title: "Appeler {{lead.firstName}}",
        description: "Un nouveau lead attend d’être contacté.",
        assignee: "LEAD_SETTER",
        dueInMinutes: 15,
        priority: TeamTaskPriority.URGENT,
      },
      {
        type: "SEND_NOTIFICATION",
        title: "Nouveau lead à contacter",
        message:
          "{{lead.firstName}} {{lead.lastName}} vient de demander un appel.",
        recipient: "LEAD_SETTER",
      },
    ],
  },
  {
    key: "CLOSER_APPOINTMENT",
    name: "Préparer un rendez-vous closer",
    description:
      "Prépare automatiquement le closer lorsqu’un rendez-vous est planifié.",
    triggerConfig: { toStages: [LeadStage.RV1_PLANNED] },
    actions: [
      {
        type: "CREATE_TASK",
        title: "Préparer le dossier de {{lead.firstName}}",
        description:
          "Vérifier le contexte, les notes et la qualification avant le rendez-vous.",
        assignee: "LEAD_CLOSER",
        dueInMinutes: 60,
        priority: TeamTaskPriority.HIGH,
      },
      {
        type: "SEND_NOTIFICATION",
        title: "Nouveau rendez-vous closer",
        message:
          "Un rendez-vous a été planifié avec {{lead.firstName}} {{lead.lastName}}.",
        recipient: "LEAD_CLOSER",
      },
    ],
  },
  {
    key: "NO_SHOW_FOLLOW_UP",
    name: "Relancer un no-show",
    description:
      "Crée une relance prioritaire lorsqu’un prospect ne se présente pas.",
    triggerConfig: { toStages: [LeadStage.RV1_NO_SHOW] },
    actions: [
      {
        type: "CREATE_TASK",
        title: "Relancer {{lead.firstName}} après son no-show",
        description: "Proposer rapidement un nouveau créneau.",
        assignee: "LEAD_CLOSER",
        dueInMinutes: 15,
        priority: TeamTaskPriority.URGENT,
      },
      {
        type: "SEND_NOTIFICATION",
        title: "No-show à traiter",
        message:
          "{{lead.firstName}} {{lead.lastName}} ne s’est pas présenté au rendez-vous.",
        recipient: "LEAD_CLOSER",
      },
    ],
  },
  {
    key: "SALE_WON",
    name: "Informer l’équipe d’une vente",
    description:
      "Notifie les administrateurs et le closer lorsqu’une vente est gagnée.",
    triggerConfig: { toStages: [LeadStage.WON] },
    actions: [
      {
        type: "SEND_NOTIFICATION",
        title: "Nouvelle vente gagnée 🎉",
        message:
          "{{lead.firstName}} {{lead.lastName}} vient de passer en vente gagnée.",
        recipient: "ADMINS",
      },
      {
        type: "SEND_NOTIFICATION",
        title: "Vente confirmée",
        message:
          "Bravo, la vente de {{lead.firstName}} {{lead.lastName}} est confirmée.",
        recipient: "LEAD_CLOSER",
      },
    ],
  },
] satisfies Array<{
  key: string;
  name: string;
  description: string;
  triggerConfig: TriggerConfig;
  actions: TeamAutomationAction[];
}>;

@Injectable()
export class TeamAutomationsService {
  constructor(private readonly prisma: PrismaService) {}

  async catalog() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      orderBy: [{ role: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
      },
    });
    return {
      stages: Object.values(LeadStage),
      users,
      templates: RULE_TEMPLATES,
      recipientStrategies: [
        "LEAD_SETTER",
        "LEAD_CLOSER",
        "ADMINS",
        "SPECIFIC_USER",
      ],
      actionTypes: ["CREATE_TASK", "SEND_NOTIFICATION", "OUTGOING_WEBHOOK"],
    };
  }

  async listRules() {
    return this.prisma.teamAutomationRule.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { runs: true, tasks: true, notifications: true } },
        runs: {
          orderBy: { startedAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            startedAt: true,
            finishedAt: true,
            error: true,
          },
        },
      },
    });
  }

  async createRule(user: AuthUser, body: CreateTeamAutomationRuleDto) {
    if (!body.name.trim()) {
      throw new BadRequestException("Le nom de l’automatisation est requis");
    }
    const actions = this.validateActions(body.actions);
    const triggerConfig = this.validateTriggerConfig(body.triggerConfig);
    return this.prisma.teamAutomationRule.create({
      data: {
        name: body.name.trim(),
        description: body.description?.trim() || null,
        status: body.status ?? TeamAutomationStatus.ACTIVE,
        trigger: body.trigger,
        triggerConfig: triggerConfig as Prisma.InputJsonValue,
        actions: actions as unknown as Prisma.InputJsonValue,
        createdById: user.userId,
      },
    });
  }

  async createFromTemplate(user: AuthUser, key: string) {
    const template = RULE_TEMPLATES.find((item) => item.key === key);
    if (!template)
      throw new NotFoundException("Modèle d’automatisation introuvable");
    return this.createRule(user, {
      name: template.name,
      description: template.description,
      trigger: TeamAutomationTrigger.LEAD_STAGE_CHANGED,
      triggerConfig: template.triggerConfig,
      actions: template.actions as unknown as Array<Record<string, unknown>>,
    });
  }

  async updateRule(id: string, body: UpdateTeamAutomationRuleDto) {
    const existing = await this.prisma.teamAutomationRule.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Automatisation introuvable");
    if (body.name !== undefined && !body.name.trim()) {
      throw new BadRequestException("Le nom de l’automatisation est requis");
    }
    const actions = body.actions
      ? this.validateActions(body.actions)
      : undefined;
    const triggerConfig = body.triggerConfig
      ? this.validateTriggerConfig(body.triggerConfig)
      : undefined;
    return this.prisma.teamAutomationRule.update({
      where: { id },
      data: {
        name: body.name?.trim(),
        description:
          body.description === undefined
            ? undefined
            : body.description.trim() || null,
        status: body.status,
        trigger: body.trigger,
        triggerConfig: triggerConfig as Prisma.InputJsonValue | undefined,
        actions: actions as unknown as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async summary(user: AuthUser) {
    const taskScope =
      user.role === Role.ADMIN ? {} : { assigneeId: user.userId };
    const notificationScope = { userId: user.userId };
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const [
      openTasks,
      overdueTasks,
      unreadNotifications,
      activeRules,
      runsToday,
    ] = await Promise.all([
      this.prisma.teamTask.count({
        where: { ...taskScope, status: TeamTaskStatus.TODO },
      }),
      this.prisma.teamTask.count({
        where: {
          ...taskScope,
          status: TeamTaskStatus.TODO,
          dueAt: { lt: now },
        },
      }),
      this.prisma.teamNotification.count({
        where: { ...notificationScope, readAt: null },
      }),
      user.role === Role.ADMIN
        ? this.prisma.teamAutomationRule.count({
            where: { status: TeamAutomationStatus.ACTIVE },
          })
        : Promise.resolve(0),
      user.role === Role.ADMIN
        ? this.prisma.teamAutomationRun.count({
            where: { startedAt: { gte: dayStart } },
          })
        : Promise.resolve(0),
    ]);
    return {
      openTasks,
      overdueTasks,
      unreadNotifications,
      activeRules,
      runsToday,
    };
  }

  async listTasks(user: AuthUser, status?: TeamTaskStatus) {
    return this.prisma.teamTask.findMany({
      where: {
        ...(user.role === Role.ADMIN ? {} : { assigneeId: user.userId }),
        ...(status ? { status } : {}),
      },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        assignee: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
        lead: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            source: true,
            stage: true,
          },
        },
        rule: { select: { id: true, name: true } },
      },
    });
  }

  async createManualTask(user: AuthUser, body: CreateManualTeamTaskDto) {
    const title = body.title.trim();
    if (!title)
      throw new BadRequestException("Le titre de la tâche est requis");

    const assignee = await this.prisma.user.findFirst({
      where: {
        id: body.assigneeId,
        isActive: true,
        role: { in: [Role.CLOSER, Role.SETTER] },
      },
      select: { id: true, firstName: true, lastName: true, role: true },
    });
    if (!assignee) {
      throw new BadRequestException("Sélectionnez un closer ou setter actif");
    }

    const dueAt = body.dueAt ? new Date(body.dueAt) : null;
    if (dueAt && dueAt.getTime() <= Date.now()) {
      throw new BadRequestException("L’échéance doit être dans le futur");
    }

    const description = body.description?.trim() || null;
    const message =
      body.notificationMessage?.trim() ||
      description ||
      "Une nouvelle tâche vous a été assignée dans Capability.";

    return this.prisma.$transaction(async (transaction) => {
      const task = await transaction.teamTask.create({
        data: {
          title,
          description,
          priority: body.priority ?? TeamTaskPriority.NORMAL,
          dueAt,
          assigneeId: assignee.id,
          metadata: {
            source: "MANUAL",
            createdById: user.userId,
            createdByEmail: user.email,
          },
        },
        include: {
          assignee: {
            select: { id: true, firstName: true, lastName: true, role: true },
          },
          lead: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              source: true,
              stage: true,
            },
          },
          rule: { select: { id: true, name: true } },
        },
      });

      await transaction.teamNotification.create({
        data: {
          userId: assignee.id,
          title: `Nouvelle tâche : ${title}`,
          message,
          type: "TASK_ASSIGNED",
          link: "/automations",
          metadata: {
            taskId: task.id,
            createdById: user.userId,
            priority: task.priority,
            dueAt: task.dueAt?.toISOString() ?? null,
          },
        },
      });

      return task;
    });
  }

  async updateTask(user: AuthUser, id: string, status: TeamTaskStatus) {
    const task = await this.prisma.teamTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("Tâche introuvable");
    if (user.role !== Role.ADMIN && task.assigneeId !== user.userId) {
      throw new ForbiddenException("Vous ne pouvez pas modifier cette tâche");
    }
    return this.prisma.teamTask.update({
      where: { id },
      data: {
        status,
        completedAt: status === TeamTaskStatus.DONE ? new Date() : null,
      },
    });
  }

  async listNotifications(user: AuthUser) {
    return this.prisma.teamNotification.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { rule: { select: { id: true, name: true } } },
    });
  }

  async markNotificationRead(user: AuthUser, id: string) {
    const notification = await this.prisma.teamNotification.findUnique({
      where: { id },
    });
    if (!notification) throw new NotFoundException("Notification introuvable");
    if (notification.userId !== user.userId) {
      throw new ForbiddenException(
        "Vous ne pouvez pas modifier cette notification",
      );
    }
    return this.prisma.teamNotification.update({
      where: { id },
      data: { readAt: notification.readAt ?? new Date() },
    });
  }

  async markAllNotificationsRead(user: AuthUser) {
    const result = await this.prisma.teamNotification.updateMany({
      where: { userId: user.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true, count: result.count };
  }

  async handleStageChanged(input: StageChangedInput) {
    try {
      const [lead, rules] = await Promise.all([
        this.prisma.lead.findUnique({
          where: { id: input.leadId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            source: true,
            tag: true,
            stage: true,
            setterId: true,
            closerId: true,
          },
        }),
        this.prisma.teamAutomationRule.findMany({
          where: {
            status: TeamAutomationStatus.ACTIVE,
            trigger: TeamAutomationTrigger.LEAD_STAGE_CHANGED,
          },
        }),
      ]);
      if (!lead) return;
      for (const rule of rules) {
        const config = rule.triggerConfig as TriggerConfig;
        if (!this.matchesTrigger(config, input, lead)) continue;
        await this.executeRule(
          rule,
          input,
          lead,
          rule.actions as unknown as TeamAutomationAction[],
        );
      }
    } catch (error) {
      console.error(
        "[TEAM_AUTOMATION] stage trigger failed",
        this.errorMessage(error),
      );
    }
  }

  private async executeRule(
    rule: { id: string; name: string },
    input: StageChangedInput,
    lead: LeadContext,
    actions: TeamAutomationAction[],
  ) {
    const triggerKey = `stage:${lead.id}:${input.toStage}`;
    let run: { id: string };
    try {
      run = await this.prisma.teamAutomationRun.create({
        data: {
          ruleId: rule.id,
          triggerKey,
          context: this.eventContext(input, lead) as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) return;
      throw error;
    }

    const results: Array<Record<string, unknown>> = [];
    let failed = false;
    for (const action of actions) {
      try {
        results.push(
          await this.executeAction(rule.id, run.id, action, input, lead),
        );
      } catch (error) {
        failed = true;
        results.push({
          type: action.type,
          ok: false,
          error: this.errorMessage(error),
        });
      }
    }

    await this.prisma.teamAutomationRun.update({
      where: { id: run.id },
      data: {
        status: failed
          ? TeamAutomationRunStatus.FAILED
          : TeamAutomationRunStatus.SUCCESS,
        result: results as Prisma.InputJsonValue,
        error: failed ? "Une ou plusieurs actions ont échoué" : null,
        finishedAt: new Date(),
      },
    });
  }

  private async executeAction(
    ruleId: string,
    runId: string,
    action: TeamAutomationAction,
    input: StageChangedInput,
    lead: LeadContext,
  ): Promise<Record<string, unknown>> {
    if (action.type === "CREATE_TASK") {
      const recipients = await this.resolveRecipients(
        action.assignee,
        action.userId,
        lead,
      );
      const assignee = recipients[0];
      if (!assignee)
        return { type: action.type, ok: true, skipped: "no_assignee" };
      const dueAt =
        action.dueInMinutes != null
          ? new Date(input.occurredAt.getTime() + action.dueInMinutes * 60_000)
          : null;
      const task = await this.prisma.teamTask.create({
        data: {
          title: this.render(action.title, lead),
          description: action.description
            ? this.render(action.description, lead)
            : null,
          priority: action.priority ?? TeamTaskPriority.NORMAL,
          dueAt,
          assigneeId: assignee.id,
          leadId: lead.id,
          ruleId,
          runId,
          metadata: { trigger: "LEAD_STAGE_CHANGED", toStage: input.toStage },
        },
        select: { id: true, assigneeId: true },
      });
      return {
        type: action.type,
        ok: true,
        taskId: task.id,
        assigneeId: task.assigneeId,
      };
    }

    if (action.type === "SEND_NOTIFICATION") {
      const recipients = await this.resolveRecipients(
        action.recipient,
        action.userId,
        lead,
      );
      if (!recipients.length)
        return { type: action.type, ok: true, skipped: "no_recipient" };
      await this.prisma.teamNotification.createMany({
        data: recipients.map((recipient) => ({
          userId: recipient.id,
          title: this.render(action.title, lead),
          message: this.render(action.message, lead),
          link: "/prospects",
          ruleId,
          runId,
          metadata: { leadId: lead.id, toStage: input.toStage },
        })),
      });
      return { type: action.type, ok: true, recipients: recipients.length };
    }

    this.assertSafeWebhookUrl(action.url);
    const response = await fetch(action.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: "capability.lead_stage_changed",
        occurredAt: input.occurredAt.toISOString(),
        lead: this.eventContext(input, lead).lead,
      }),
      signal: AbortSignal.timeout(5_000),
      redirect: "error",
    });
    if (!response.ok) throw new Error(`Webhook HTTP ${response.status}`);
    return { type: action.type, ok: true, status: response.status };
  }

  private async resolveRecipients(
    strategy: RecipientStrategy,
    userId: string | undefined,
    lead: LeadContext,
  ) {
    if (strategy === "LEAD_SETTER") {
      return lead.setterId
        ? this.prisma.user.findMany({
            where: { id: lead.setterId, isActive: true },
            select: { id: true },
          })
        : [];
    }
    if (strategy === "LEAD_CLOSER") {
      return lead.closerId
        ? this.prisma.user.findMany({
            where: { id: lead.closerId, isActive: true },
            select: { id: true },
          })
        : [];
    }
    if (strategy === "SPECIFIC_USER") {
      return userId
        ? this.prisma.user.findMany({
            where: { id: userId, isActive: true },
            select: { id: true },
          })
        : [];
    }
    return this.prisma.user.findMany({
      where: { role: Role.ADMIN, isActive: true },
      select: { id: true },
    });
  }

  private matchesTrigger(
    config: TriggerConfig,
    input: StageChangedInput,
    lead: LeadContext,
  ) {
    if (
      config.fromStages?.length &&
      (!input.fromStage || !config.fromStages.includes(input.fromStage))
    ) {
      return false;
    }
    if (config.toStages?.length && !config.toStages.includes(input.toStage))
      return false;
    if (
      config.sources?.length &&
      (!lead.source || !config.sources.includes(lead.source))
    )
      return false;
    if (config.tags?.length && (!lead.tag || !config.tags.includes(lead.tag)))
      return false;
    return true;
  }

  private validateTriggerConfig(raw: Record<string, unknown>): TriggerConfig {
    const config = raw as TriggerConfig;
    const stages = new Set(Object.values(LeadStage));
    for (const key of ["fromStages", "toStages"] as const) {
      const values = config[key];
      if (
        values &&
        (!Array.isArray(values) || values.some((value) => !stages.has(value)))
      ) {
        throw new BadRequestException(`Configuration ${key} invalide`);
      }
    }
    if (!config.toStages?.length) {
      throw new BadRequestException(
        "Sélectionnez au moins une étape de destination",
      );
    }
    for (const key of ["sources", "tags"] as const) {
      const values = config[key];
      if (
        values &&
        (!Array.isArray(values) ||
          values.some((value) => typeof value !== "string"))
      ) {
        throw new BadRequestException(`Configuration ${key} invalide`);
      }
    }
    return config;
  }

  private validateActions(
    raw: Array<Record<string, unknown>>,
  ): TeamAutomationAction[] {
    if (!raw.length || raw.length > 8) {
      throw new BadRequestException(
        "Une automatisation doit contenir entre 1 et 8 actions",
      );
    }
    const actions = raw as unknown as TeamAutomationAction[];
    for (const action of actions) {
      if (!action || typeof action !== "object") {
        throw new BadRequestException("Action d’automatisation invalide");
      }
      if (action.type === "CREATE_TASK") {
        if (
          typeof action.title !== "string" ||
          !action.title.trim() ||
          !RECIPIENT_STRATEGIES.has(action.assignee)
        ) {
          throw new BadRequestException("Action de tâche incomplète");
        }
        this.validateSpecificRecipient(action.assignee, action.userId);
        if (
          action.priority !== undefined &&
          !Object.values(TeamTaskPriority).includes(action.priority)
        ) {
          throw new BadRequestException("Priorité de tâche invalide");
        }
        if (
          action.dueInMinutes != null &&
          (!Number.isFinite(action.dueInMinutes) ||
            action.dueInMinutes < 0 ||
            action.dueInMinutes > 43_200)
        ) {
          throw new BadRequestException(
            "Le délai de tâche doit être compris entre 0 et 30 jours",
          );
        }
      } else if (action.type === "SEND_NOTIFICATION") {
        if (
          typeof action.title !== "string" ||
          !action.title?.trim() ||
          typeof action.message !== "string" ||
          !action.message?.trim() ||
          !RECIPIENT_STRATEGIES.has(action.recipient)
        ) {
          throw new BadRequestException("Action de notification incomplète");
        }
        this.validateSpecificRecipient(action.recipient, action.userId);
      } else if (action.type === "OUTGOING_WEBHOOK") {
        this.assertSafeWebhookUrl(action.url);
      } else {
        throw new BadRequestException("Type d’action non pris en charge");
      }
    }
    return actions;
  }

  private assertSafeWebhookUrl(value: string) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException("URL de webhook invalide");
    }
    const host = url.hostname.toLowerCase();
    const privateIp =
      /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
    if (
      url.protocol !== "https:" ||
      host === "localhost" ||
      host === "0.0.0.0" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host === "metadata.google.internal" ||
      this.isPrivateIpLiteral(host) ||
      privateIp.test(host)
    ) {
      throw new BadRequestException(
        "Le webhook doit utiliser une URL HTTPS publique",
      );
    }
  }

  private validateSpecificRecipient(
    strategy: RecipientStrategy,
    userId?: string,
  ) {
    if (strategy === "SPECIFIC_USER" && !userId?.trim()) {
      throw new BadRequestException("Sélectionnez un destinataire précis");
    }
  }

  private isPrivateIpLiteral(host: string) {
    const value =
      host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
    if (isIP(value) === 4) {
      const [a, b] = value.split(".").map(Number);
      return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
      );
    }
    if (isIP(value) === 6) {
      const normalized = value.toLowerCase();
      return (
        normalized === "::" ||
        normalized === "::1" ||
        normalized.startsWith("fc") ||
        normalized.startsWith("fd") ||
        normalized.startsWith("fe8") ||
        normalized.startsWith("fe9") ||
        normalized.startsWith("fea") ||
        normalized.startsWith("feb")
      );
    }
    return false;
  }

  private render(template: string, lead: LeadContext) {
    const values: Record<string, string> = {
      "lead.firstName": lead.firstName,
      "lead.lastName": lead.lastName ?? "",
      "lead.email": lead.email ?? "",
      "lead.phone": lead.phone ?? "",
      "lead.source": lead.source ?? "",
      "lead.tag": lead.tag ?? "",
      "lead.stage": lead.stage,
    };
    return template.replace(
      /{{\s*([^}]+)\s*}}/g,
      (_, key: string) => values[key.trim()] ?? "",
    );
  }

  private eventContext(input: StageChangedInput, lead: LeadContext) {
    return {
      trigger: TeamAutomationTrigger.LEAD_STAGE_CHANGED,
      fromStage: input.fromStage ?? null,
      toStage: input.toStage,
      occurredAt: input.occurredAt.toISOString(),
      source: input.source ?? null,
      lead: {
        id: lead.id,
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        source: lead.source,
        tag: lead.tag,
        setterId: lead.setterId,
        closerId: lead.closerId,
      },
    };
  }

  private isUniqueConflict(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }

  private errorMessage(error: unknown) {
    return error instanceof Error
      ? error.message.slice(0, 500)
      : "Erreur inconnue";
  }
}
