import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import { Role } from '@prisma/client';

import { Public } from './public.decorator';
import { AuthenticatedUser } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body.email, body.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: { user: AuthenticatedUser }) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('impersonation/:userId/start')
  async startImpersonation(
    @Req() req: { user: AuthenticatedUser },
    @Param('userId') userId: string,
  ) {
    return this.auth.startImpersonation(req.user.userId, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('impersonation/stop')
  async stopImpersonation(@Req() req: { user: AuthenticatedUser }) {
    return this.auth.stopImpersonation(req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('create-user')
  async createUser(
    @Req() req: { user: AuthenticatedUser },
    @Body()
    body: {
      email: string;
      password: string;
      role: Role;
      firstName?: string;
      lastName?: string;
    },
  ) {
    return this.auth.adminCreateUser(req.user.userId, body);
  }
}
