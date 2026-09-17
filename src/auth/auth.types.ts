import { Role } from '@prisma/client';

export type AuthenticatedUser = {
  id: string;
  sub: string;
  userId: string;
  email: string;
  role: Role;
  impersonation?: {
    sessionId: string;
    actor: {
      id: string;
      email: string;
      role: Role;
      firstName: string;
      lastName: string | null;
    };
  };
};

export type AccessTokenPayload = {
  sub: string;
  email: string;
  role: Role;
  actorId?: string;
  impersonationSessionId?: string;
};
