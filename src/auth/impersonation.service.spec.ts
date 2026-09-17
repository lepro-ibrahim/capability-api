import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { AuthenticatedUser } from './auth.types';

describe('AuthService impersonation', () => {
  const admin = {
    id: 'admin-1',
    email: 'admin@example.com',
    role: Role.ADMIN,
    firstName: 'Admin',
    lastName: 'Capability',
    isActive: true,
  };
  const closer = {
    id: 'closer-1',
    email: 'closer@example.com',
    role: Role.CLOSER,
    firstName: 'Alice',
    lastName: 'Closer',
    isActive: true,
  };

  const prisma = {
    user: { findFirst: jest.fn() },
    impersonationSession: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const jwt = { sign: jest.fn() };
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
    );
  });

  it('crée un jeton qui adopte le rôle et l’identité du closer', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce(admin)
      .mockResolvedValueOnce(closer);
    prisma.impersonationSession.create.mockResolvedValue({ id: 'session-1' });
    jwt.sign.mockReturnValue('impersonation-token');

    const result = await service.startImpersonation(admin.id, closer.id);

    expect(prisma.impersonationSession.create).toHaveBeenCalledWith({
      data: { actorId: admin.id, targetId: closer.id },
    });
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: closer.id,
        role: Role.CLOSER,
        actorId: admin.id,
        impersonationSessionId: 'session-1',
      }),
      { expiresIn: '1h' },
    );
    expect(result).toMatchObject({
      access_token: 'impersonation-token',
      user: { id: closer.id, role: Role.CLOSER },
      impersonation: { actor: { id: admin.id, role: Role.ADMIN } },
    });
  });

  it('refuse une cible qui n’est pas un closer ou un setter actif', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce(admin)
      .mockResolvedValueOnce(null);

    await expect(
      service.startImpersonation(admin.id, 'admin-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.impersonationSession.create).not.toHaveBeenCalled();
  });

  it('ferme la session et restitue un jeton administrateur', async () => {
    prisma.user.findFirst.mockResolvedValue(admin);
    prisma.impersonationSession.updateMany.mockResolvedValue({ count: 1 });
    jwt.sign.mockReturnValue('admin-token');
    const currentUser: AuthenticatedUser = {
      id: closer.id,
      sub: closer.id,
      userId: closer.id,
      email: closer.email,
      role: closer.role,
      impersonation: {
        sessionId: 'session-1',
        actor: {
          id: admin.id,
          email: admin.email,
          role: Role.ADMIN,
          firstName: admin.firstName,
          lastName: admin.lastName,
        },
      },
    };

    const result = await service.stopImpersonation(currentUser);

    expect(prisma.impersonationSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-1',
        actorId: admin.id,
        targetId: closer.id,
        endedAt: null,
      },
      // Jest expose ses matchers asymétriques comme `any`.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: { endedAt: expect.any(Date) },
    });
    expect(result).toMatchObject({
      access_token: 'admin-token',
      user: { id: admin.id, role: Role.ADMIN },
    });
  });

  it('refuse de quitter une session inexistante', async () => {
    const currentUser: AuthenticatedUser = {
      id: admin.id,
      sub: admin.id,
      userId: admin.id,
      email: admin.email,
      role: Role.ADMIN,
    };

    await expect(service.stopImpersonation(currentUser)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
