import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../prisma/prisma.service';
import { getJwtSecret } from './jwt.config';
import { AccessTokenPayload, AuthenticatedUser } from './auth.types';
import { Role } from '@prisma/client';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false, // on respecte exp
      secretOrKey: getJwtSecret(),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    if (!payload.sub) throw new UnauthorizedException('Invalid credentials');
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        firstName: true,
        lastName: true,
      },
    });
    if (!user?.isActive) throw new UnauthorizedException('Invalid credentials');

    if (payload.actorId || payload.impersonationSessionId) {
      if (!payload.actorId || !payload.impersonationSessionId) {
        throw new UnauthorizedException('Invalid credentials');
      }
      const session = await this.prisma.impersonationSession.findFirst({
        where: {
          id: payload.impersonationSessionId,
          actorId: payload.actorId,
          targetId: user.id,
          endedAt: null,
          actor: { role: Role.ADMIN, isActive: true },
        },
        select: {
          id: true,
          actor: {
            select: {
              id: true,
              email: true,
              role: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
      if (!session || session.actor.role !== Role.ADMIN) {
        throw new UnauthorizedException('Invalid credentials');
      }
      return {
        id: user.id,
        sub: user.id,
        userId: user.id,
        email: user.email,
        role: user.role,
        impersonation: {
          sessionId: session.id,
          actor: {
            ...session.actor,
            role: Role.ADMIN,
          },
        },
      };
    }

    return {
      id: user.id,
      sub: user.id,
      userId: user.id,
      email: user.email,
      role: user.role,
    };
  }
}
