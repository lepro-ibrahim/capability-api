import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { PrismaModule } from '../prisma/prisma.module';
import type { StringValue } from 'ms'; // 👈 important

import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { getJwtSecret } from './jwt.config';
import { ImpersonationAuditInterceptor } from './impersonation-audit.interceptor';

const jwtSecret = getJwtSecret();

// On force le type vers StringValue (format '2h', '10m', '30s', etc.)
const jwtExpires: StringValue =
  (process.env.JWT_EXPIRES as StringValue) || '2h';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.register({
      secret: jwtSecret,
      signOptions: {
        expiresIn: jwtExpires, // ✅ maintenant c’est bien: number | StringValue | undefined
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: ImpersonationAuditInterceptor },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
