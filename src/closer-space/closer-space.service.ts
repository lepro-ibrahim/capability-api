import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AppointmentStatus,
  AppointmentType,
  CloserLedgerStatus,
  CloserLedgerType,
  Role,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateCloserLedgerEntryDto,
  CreateCloserReportDto,
  UpdateCloserSettingsDto,
} from "./dto/closer-space.dto";

export type RequestUser = {
  userId: string;
  email: string;
  role: Role;
};

const round = (value: number, precision = 2) => {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

function normalizeDate(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException("Période invalide");
  }
  return parsed;
}

@Injectable()
export class CloserSpaceService {
  constructor(private readonly prisma: PrismaService) {}

  async listClosers(user: RequestUser) {
    const where =
      user.role === Role.CLOSER
        ? { id: user.userId, role: Role.CLOSER, isActive: true }
        : { role: Role.CLOSER, isActive: true };
    return this.prisma.user.findMany({
      where,
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        closerSettings: {
          select: { commissionRate: true, monthlyTarget: true },
        },
      },
    });
  }

  private async resolveCloser(user: RequestUser, requestedCloserId?: string) {
    if (user.role !== Role.ADMIN && user.role !== Role.CLOSER) {
      throw new ForbiddenException(
        "Espace réservé aux closers et administrateurs",
      );
    }
    const closerId =
      user.role === Role.CLOSER ? user.userId : requestedCloserId;
    const closer = closerId
      ? await this.prisma.user.findFirst({
          where: { id: closerId, role: Role.CLOSER, isActive: true },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            closerSettings: true,
          },
        })
      : await this.prisma.user.findFirst({
          where: { role: Role.CLOSER, isActive: true },
          orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            closerSettings: true,
          },
        });
    if (!closer) throw new NotFoundException("Closer introuvable");
    return closer;
  }

  async cockpit(
    user: RequestUser,
    params: { closerId?: string; from?: string; to?: string },
  ) {
    const closer = await this.resolveCloser(user, params.closerId);
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
    defaultFrom.setUTCHours(0, 0, 0, 0);
    const defaultTo = new Date(now);
    defaultTo.setUTCHours(23, 59, 59, 999);
    const from = normalizeDate(params.from, defaultFrom);
    const to = normalizeDate(params.to, defaultTo);
    if (from > to)
      throw new BadRequestException("La date de début dépasse la date de fin");

    const range = { gte: from, lte: to };
    const [
      appointments,
      reports,
      contracts,
      wonLeads,
      ledger,
      upcoming,
      tasks,
      leads,
    ] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          userId: closer.id,
          type: { in: [AppointmentType.RV1, AppointmentType.RV2] },
          scheduledAt: range,
        },
        select: { id: true, type: true, status: true, scheduledAt: true },
      }),
      this.prisma.closerReport.findMany({
        where: { closerId: closer.id, reportedAt: range },
        select: {
          leadId: true,
          proposalMade: true,
          objections: true,
          outcome: true,
          reportedAt: true,
        },
      }),
      this.prisma.contract.findMany({
        where: { userId: closer.id, createdAt: range },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          total: true,
          deposit: true,
          createdAt: true,
          leadId: true,
          lead: { select: { firstName: true, lastName: true, email: true } },
          ledgerEntries: {
            select: { type: true, status: true, amount: true },
          },
        },
      }),
      this.prisma.lead.findMany({
        where: { closerId: closer.id, stage: "WON", stageUpdatedAt: range },
        select: { id: true },
      }),
      this.prisma.closerLedgerEntry.findMany({
        where: { closerId: closer.id, occurredAt: range },
        orderBy: { occurredAt: "desc" },
        select: {
          id: true,
          type: true,
          status: true,
          amount: true,
          label: true,
          occurredAt: true,
          dueAt: true,
          contractId: true,
          lead: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          userId: closer.id,
          type: { in: [AppointmentType.RV1, AppointmentType.RV2] },
          scheduledAt: { gte: now },
        },
        take: 6,
        orderBy: { scheduledAt: "asc" },
        select: {
          id: true,
          type: true,
          status: true,
          scheduledAt: true,
          lead: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.teamTask.findMany({
        where: { assigneeId: closer.id, status: "TODO" },
        take: 6,
        orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          description: true,
          priority: true,
          dueAt: true,
          leadId: true,
        },
      }),
      this.prisma.lead.findMany({
        where: { closerId: closer.id },
        take: 50,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          stage: true,
          appointments: {
            where: {
              userId: closer.id,
              type: { in: [AppointmentType.RV1, AppointmentType.RV2] },
            },
            orderBy: { scheduledAt: "desc" },
            take: 1,
            select: { id: true, scheduledAt: true, status: true, type: true },
          },
        },
      }),
    ]);

    const appointmentCount = (status: AppointmentStatus) =>
      appointments.filter((item) => item.status === status).length;
    const honored = appointmentCount(AppointmentStatus.HONORED);
    const signedRevenue = contracts.reduce((sum, item) => sum + item.total, 0);
    const contractLedger = contracts.flatMap(
      (contract) => contract.ledgerEntries,
    );
    const paid = contractLedger
      .filter(
        (item) =>
          item.type === CloserLedgerType.PAYMENT &&
          item.status === CloserLedgerStatus.PAID,
      )
      .reduce((sum, item) => sum + item.amount, 0);
    const refunds = contractLedger
      .filter(
        (item) =>
          item.type === CloserLedgerType.REFUND &&
          item.status === CloserLedgerStatus.PAID,
      )
      .reduce((sum, item) => sum + item.amount, 0);
    const unpaid = contractLedger
      .filter(
        (item) =>
          item.type === CloserLedgerType.PAYMENT &&
          (item.status === CloserLedgerStatus.OVERDUE ||
            item.status === CloserLedgerStatus.FAILED),
      )
      .reduce((sum, item) => sum + item.amount, 0);
    const netCollected = paid - refunds;
    const remaining = Math.max(signedRevenue - netCollected, 0);
    const commissionRate = closer.closerSettings?.commissionRate ?? 10;
    const saleLeadIds = new Set(wonLeads.map((lead) => lead.id));
    for (const report of reports) {
      if (report.outcome === "WON") saleLeadIds.add(report.leadId);
    }
    const objectionMap = new Map<string, number>();
    for (const report of reports) {
      for (const objection of report.objections) {
        const normalized = objection.trim();
        if (normalized) {
          objectionMap.set(normalized, (objectionMap.get(normalized) ?? 0) + 1);
        }
      }
    }
    const objections = [...objectionMap.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 8);

    const contractRows = contracts.map((contract) => {
      const collected = contract.ledgerEntries
        .filter(
          (entry) =>
            entry.type === CloserLedgerType.PAYMENT &&
            entry.status === CloserLedgerStatus.PAID,
        )
        .reduce((sum, entry) => sum + entry.amount, 0);
      const refunded = contract.ledgerEntries
        .filter(
          (entry) =>
            entry.type === CloserLedgerType.REFUND &&
            entry.status === CloserLedgerStatus.PAID,
        )
        .reduce((sum, entry) => sum + entry.amount, 0);
      return {
        id: contract.id,
        leadId: contract.leadId,
        prospect: contract.lead,
        signedAt: contract.createdAt,
        signed: round(contract.total),
        collected: round(collected),
        refunded: round(refunded),
        remaining: round(Math.max(contract.total - collected + refunded, 0)),
      };
    });

    return {
      closer: {
        id: closer.id,
        firstName: closer.firstName,
        lastName: closer.lastName,
        email: closer.email,
      },
      period: { from, to },
      appointments: {
        planned: appointments.length,
        honored,
        noShows: appointmentCount(AppointmentStatus.NO_SHOW),
        postponed: appointmentCount(AppointmentStatus.POSTPONED),
        canceled: appointmentCount(AppointmentStatus.CANCELED),
      },
      sales: {
        proposals: reports.filter((item) => item.proposalMade).length,
        contractsSigned: contracts.length,
        sales: saleLeadIds.size,
        averageBasket: contracts.length
          ? round(signedRevenue / contracts.length)
          : 0,
        closingRate: honored ? round((saleLeadIds.size / honored) * 100, 1) : 0,
      },
      cash: {
        signedRevenue: round(signedRevenue),
        collectedRevenue: round(paid),
        refunds: round(refunds),
        netCollected: round(netCollected),
        remaining: round(remaining),
        unpaid: round(unpaid),
        collectionRate: signedRevenue
          ? round((netCollected / signedRevenue) * 100, 1)
          : 0,
      },
      commission: {
        rate: commissionRate,
        estimated: round(Math.max(netCollected, 0) * (commissionRate / 100)),
        basis: "NET_COLLECTED",
      },
      objections,
      contracts: contractRows,
      ledger,
      upcoming,
      tasks: tasks.map((task) => ({
        ...task,
        overdue: Boolean(task.dueAt && task.dueAt < now),
      })),
      leads,
    };
  }

  async createReport(user: RequestUser, dto: CreateCloserReportDto) {
    const closer = await this.resolveCloser(user, dto.closerId);
    const lead = await this.prisma.lead.findFirst({
      where: { id: dto.leadId, closerId: closer.id },
      select: { id: true },
    });
    if (!lead)
      throw new BadRequestException(
        "Ce prospect n’est pas assigné à ce closer",
      );
    if (dto.appointmentId) {
      const appointment = await this.prisma.appointment.findFirst({
        where: {
          id: dto.appointmentId,
          userId: closer.id,
          leadId: dto.leadId,
        },
        select: { id: true },
      });
      if (!appointment)
        throw new BadRequestException("Rendez-vous incompatible");
    }
    const data = {
      closerId: closer.id,
      leadId: dto.leadId,
      appointmentId: dto.appointmentId,
      outcome: dto.outcome,
      proposalMade: dto.proposalMade,
      objections: (dto.objections ?? [])
        .map((item) => item.trim())
        .filter(Boolean),
      notes: dto.notes?.trim() || null,
      reportedAt: dto.reportedAt ? new Date(dto.reportedAt) : new Date(),
    };
    return dto.appointmentId
      ? this.prisma.closerReport.upsert({
          where: { appointmentId: dto.appointmentId },
          create: data,
          update: data,
        })
      : this.prisma.closerReport.create({ data });
  }

  async createLedgerEntry(dto: CreateCloserLedgerEntryDto) {
    const closer = await this.prisma.user.findFirst({
      where: { id: dto.closerId, role: Role.CLOSER, isActive: true },
      select: { id: true },
    });
    if (!closer) throw new NotFoundException("Closer introuvable");
    const contract = await this.prisma.contract.findFirst({
      where: { id: dto.contractId, userId: dto.closerId },
      select: { id: true, leadId: true },
    });
    if (!contract) throw new BadRequestException("Contrat incompatible");
    if (dto.leadId && contract.leadId && dto.leadId !== contract.leadId) {
      throw new BadRequestException("Prospect incompatible avec le contrat");
    }
    return this.prisma.closerLedgerEntry.create({
      data: {
        closerId: dto.closerId,
        leadId: dto.leadId,
        contractId: dto.contractId,
        type: dto.type,
        status: dto.status,
        amount: dto.amount,
        label: dto.label?.trim() || null,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        paidAt:
          dto.paidAt || dto.status === CloserLedgerStatus.PAID
            ? new Date(dto.paidAt ?? dto.occurredAt ?? Date.now())
            : null,
      },
    });
  }

  async updateSettings(closerId: string, dto: UpdateCloserSettingsDto) {
    const closer = await this.prisma.user.findFirst({
      where: { id: closerId, role: Role.CLOSER, isActive: true },
      select: { id: true },
    });
    if (!closer) throw new NotFoundException("Closer introuvable");
    return this.prisma.closerSettings.upsert({
      where: { userId: closerId },
      create: {
        userId: closerId,
        commissionRate: dto.commissionRate,
        monthlyTarget: dto.monthlyTarget,
      },
      update: {
        commissionRate: dto.commissionRate,
        monthlyTarget: dto.monthlyTarget,
      },
    });
  }
}
