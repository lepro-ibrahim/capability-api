import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class WebhookSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const secret = process.env.GHL_WEBHOOK_SECRET;
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.get('x-webhook-secret');
    if (!secret || !provided)
      throw new UnauthorizedException('Invalid webhook secret');
    const expected = Buffer.from(secret);
    const actual = Buffer.from(provided);
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
    return true;
  }
}
