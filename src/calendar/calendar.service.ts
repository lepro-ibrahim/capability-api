import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  AppointmentType,
  DayOfWeek,
  Role,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationHubService } from '../integration-hub/integration-hub.service';
import {
  CreateBookingEventTypeDto,
  CreateCalendarAppointmentDto,
  PublicBookingDto,
  ReplaceAvailabilityDto,
  UpdateBookingEventTypeDto,
} from './dto/calendar.dto';

type AuthUser = { userId: string; email: string; role: Role };

const DAY_BY_INDEX: DayOfWeek[] = [
  DayOfWeek.SUN,
  DayOfWeek.MON,
  DayOfWeek.TUE,
  DayOfWeek.WED,
  DayOfWeek.THU,
  DayOfWeek.FRI,
  DayOfWeek.SAT,
];

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function parseTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return { hours, minutes };
}

function partsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(
    parts.map((part) => [part.type, Number(part.value)]),
  );
}

function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timeZone: string,
) {
  const wanted = Date.UTC(year, month - 1, day, hours, minutes, 0);
  let candidate = new Date(wanted);
  for (let i = 0; i < 2; i += 1) {
    const actual = partsInZone(candidate, timeZone);
    const rendered = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    candidate = new Date(candidate.getTime() + (wanted - rendered));
  }
  return candidate;
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationHubService,
  ) {}

  private targetUserId(user: AuthUser, requested?: string) {
    if (!requested || requested === user.userId) return user.userId;
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Vous pouvez uniquement gérer votre calendrier.',
      );
    }
    return requested;
  }

  async overview(
    user: AuthUser,
    from: Date,
    to: Date,
    requestedUserId?: string,
  ) {
    const userId = this.targetUserId(user, requestedUserId);
    const appointments = await this.prisma.appointment.findMany({
      where: { userId, scheduledAt: { gte: from, lte: to } },
      include: {
        lead: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        bookingEventType: {
          select: { id: true, name: true, color: true, durationMin: true },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });
    return { userId, appointments };
  }

  async create(user: AuthUser, dto: CreateCalendarAppointmentDto) {
    const userId = this.targetUserId(user, dto.userId);
    const startsAt = new Date(dto.startsAt);
    const endsAt = dto.endsAt
      ? new Date(dto.endsAt)
      : new Date(startsAt.getTime() + (dto.durationMin ?? 45) * 60_000);
    if (endsAt <= startsAt)
      throw new BadRequestException('La fin doit être après le début.');

    let leadId = dto.leadId;
    if (!leadId && dto.attendeeEmail) {
      const email = dto.attendeeEmail.trim().toLowerCase();
      const existing = await this.prisma.lead.findUnique({ where: { email } });
      if (existing) leadId = existing.id;
      else {
        const [firstName, ...lastName] = (dto.attendeeName ?? 'Prospect')
          .trim()
          .split(/\s+/);
        const lead = await this.prisma.lead.create({
          data: {
            firstName,
            lastName: lastName.join(' ') || null,
            email,
            phone: dto.attendeePhone,
            source: 'CALENDAR',
            ...(user.role === Role.SETTER
              ? { setterId: userId }
              : { closerId: userId }),
          },
        });
        leadId = lead.id;
      }
    }

    const eventType = dto.bookingEventTypeId
      ? await this.prisma.bookingEventType.findFirst({
          where: { id: dto.bookingEventTypeId, ownerId: userId },
        })
      : null;
    const appointment = await this.prisma.appointment.create({
      data: {
        provider: 'INTERNAL',
        externalId: randomUUID(),
        title: dto.title,
        description: dto.description,
        type: dto.type ?? eventType?.appointmentType ?? AppointmentType.RV1,
        status: AppointmentStatus.SCHEDULED,
        scheduledAt: startsAt,
        endAt: endsAt,
        timezone: dto.timezone ?? 'Europe/Paris',
        attendeeName: dto.attendeeName,
        attendeeEmail: dto.attendeeEmail?.trim().toLowerCase(),
        attendeePhone: dto.attendeePhone,
        userId,
        leadId,
        bookingEventTypeId: eventType?.id,
        meetingUrl: eventType?.locationValue,
      },
    });

    const externalEvent = {
      title: dto.title,
      description: dto.description,
      startsAt,
      endsAt,
      attendeeEmail: dto.attendeeEmail,
      attendeeName: dto.attendeeName,
      locationType: eventType?.locationType,
    };
    const zoom =
      eventType?.locationType === 'ZOOM'
        ? await this.integrations.createZoomMeeting(userId, externalEvent)
        : null;
    const google = await this.integrations.createGoogleCalendarEvent(userId, {
      ...externalEvent,
      meetingUrl: zoom?.meetingUrl,
    });
    const external = google ?? zoom;
    if (!external) return appointment;
    return this.prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        provider: google ? 'GOOGLE_CALENDAR' : 'ZOOM',
        externalId: external.externalId,
        meetingUrl: external.meetingUrl ?? appointment.meetingUrl,
      },
    });
  }

  async updateStatus(user: AuthUser, id: string, status: AppointmentStatus) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
    });
    if (!appointment) throw new NotFoundException('Rendez-vous introuvable.');
    if (appointment.userId !== user.userId && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Ce rendez-vous ne vous appartient pas.');
    }
    return this.prisma.appointment.update({ where: { id }, data: { status } });
  }

  async syncGoogle(
    user: AuthUser,
    from: Date,
    to: Date,
    requestedUserId?: string,
  ) {
    const userId = this.targetUserId(user, requestedUserId);
    return this.integrations.syncGoogleCalendar(userId, from, to);
  }

  async availability(user: AuthUser, requestedUserId?: string) {
    const userId = this.targetUserId(user, requestedUserId);
    const rules = await this.prisma.calendarAvailabilityRule.findMany({
      where: { userId },
      orderBy: [{ day: 'asc' }, { startTime: 'asc' }],
    });
    return { userId, timezone: rules[0]?.timezone ?? 'Europe/Paris', rules };
  }

  async replaceAvailability(user: AuthUser, dto: ReplaceAvailabilityDto) {
    const userId = this.targetUserId(user, dto.userId);
    for (const rule of dto.rules) {
      if (rule.startTime >= rule.endTime) {
        throw new BadRequestException(
          'Une disponibilité se termine après son début.',
        );
      }
    }
    await this.prisma.$transaction([
      this.prisma.calendarAvailabilityRule.deleteMany({ where: { userId } }),
      this.prisma.calendarAvailabilityRule.createMany({
        data: dto.rules.map((rule) => ({
          userId,
          timezone: dto.timezone,
          day: rule.day,
          startTime: rule.startTime,
          endTime: rule.endTime,
          isActive: rule.isActive ?? true,
        })),
      }),
    ]);
    return this.availability(user, userId);
  }

  async eventTypes(user: AuthUser, requestedUserId?: string) {
    const ownerId = this.targetUserId(user, requestedUserId);
    return this.prisma.bookingEventType.findMany({
      where: { ownerId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async createEventType(user: AuthUser, dto: CreateBookingEventTypeDto) {
    const owner = await this.prisma.user.findUnique({
      where: { id: user.userId },
    });
    if (!owner) throw new NotFoundException('Utilisateur introuvable.');
    const base = slugify(`${owner.firstName}-${dto.name}`) || randomUUID();
    let slug = base;
    let suffix = 1;
    while (await this.prisma.bookingEventType.findUnique({ where: { slug } })) {
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
    return this.prisma.bookingEventType.create({
      data: {
        ownerId: user.userId,
        name: dto.name,
        slug,
        description: dto.description,
        durationMin: dto.durationMin,
        color: dto.color ?? '#6366f1',
        appointmentType:
          dto.appointmentType ??
          (user.role === Role.SETTER
            ? AppointmentType.RV0
            : AppointmentType.RV1),
        locationType: dto.locationType ?? 'GOOGLE_MEET',
        locationValue: dto.locationValue,
        bufferBeforeMin: dto.bufferBeforeMin ?? 0,
        bufferAfterMin: dto.bufferAfterMin ?? 15,
        minNoticeHours: dto.minNoticeHours ?? 12,
        maxDaysAhead: dto.maxDaysAhead ?? 30,
      },
    });
  }

  async updateEventType(
    user: AuthUser,
    id: string,
    dto: UpdateBookingEventTypeDto,
  ) {
    const eventType = await this.prisma.bookingEventType.findUnique({
      where: { id },
    });
    if (!eventType)
      throw new NotFoundException('Type de rendez-vous introuvable.');
    if (eventType.ownerId !== user.userId && user.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Ce type de rendez-vous ne vous appartient pas.',
      );
    }
    return this.prisma.bookingEventType.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        durationMin: dto.durationMin,
        color: dto.color,
        appointmentType: dto.appointmentType,
        locationType: dto.locationType,
        locationValue: dto.locationValue,
        bufferBeforeMin: dto.bufferBeforeMin,
        bufferAfterMin: dto.bufferAfterMin,
        minNoticeHours: dto.minNoticeHours,
        maxDaysAhead: dto.maxDaysAhead,
        isActive: dto.isActive,
      },
    });
  }

  async publicEventType(slug: string) {
    const eventType = await this.prisma.bookingEventType.findFirst({
      where: { slug, isActive: true, owner: { isActive: true } },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!eventType)
      throw new NotFoundException('Lien de réservation introuvable.');
    return eventType;
  }

  async slots(slug: string, from: Date, to: Date) {
    const eventType = await this.publicEventType(slug);
    const maxTo = new Date(Date.now() + eventType.maxDaysAhead * 86_400_000);
    const safeFrom = new Date(
      Math.max(
        from.getTime(),
        Date.now() + eventType.minNoticeHours * 3_600_000,
      ),
    );
    const safeTo = new Date(Math.min(to.getTime(), maxTo.getTime()));
    if (safeTo <= safeFrom) return [];
    const rules = await this.prisma.calendarAvailabilityRule.findMany({
      where: { userId: eventType.ownerId, isActive: true },
    });
    const appointments = await this.prisma.appointment.findMany({
      where: {
        userId: eventType.ownerId,
        status: { not: AppointmentStatus.CANCELED },
        scheduledAt: { lt: safeTo },
        OR: [{ endAt: { gt: safeFrom } }, { endAt: null }],
      },
      select: { scheduledAt: true, endAt: true },
    });
    const output: string[] = [];
    const cursor = new Date(
      Date.UTC(
        safeFrom.getUTCFullYear(),
        safeFrom.getUTCMonth(),
        safeFrom.getUTCDate(),
      ),
    );
    const finalDay = new Date(
      Date.UTC(
        safeTo.getUTCFullYear(),
        safeTo.getUTCMonth(),
        safeTo.getUTCDate(),
      ),
    );
    while (cursor <= finalDay) {
      const dayRules = rules.filter(
        (rule) => rule.day === DAY_BY_INDEX[cursor.getUTCDay()],
      );
      for (const rule of dayRules) {
        const start = parseTime(rule.startTime);
        const end = parseTime(rule.endTime);
        let slot = zonedLocalToUtc(
          cursor.getUTCFullYear(),
          cursor.getUTCMonth() + 1,
          cursor.getUTCDate(),
          start.hours,
          start.minutes,
          rule.timezone,
        );
        const windowEnd = zonedLocalToUtc(
          cursor.getUTCFullYear(),
          cursor.getUTCMonth() + 1,
          cursor.getUTCDate(),
          end.hours,
          end.minutes,
          rule.timezone,
        );
        while (
          slot.getTime() + eventType.durationMin * 60_000 <=
          windowEnd.getTime()
        ) {
          const slotEnd = new Date(
            slot.getTime() + eventType.durationMin * 60_000,
          );
          const busy = appointments.some((item) => {
            const busyEnd =
              item.endAt ?? new Date(item.scheduledAt.getTime() + 60 * 60_000);
            return (
              slot.getTime() <
                busyEnd.getTime() + eventType.bufferAfterMin * 60_000 &&
              slotEnd.getTime() + eventType.bufferBeforeMin * 60_000 >
                item.scheduledAt.getTime()
            );
          });
          if (!busy && slot >= safeFrom && slotEnd <= safeTo)
            output.push(slot.toISOString());
          slot = new Date(slot.getTime() + eventType.durationMin * 60_000);
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return output.slice(0, 250);
  }

  async book(slug: string, dto: PublicBookingDto) {
    const eventType = await this.publicEventType(slug);
    const startsAt = new Date(dto.startsAt);
    const slots = await this.slots(
      slug,
      new Date(startsAt.getTime() - 60_000),
      new Date(startsAt.getTime() + eventType.durationMin * 60_000 + 60_000),
    );
    if (!slots.includes(startsAt.toISOString())) {
      throw new BadRequestException('Ce créneau n’est plus disponible.');
    }
    const owner = await this.prisma.user.findUnique({
      where: { id: eventType.ownerId },
    });
    if (!owner) throw new NotFoundException('Hôte introuvable.');
    return this.create(
      { userId: owner.id, email: owner.email, role: owner.role },
      {
        title: `${eventType.name} — ${dto.name}`,
        description: dto.notes,
        startsAt: startsAt.toISOString(),
        durationMin: eventType.durationMin,
        type: eventType.appointmentType,
        bookingEventTypeId: eventType.id,
        attendeeName: dto.name,
        attendeeEmail: dto.email,
        attendeePhone: dto.phone,
        timezone: 'Europe/Paris',
      },
    );
  }
}
