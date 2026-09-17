import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import {
  Observable,
  catchError,
  concatMap,
  from,
  map,
  of,
  throwError,
} from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './auth.types';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class ImpersonationAuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
      user?: AuthenticatedUser;
    }>();
    const response = context
      .switchToHttp()
      .getResponse<{ statusCode?: number }>();
    const method = (request.method ?? '').toUpperCase();
    const impersonation = request.user?.impersonation;

    if (!impersonation || !MUTATING_METHODS.has(method) || !request.user) {
      return next.handle();
    }

    const writeLog = (statusCode: number) =>
      this.prisma.impersonationAuditLog.create({
        data: {
          method,
          path: request.originalUrl ?? request.url ?? '',
          statusCode,
          sessionId: impersonation.sessionId,
          actorId: impersonation.actor.id,
          targetId: request.user!.userId,
        },
      });

    const result$ = next.handle() as Observable<unknown>;
    return result$.pipe(
      concatMap((value) =>
        from(writeLog(response.statusCode ?? 200)).pipe(
          map(() => value),
          catchError(() => of(value)),
        ),
      ),
      catchError((error: { status?: number }) =>
        from(writeLog(error?.status ?? response.statusCode ?? 500)).pipe(
          catchError(() => of(null)),
          concatMap(() => throwError(() => error)),
        ),
      ),
    );
  }
}
