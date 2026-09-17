import {
  LeadStage,
  Role,
  TeamAutomationStatus,
  TeamAutomationTrigger,
  TeamTaskPriority,
} from "@prisma/client";
import { TeamAutomationsService } from "./team-automations.service";

describe("TeamAutomationsService", () => {
  it("creates a task and a notification when a stage rule matches", async () => {
    const prisma = {
      lead: {
        findUnique: jest.fn().mockResolvedValue({
          id: "lead-1",
          firstName: "Amina",
          lastName: "Diallo",
          email: "amina@example.invalid",
          phone: null,
          source: "Meta Ads",
          tag: "Webinaire",
          stage: LeadStage.CALL_REQUESTED,
          setterId: "setter-1",
          closerId: null,
        }),
      },
      teamAutomationRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "rule-1",
            name: "Nouveau lead",
            status: TeamAutomationStatus.ACTIVE,
            trigger: TeamAutomationTrigger.LEAD_STAGE_CHANGED,
            triggerConfig: { toStages: [LeadStage.CALL_REQUESTED] },
            actions: [
              {
                type: "CREATE_TASK",
                title: "Appeler {{lead.firstName}}",
                assignee: "LEAD_SETTER",
                dueInMinutes: 15,
                priority: TeamTaskPriority.URGENT,
              },
              {
                type: "SEND_NOTIFICATION",
                title: "Nouveau lead",
                message: "{{lead.firstName}} attend votre appel.",
                recipient: "LEAD_SETTER",
              },
            ],
          },
        ]),
      },
      teamAutomationRun: {
        create: jest.fn().mockResolvedValue({ id: "run-1" }),
        update: jest.fn().mockResolvedValue({ id: "run-1" }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: "setter-1" }]),
      },
      teamTask: {
        create: jest
          .fn()
          .mockResolvedValue({ id: "task-1", assigneeId: "setter-1" }),
      },
      teamNotification: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new TeamAutomationsService(prisma as never);

    await service.handleStageChanged({
      leadId: "lead-1",
      fromStage: LeadStage.LEADS_RECEIVED,
      toStage: LeadStage.CALL_REQUESTED,
      occurredAt: new Date("2026-09-16T12:00:00.000Z"),
      source: "test",
    });

    expect(prisma.teamTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Appeler Amina",
          assigneeId: "setter-1",
          priority: TeamTaskPriority.URGENT,
        }),
      }),
    );
    expect(prisma.teamNotification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            userId: "setter-1",
            message: "Amina attend votre appel.",
          }),
        ],
      }),
    );
    expect(prisma.teamAutomationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SUCCESS" }),
      }),
    );
  });

  it("ignores rules targeting another stage", async () => {
    const prisma = {
      lead: {
        findUnique: jest.fn().mockResolvedValue({
          id: "lead-1",
          firstName: "Amina",
          lastName: null,
          email: null,
          phone: null,
          source: null,
          tag: null,
          stage: LeadStage.CALL_REQUESTED,
          setterId: null,
          closerId: null,
        }),
      },
      teamAutomationRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "rule-1",
            name: "Vente",
            triggerConfig: { toStages: [LeadStage.WON] },
            actions: [],
          },
        ]),
      },
      teamAutomationRun: { create: jest.fn() },
    };
    const service = new TeamAutomationsService(prisma as never);

    await service.handleStageChanged({
      leadId: "lead-1",
      toStage: LeadStage.CALL_REQUESTED,
      occurredAt: new Date("2026-09-16T12:00:00.000Z"),
    });

    expect(prisma.teamAutomationRun.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown task recipient strategy", async () => {
    const prisma = {
      teamAutomationRule: { create: jest.fn() },
    };
    const service = new TeamAutomationsService(prisma as never);

    await expect(
      service.createRule(
        { userId: "admin-1", email: "admin@example.invalid", role: Role.ADMIN },
        {
          name: "Règle invalide",
          trigger: TeamAutomationTrigger.LEAD_STAGE_CHANGED,
          triggerConfig: { toStages: [LeadStage.CALL_REQUESTED] },
          actions: [
            {
              type: "CREATE_TASK",
              title: "Appeler le prospect",
              assignee: "EVERYONE",
            },
          ],
        },
      ),
    ).rejects.toThrow("Action de tâche incomplète");
    expect(prisma.teamAutomationRule.create).not.toHaveBeenCalled();
  });

  it("creates a manual task and its notification for an active closer", async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: "closer-1",
          firstName: "Inès",
          lastName: "Petit",
          role: Role.CLOSER,
        }),
      },
      teamTask: {
        create: jest.fn().mockResolvedValue({
          id: "task-1",
          title: "Préparer le rendez-vous",
          priority: TeamTaskPriority.HIGH,
          dueAt: new Date("2099-09-18T10:00:00.000Z"),
          assignee: {
            id: "closer-1",
            firstName: "Inès",
            lastName: "Petit",
            role: Role.CLOSER,
          },
          lead: null,
          rule: null,
        }),
      },
      teamNotification: {
        create: jest.fn().mockResolvedValue({ id: "notification-1" }),
      },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };
    const service = new TeamAutomationsService(prisma as never);

    const task = await service.createManualTask(
      { userId: "admin-1", email: "admin@example.invalid", role: Role.ADMIN },
      {
        title: " Préparer le rendez-vous ",
        description: "Relire les notes du prospect",
        assigneeId: "closer-1",
        priority: TeamTaskPriority.HIGH,
        dueAt: "2099-09-18T10:00:00.000Z",
      },
    );

    expect(task.id).toBe("task-1");
    expect(prisma.teamTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Préparer le rendez-vous",
          assigneeId: "closer-1",
          metadata: expect.objectContaining({
            source: "MANUAL",
            createdById: "admin-1",
          }),
        }),
      }),
    );
    expect(prisma.teamNotification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "closer-1",
        type: "TASK_ASSIGNED",
        title: "Nouvelle tâche : Préparer le rendez-vous",
        metadata: expect.objectContaining({ taskId: "task-1" }),
      }),
    });
  });

  it("rejects a manual task assigned to an administrator", async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    };
    const service = new TeamAutomationsService(prisma as never);

    await expect(
      service.createManualTask(
        { userId: "admin-1", email: "admin@example.invalid", role: Role.ADMIN },
        { title: "Tâche", assigneeId: "admin-2" },
      ),
    ).rejects.toThrow("Sélectionnez un closer ou setter actif");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
