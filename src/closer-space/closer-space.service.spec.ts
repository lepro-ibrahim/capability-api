import { ForbiddenException } from "@nestjs/common";
import {
  AppointmentStatus,
  AppointmentType,
  CloserLedgerStatus,
  CloserLedgerType,
  Role,
} from "@prisma/client";
import { CloserSpaceService, RequestUser } from "./closer-space.service";

const closer = {
  id: "closer-1",
  firstName: "Nora",
  lastName: "Diallo",
  email: "nora@example.com",
  closerSettings: { commissionRate: 12, monthlyTarget: 50000 },
};

function prismaMock() {
  return {
    user: { findFirst: jest.fn(), findMany: jest.fn() },
    appointment: { findMany: jest.fn() },
    closerReport: { findMany: jest.fn(), create: jest.fn(), upsert: jest.fn() },
    contract: { findMany: jest.fn(), findFirst: jest.fn() },
    lead: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    closerLedgerEntry: { findMany: jest.fn(), create: jest.fn() },
    teamTask: { findMany: jest.fn() },
    closerSettings: { upsert: jest.fn() },
  };
}

describe("CloserSpaceService", () => {
  const admin: RequestUser = {
    userId: "admin-1",
    email: "admin@example.com",
    role: Role.ADMIN,
  };

  it("bloque un setter", async () => {
    const prisma = prismaMock();
    const service = new CloserSpaceService(prisma as never);
    await expect(
      service.cockpit(
        { ...admin, role: Role.SETTER },
        { closerId: "closer-1" },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("sépare signé, encaissé, remboursements et reste à encaisser", async () => {
    const prisma = prismaMock();
    prisma.user.findFirst.mockResolvedValue(closer);
    prisma.appointment.findMany
      .mockResolvedValueOnce([
        {
          id: "a1",
          type: AppointmentType.RV1,
          status: AppointmentStatus.HONORED,
          scheduledAt: new Date(),
        },
        {
          id: "a2",
          type: AppointmentType.RV1,
          status: AppointmentStatus.NO_SHOW,
          scheduledAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.closerReport.findMany.mockResolvedValue([
      {
        proposalMade: true,
        objections: ["Prix", "Timing", "Prix"],
        outcome: "FOLLOW_UP",
        reportedAt: new Date(),
      },
    ]);
    prisma.contract.findMany.mockResolvedValue([
      {
        id: "contract-1",
        total: 10000,
        deposit: 3000,
        createdAt: new Date(),
        leadId: "lead-1",
        lead: { firstName: "Sam", lastName: "Lee", email: null },
        ledgerEntries: [
          {
            type: CloserLedgerType.PAYMENT,
            status: CloserLedgerStatus.PAID,
            amount: 5000,
          },
          {
            type: CloserLedgerType.REFUND,
            status: CloserLedgerStatus.PAID,
            amount: 1000,
          },
          {
            type: CloserLedgerType.PAYMENT,
            status: CloserLedgerStatus.OVERDUE,
            amount: 2000,
          },
        ],
      },
    ]);
    prisma.lead.count.mockResolvedValue(1);
    prisma.closerLedgerEntry.findMany.mockResolvedValue([
      {
        id: "p1",
        type: CloserLedgerType.PAYMENT,
        status: CloserLedgerStatus.PAID,
        amount: 5000,
        label: null,
        occurredAt: new Date(),
        dueAt: null,
        contractId: "contract-1",
        lead: null,
      },
      {
        id: "r1",
        type: CloserLedgerType.REFUND,
        status: CloserLedgerStatus.PAID,
        amount: 1000,
        label: null,
        occurredAt: new Date(),
        dueAt: null,
        contractId: "contract-1",
        lead: null,
      },
      {
        id: "u1",
        type: CloserLedgerType.PAYMENT,
        status: CloserLedgerStatus.OVERDUE,
        amount: 2000,
        label: null,
        occurredAt: new Date(),
        dueAt: new Date(),
        contractId: "contract-1",
        lead: null,
      },
    ]);
    prisma.teamTask.findMany.mockResolvedValue([]);
    prisma.lead.findMany.mockResolvedValue([]);

    const result = await new CloserSpaceService(prisma as never).cockpit(
      admin,
      {
        closerId: closer.id,
      },
    );

    expect(result.cash).toEqual({
      signedRevenue: 10000,
      collectedRevenue: 5000,
      refunds: 1000,
      netCollected: 4000,
      remaining: 6000,
      unpaid: 2000,
      collectionRate: 40,
    });
    expect(result.commission.estimated).toBe(480);
    expect(result.appointments).toMatchObject({
      planned: 2,
      honored: 1,
      noShows: 1,
    });
    expect(result.objections[0]).toEqual({ label: "Prix", count: 2 });
  });

  it("force un closer à consulter son propre espace", async () => {
    const prisma = prismaMock();
    prisma.user.findFirst.mockResolvedValue(closer);
    prisma.appointment.findMany.mockResolvedValue([]);
    prisma.closerReport.findMany.mockResolvedValue([]);
    prisma.contract.findMany.mockResolvedValue([]);
    prisma.lead.count.mockResolvedValue(0);
    prisma.closerLedgerEntry.findMany.mockResolvedValue([]);
    prisma.teamTask.findMany.mockResolvedValue([]);
    prisma.lead.findMany.mockResolvedValue([]);
    const service = new CloserSpaceService(prisma as never);

    await service.cockpit(
      { userId: closer.id, email: closer.email, role: Role.CLOSER },
      { closerId: "another-closer" },
    );

    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: closer.id }),
      }),
    );
  });
});
