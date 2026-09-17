import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs'; // ✅ aligne avec le seed
import { Role } from '@prisma/client';
import { AuthenticatedUser } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const normalized = (email || '').trim().toLowerCase(); // ✅ email normalisé
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
    });

    // messages volontairement génériques
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  signPayload(user: { id: string; email: string; role: Role }) {
    return this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
  }

  private publicUser(user: {
    id: string;
    email: string;
    role: Role;
    firstName: string;
    lastName: string | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    const access_token = this.signPayload(user);
    await this.prisma.user
      .update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      })
      .catch(() => {});
    return {
      access_token,
      user: this.publicUser(user),
    };
  }

  async startImpersonation(adminId: string, targetId: string) {
    const [admin, target] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: adminId, role: Role.ADMIN, isActive: true },
      }),
      this.prisma.user.findFirst({
        where: {
          id: targetId,
          role: { in: [Role.CLOSER, Role.SETTER] },
          isActive: true,
        },
      }),
    ]);

    if (!admin) throw new ForbiddenException('Administrateur introuvable');
    if (!target) {
      throw new NotFoundException('Closer ou setter actif introuvable');
    }

    const session = await this.prisma.impersonationSession.create({
      data: { actorId: admin.id, targetId: target.id },
    });
    const access_token = this.jwt.sign(
      {
        sub: target.id,
        email: target.email,
        role: target.role,
        actorId: admin.id,
        impersonationSessionId: session.id,
      },
      { expiresIn: '1h' },
    );

    return {
      access_token,
      user: this.publicUser(target),
      impersonation: {
        sessionId: session.id,
        actor: this.publicUser(admin),
      },
    };
  }

  async stopImpersonation(user: AuthenticatedUser) {
    const impersonation = user.impersonation;
    if (!impersonation) {
      throw new BadRequestException("Aucune session d'impersonation active");
    }

    const admin = await this.prisma.user.findFirst({
      where: {
        id: impersonation.actor.id,
        role: Role.ADMIN,
        isActive: true,
      },
    });
    if (!admin) throw new ForbiddenException('Administrateur introuvable');

    await this.prisma.impersonationSession.updateMany({
      where: {
        id: impersonation.sessionId,
        actorId: admin.id,
        targetId: user.userId,
        endedAt: null,
      },
      data: { endedAt: new Date() },
    });

    return {
      access_token: this.signPayload(admin),
      user: this.publicUser(admin),
    };
  }

  async adminCreateUser(
    adminId: string,
    data: {
      email: string;
      password: string;
      role: Role;
      firstName?: string;
      lastName?: string;
    },
  ) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== Role.ADMIN)
      throw new ForbiddenException('Only admin');

    const normalized = (data.email || '').trim().toLowerCase();
    const hash = await bcrypt.hash(data.password, 10);
    return this.prisma.user.create({
      data: {
        email: normalized,
        passwordHash: hash,
        role: data.role,
        isActive: true,
        firstName: data.firstName ?? 'User',
        lastName: data.lastName ?? null,
      },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
      },
    });
  }
}
