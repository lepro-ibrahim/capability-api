import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  AppointmentType,
  Prisma,
  Role,
} from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConnectIntegrationDto,
  ConnectionProvider,
} from './dto/integration-hub.dto';
import { IntegrationCryptoService } from './integration-crypto.service';

type AuthUser = { userId: string; email: string; role: Role };

type ExternalCalendarEvent = {
  title: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  attendeeEmail?: string;
  attendeeName?: string;
  locationType?: string;
  meetingUrl?: string;
};

const CATALOG = [
  {
    provider: 'FATHOM',
    name: 'Fathom',
    category: 'COACHING',
    description:
      'Transcriptions, résumés et appels pour le coaching commercial.',
    authType: 'API_KEY',
    available: true,
  },
  {
    provider: 'GOOGLE_CALENDAR',
    name: 'Google Agenda',
    category: 'CALENDAR',
    description:
      'Synchronisez les rendez-vous et évitez les doubles réservations.',
    authType: 'OAUTH',
    available: true,
  },
  {
    provider: 'ZOOM',
    name: 'Zoom',
    category: 'MEETING',
    description: 'Créez les salles Zoom automatiquement pour les rendez-vous.',
    authType: 'OAUTH',
    available: true,
  },
  {
    provider: 'SYSTEME_IO',
    name: 'Systeme.io',
    category: 'CRM',
    description: 'Synchronisez contacts, formulaires, ventes et inscriptions.',
    authType: 'API_KEY',
    available: true,
  },
  {
    provider: 'ZAPIER',
    name: 'Zapier',
    category: 'AUTOMATION',
    description: 'Envoyez et recevez des événements avec vos Zaps.',
    authType: 'WEBHOOK',
    available: true,
  },
  {
    provider: 'MAKE',
    name: 'Make',
    category: 'AUTOMATION',
    description: 'Branchez vos scénarios Make sur les événements Capability.',
    authType: 'WEBHOOK',
    available: true,
  },
  {
    provider: 'GOHIGHLEVEL',
    name: 'GoHighLevel',
    category: 'CRM',
    description:
      'Centralisez prospects, opportunités et changements de pipeline.',
    authType: 'WEBHOOK',
    available: true,
  },
  {
    provider: 'CALENDLY',
    name: 'Calendly',
    category: 'CALENDAR',
    description: 'Importez les réservations Calendly dans votre agenda unifié.',
    authType: 'OAUTH',
    available: false,
  },
  {
    provider: 'STRIPE',
    name: 'Stripe',
    category: 'PAYMENT',
    description: 'Rapprochez paiements, impayés et remboursements.',
    authType: 'OAUTH',
    available: false,
  },
] as const;

function providerCategory(provider: string) {
  return (
    CATALOG.find((item) => item.provider === provider)?.category ?? 'OTHER'
  );
}

function publicApiBaseUrl() {
  return (process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
}

function frontendBaseUrl() {
  return (
    process.env.FRONTEND_URL ??
    process.env.CORS_ORIGIN?.split(',')[0] ??
    'http://localhost:3001'
  ).replace(/\/$/, '');
}

@Injectable()
export class IntegrationHubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: IntegrationCryptoService,
  ) {}

  catalog() {
    return CATALOG.map((item) => ({
      ...item,
      configured:
        item.authType !== 'OAUTH' ||
        (item.provider === 'GOOGLE_CALENDAR'
          ? Boolean(
              process.env.GOOGLE_CALENDAR_CLIENT_ID &&
              process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
            )
          : item.provider === 'ZOOM'
            ? Boolean(
                process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET,
              )
            : false),
    }));
  }

  private visibleWhere(user: AuthUser): Prisma.IntegrationConnectionWhereInput {
    if (user.role === Role.ADMIN) return {};
    return {
      OR: [{ userId: user.userId }, { scope: 'WORKSPACE' }],
    };
  }

  async list(user: AuthUser) {
    const connections = await this.prisma.integrationConnection.findMany({
      where: this.visibleWhere(user),
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
    return connections.map((connection) => this.toPublicConnection(connection));
  }

  private toPublicConnection<
    T extends {
      secretEncrypted: string | null;
      refreshTokenEncrypted: string | null;
      webhookKey: string;
    },
  >(connection: T) {
    const { secretEncrypted, refreshTokenEncrypted, ...safe } = connection;
    return {
      ...safe,
      hasSecret: Boolean(secretEncrypted || refreshTokenEncrypted),
      inboundWebhookUrl: publicApiBaseUrl()
        ? `${publicApiBaseUrl()}/integration-hub/webhooks/${connection.webhookKey}`
        : `/integration-hub/webhooks/${connection.webhookKey}`,
    };
  }

  async connect(user: AuthUser, dto: ConnectIntegrationDto) {
    if (dto.scope === 'WORKSPACE' && user.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Seul un administrateur peut créer une connexion d’équipe.',
      );
    }
    if (['GOOGLE_CALENDAR', 'ZOOM'].includes(dto.provider)) {
      throw new BadRequestException(
        'Utilisez la connexion OAuth pour ce fournisseur.',
      );
    }
    if (
      ['FATHOM', 'SYSTEME_IO'].includes(dto.provider) &&
      !dto.secret?.trim()
    ) {
      throw new BadRequestException('Une clé API est requise.');
    }

    const encrypted = dto.secret?.trim()
      ? this.crypto.encrypt(dto.secret.trim())
      : undefined;
    const config = {
      ...(dto.config ?? {}),
      ...(dto.outboundWebhookUrl
        ? { outboundWebhookUrl: dto.outboundWebhookUrl }
        : {}),
    } as Prisma.InputJsonValue;

    const connection = await this.prisma.integrationConnection.upsert({
      where: {
        userId_provider: { userId: user.userId, provider: dto.provider },
      },
      create: {
        userId: user.userId,
        provider: dto.provider,
        category: providerCategory(dto.provider),
        scope: dto.scope ?? 'USER',
        status: 'CONNECTED',
        displayName: dto.displayName?.trim() || null,
        accountEmail: dto.accountEmail?.trim().toLowerCase() || null,
        secretEncrypted: encrypted,
        config,
        webhookKey: randomBytes(24).toString('base64url'),
      },
      update: {
        scope: dto.scope ?? 'USER',
        status: 'CONNECTED',
        displayName: dto.displayName?.trim() || null,
        accountEmail: dto.accountEmail?.trim().toLowerCase() || null,
        ...(encrypted ? { secretEncrypted: encrypted } : {}),
        config,
        lastError: null,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
    return this.toPublicConnection(connection);
  }

  async disconnect(user: AuthUser, id: string) {
    const connection = await this.prisma.integrationConnection.findFirst({
      where: { id, ...this.visibleWhere(user) },
    });
    if (!connection) throw new NotFoundException('Connexion introuvable.');
    if (connection.userId !== user.userId && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Cette connexion ne vous appartient pas.');
    }
    await this.prisma.integrationConnection.delete({ where: { id } });
    return { ok: true };
  }

  async test(user: AuthUser, id: string) {
    const connection = await this.prisma.integrationConnection.findFirst({
      where: { id, ...this.visibleWhere(user) },
    });
    if (!connection) throw new NotFoundException('Connexion introuvable.');
    if (connection.userId !== user.userId && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Cette connexion ne vous appartient pas.');
    }

    try {
      if (connection.provider === 'FATHOM') {
        if (!connection.secretEncrypted)
          throw new BadRequestException('Clé Fathom absente.');
        const response = await fetch(
          'https://api.fathom.ai/external/v1/meetings?limit=1',
          {
            headers: {
              'X-Api-Key': this.crypto.decrypt(connection.secretEncrypted),
            },
          },
        );
        if (!response.ok)
          throw new Error(`Fathom a répondu ${response.status}`);
      } else {
        const config = (connection.config ?? {}) as Record<string, unknown>;
        const url =
          typeof config.outboundWebhookUrl === 'string'
            ? config.outboundWebhookUrl
            : null;
        if (url) {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              event: 'capability.connection.test',
              sentAt: new Date().toISOString(),
              provider: connection.provider,
            }),
          });
          if (!response.ok)
            throw new Error(`Le webhook a répondu ${response.status}`);
        }
      }
      await this.prisma.integrationConnection.update({
        where: { id },
        data: {
          status: 'CONNECTED',
          lastError: null,
          lastSyncedAt: new Date(),
        },
      });
      return { ok: true, testedAt: new Date().toISOString() };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Test impossible';
      await this.prisma.integrationConnection.update({
        where: { id },
        data: { status: 'ERROR', lastError: message },
      });
      throw new BadGatewayException(message);
    }
  }

  async oauthStart(user: AuthUser, providerRaw: string) {
    const provider = providerRaw.toUpperCase() as ConnectionProvider;
    const state = randomBytes(32).toString('base64url');
    const redirectUri = `${publicApiBaseUrl()}/integration-hub/oauth/${provider.toLowerCase()}/callback`;
    if (!publicApiBaseUrl())
      throw new ServiceUnavailableException('PUBLIC_BASE_URL est manquante.');

    let url: URL;
    if (provider === 'GOOGLE_CALENDAR') {
      if (
        !process.env.GOOGLE_CALENDAR_CLIENT_ID ||
        !process.env.GOOGLE_CALENDAR_CLIENT_SECRET
      ) {
        throw new ServiceUnavailableException(
          'Google Agenda doit être configuré par un administrateur.',
        );
      }
      url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', process.env.GOOGLE_CALENDAR_CLIENT_ID);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
      url.searchParams.set(
        'scope',
        'openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',
      );
    } else if (provider === 'ZOOM') {
      if (!process.env.ZOOM_CLIENT_ID || !process.env.ZOOM_CLIENT_SECRET) {
        throw new ServiceUnavailableException(
          'Zoom doit être configuré par un administrateur.',
        );
      }
      url = new URL('https://zoom.us/oauth/authorize');
      url.searchParams.set('client_id', process.env.ZOOM_CLIENT_ID);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
    } else {
      throw new BadRequestException(
        'Ce fournisseur ne prend pas en charge OAuth.',
      );
    }
    url.searchParams.set('state', state);
    await this.prisma.integrationOAuthState.create({
      data: {
        provider,
        state,
        userId: user.userId,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    return { url: url.toString() };
  }

  async oauthCallback(providerRaw: string, code: string, state: string) {
    const provider = providerRaw.toUpperCase() as ConnectionProvider;
    const saved = await this.prisma.integrationOAuthState.findUnique({
      where: { state },
    });
    if (!saved || saved.provider !== provider || saved.expiresAt < new Date()) {
      throw new BadRequestException('La demande de connexion a expiré.');
    }
    await this.prisma.integrationOAuthState.delete({ where: { id: saved.id } });
    const redirectUri = `${publicApiBaseUrl()}/integration-hub/oauth/${provider.toLowerCase()}/callback`;

    const token =
      provider === 'GOOGLE_CALENDAR'
        ? await this.exchangeGoogleCode(code, redirectUri)
        : await this.exchangeZoomCode(code, redirectUri);
    const profile =
      provider === 'GOOGLE_CALENDAR'
        ? await this.googleProfile(token.access_token)
        : await this.zoomProfile(token.access_token);

    await this.prisma.integrationConnection.upsert({
      where: { userId_provider: { userId: saved.userId, provider } },
      create: {
        userId: saved.userId,
        provider,
        category: providerCategory(provider),
        scope: 'USER',
        status: 'CONNECTED',
        displayName: profile.name,
        accountEmail: profile.email,
        externalAccountId: profile.id,
        secretEncrypted: this.crypto.encrypt(token.access_token),
        refreshTokenEncrypted: token.refresh_token
          ? this.crypto.encrypt(token.refresh_token)
          : null,
        tokenExpiresAt: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000)
          : null,
        webhookKey: randomBytes(24).toString('base64url'),
      },
      update: {
        status: 'CONNECTED',
        displayName: profile.name,
        accountEmail: profile.email,
        externalAccountId: profile.id,
        secretEncrypted: this.crypto.encrypt(token.access_token),
        ...(token.refresh_token
          ? { refreshTokenEncrypted: this.crypto.encrypt(token.refresh_token) }
          : {}),
        tokenExpiresAt: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000)
          : null,
        lastError: null,
      },
    });
    return `${frontendBaseUrl()}/integrations?connected=${provider.toLowerCase()}`;
  }

  private async exchangeGoogleCode(code: string, redirectUri: string) {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!response.ok)
      throw new BadGatewayException('Google a refusé la connexion.');
    return response.json() as Promise<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    }>;
  }

  private async exchangeZoomCode(code: string, redirectUri: string) {
    const basic = Buffer.from(
      `${process.env.ZOOM_CLIENT_ID ?? ''}:${process.env.ZOOM_CLIENT_SECRET ?? ''}`,
    ).toString('base64');
    const response = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        authorization: `Basic ${basic}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!response.ok)
      throw new BadGatewayException('Zoom a refusé la connexion.');
    return response.json() as Promise<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    }>;
  }

  private async googleProfile(accessToken: string) {
    const response = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: { authorization: `Bearer ${accessToken}` },
      },
    );
    if (!response.ok)
      throw new BadGatewayException('Profil Google inaccessible.');
    const data = (await response.json()) as {
      id: string;
      email: string;
      name?: string;
    };
    return { id: data.id, email: data.email, name: data.name ?? data.email };
  }

  private async zoomProfile(accessToken: string) {
    const response = await fetch('https://api.zoom.us/v2/users/me', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok)
      throw new BadGatewayException('Profil Zoom inaccessible.');
    const data = (await response.json()) as {
      id: string;
      email: string;
      first_name?: string;
      last_name?: string;
    };
    return {
      id: data.id,
      email: data.email,
      name:
        [data.first_name, data.last_name].filter(Boolean).join(' ') ||
        data.email,
    };
  }

  private async googleAccessToken(connection: {
    id: string;
    secretEncrypted: string | null;
    refreshTokenEncrypted: string | null;
    tokenExpiresAt: Date | null;
  }) {
    if (
      connection.secretEncrypted &&
      (!connection.tokenExpiresAt ||
        connection.tokenExpiresAt.getTime() > Date.now() + 60_000)
    ) {
      return this.crypto.decrypt(connection.secretEncrypted);
    }
    if (!connection.refreshTokenEncrypted)
      throw new ServiceUnavailableException('Reconnectez Google Agenda.');
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? '',
        refresh_token: this.crypto.decrypt(connection.refreshTokenEncrypted),
        grant_type: 'refresh_token',
      }),
    });
    if (!response.ok)
      throw new ServiceUnavailableException('Reconnectez Google Agenda.');
    const token = (await response.json()) as {
      access_token: string;
      expires_in?: number;
    };
    await this.prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        secretEncrypted: this.crypto.encrypt(token.access_token),
        tokenExpiresAt: new Date(
          Date.now() + (token.expires_in ?? 3600) * 1000,
        ),
      },
    });
    return token.access_token;
  }

  private async zoomAccessToken(connection: {
    id: string;
    secretEncrypted: string | null;
    refreshTokenEncrypted: string | null;
    tokenExpiresAt: Date | null;
  }) {
    if (
      connection.secretEncrypted &&
      (!connection.tokenExpiresAt ||
        connection.tokenExpiresAt.getTime() > Date.now() + 60_000)
    ) {
      return this.crypto.decrypt(connection.secretEncrypted);
    }
    if (!connection.refreshTokenEncrypted) {
      throw new ServiceUnavailableException('Reconnectez Zoom.');
    }
    const basic = Buffer.from(
      `${process.env.ZOOM_CLIENT_ID ?? ''}:${process.env.ZOOM_CLIENT_SECRET ?? ''}`,
    ).toString('base64');
    const response = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        authorization: `Basic ${basic}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.crypto.decrypt(connection.refreshTokenEncrypted),
      }),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException('Reconnectez Zoom.');
    }
    const token = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    await this.prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        secretEncrypted: this.crypto.encrypt(token.access_token),
        ...(token.refresh_token
          ? {
              refreshTokenEncrypted: this.crypto.encrypt(token.refresh_token),
            }
          : {}),
        tokenExpiresAt: new Date(
          Date.now() + (token.expires_in ?? 3600) * 1000,
        ),
      },
    });
    return token.access_token;
  }

  async syncGoogleCalendar(userId: string, from: Date, to: Date) {
    const connection = await this.prisma.integrationConnection.findUnique({
      where: { userId_provider: { userId, provider: 'GOOGLE_CALENDAR' } },
    });
    if (!connection)
      throw new NotFoundException('Google Agenda n’est pas connecté.');
    const accessToken = await this.googleAccessToken(connection);
    const url = new URL(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    );
    url.searchParams.set('timeMin', from.toISOString());
    url.searchParams.set('timeMax', to.toISOString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '2500');
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok)
      throw new BadGatewayException(
        'Synchronisation Google Agenda impossible.',
      );
    const payload = (await response.json()) as {
      items?: Array<{
        id: string;
        status?: string;
        summary?: string;
        description?: string;
        start?: { dateTime?: string; date?: string; timeZone?: string };
        end?: { dateTime?: string; date?: string };
        hangoutLink?: string;
        attendees?: Array<{
          email?: string;
          displayName?: string;
          self?: boolean;
        }>;
      }>;
    };
    let synced = 0;
    for (const event of payload.items ?? []) {
      const startRaw = event.start?.dateTime ?? event.start?.date;
      if (!event.id || !startRaw) continue;
      const attendee = event.attendees?.find((item) => !item.self);
      await this.prisma.appointment.upsert({
        where: {
          provider_externalId: {
            provider: 'GOOGLE_CALENDAR',
            externalId: event.id,
          },
        },
        create: {
          provider: 'GOOGLE_CALENDAR',
          externalId: event.id,
          title: event.summary ?? 'Rendez-vous Google Agenda',
          description: event.description,
          type: AppointmentType.RV1,
          status:
            event.status === 'cancelled'
              ? AppointmentStatus.CANCELED
              : AppointmentStatus.SCHEDULED,
          scheduledAt: new Date(startRaw),
          endAt:
            event.end?.dateTime || event.end?.date
              ? new Date(event.end.dateTime ?? event.end.date ?? startRaw)
              : null,
          timezone: event.start?.timeZone ?? 'Europe/Paris',
          attendeeEmail: attendee?.email,
          attendeeName: attendee?.displayName,
          meetingUrl: event.hangoutLink,
          userId,
        },
        update: {
          title: event.summary ?? 'Rendez-vous Google Agenda',
          description: event.description,
          status:
            event.status === 'cancelled'
              ? AppointmentStatus.CANCELED
              : AppointmentStatus.SCHEDULED,
          scheduledAt: new Date(startRaw),
          endAt:
            event.end?.dateTime || event.end?.date
              ? new Date(event.end.dateTime ?? event.end.date ?? startRaw)
              : null,
          timezone: event.start?.timeZone ?? 'Europe/Paris',
          attendeeEmail: attendee?.email,
          attendeeName: attendee?.displayName,
          meetingUrl: event.hangoutLink,
        },
      });
      synced += 1;
    }
    await this.prisma.integrationConnection.update({
      where: { id: connection.id },
      data: { status: 'CONNECTED', lastError: null, lastSyncedAt: new Date() },
    });
    return { ok: true, synced };
  }

  async createGoogleCalendarEvent(
    userId: string,
    event: ExternalCalendarEvent,
  ) {
    const connection = await this.prisma.integrationConnection.findUnique({
      where: { userId_provider: { userId, provider: 'GOOGLE_CALENDAR' } },
    });
    if (!connection) return null;
    const accessToken = await this.googleAccessToken(connection);
    const conference = event.locationType === 'GOOGLE_MEET';
    const url = new URL(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    );
    if (conference) url.searchParams.set('conferenceDataVersion', '1');
    if (event.attendeeEmail) url.searchParams.set('sendUpdates', 'all');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        summary: event.title,
        description: event.description,
        location: event.meetingUrl,
        start: { dateTime: event.startsAt.toISOString() },
        end: { dateTime: event.endsAt.toISOString() },
        attendees: event.attendeeEmail
          ? [{ email: event.attendeeEmail, displayName: event.attendeeName }]
          : undefined,
        conferenceData: conference
          ? {
              createRequest: {
                requestId: randomUUID(),
                conferenceSolutionKey: { type: 'hangoutsMeet' },
              },
            }
          : undefined,
      }),
    });
    if (!response.ok) return null;
    const created = (await response.json()) as {
      id: string;
      hangoutLink?: string;
      htmlLink?: string;
    };
    return {
      externalId: created.id,
      meetingUrl: event.meetingUrl ?? created.hangoutLink ?? created.htmlLink,
    };
  }

  async createZoomMeeting(userId: string, event: ExternalCalendarEvent) {
    const connection = await this.prisma.integrationConnection.findUnique({
      where: { userId_provider: { userId, provider: 'ZOOM' } },
    });
    if (!connection) return null;
    const accessToken = await this.zoomAccessToken(connection);
    const duration = Math.max(
      1,
      Math.round((event.endsAt.getTime() - event.startsAt.getTime()) / 60_000),
    );
    const response = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        topic: event.title,
        type: 2,
        start_time: event.startsAt.toISOString(),
        duration,
        timezone: 'UTC',
        agenda: event.description,
        settings: {
          join_before_host: false,
          waiting_room: true,
          participant_video: false,
        },
      }),
    });
    if (!response.ok) return null;
    const created = (await response.json()) as {
      id: number | string;
      join_url?: string;
    };
    await this.prisma.integrationConnection.update({
      where: { id: connection.id },
      data: { status: 'CONNECTED', lastError: null, lastSyncedAt: new Date() },
    });
    return {
      externalId: String(created.id),
      meetingUrl: created.join_url,
    };
  }

  async receiveWebhook(webhookKey: string, payload: unknown) {
    const connection = await this.prisma.integrationConnection.findUnique({
      where: { webhookKey },
    });
    if (!connection) throw new NotFoundException('Webhook inconnu.');
    await this.prisma.webhookEvent.create({
      data: {
        externalId: `integration:${connection.id}:${randomUUID()}`,
        type: `${connection.provider}.INBOUND`,
        payloadHash: randomUUID(),
        status: 'RECEIVED',
        processedAt: new Date(),
      },
    });
    await this.prisma.integrationConnection.update({
      where: { id: connection.id },
      data: { lastSyncedAt: new Date(), status: 'CONNECTED', lastError: null },
    });
    return { ok: true, received: Boolean(payload) };
  }
}
