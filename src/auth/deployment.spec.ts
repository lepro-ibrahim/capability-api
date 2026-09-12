import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { Server } from 'node:http';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { getJwtSecret } from './jwt.config';

describe('Deployment authentication', () => {
  let app: INestApplication;
  const user = {
    id: 'test-admin',
    email: 'admin@test.invalid',
    firstName: 'Admin',
    role: 'ADMIN',
    isActive: true,
    passwordHash: '',
  };
  const prisma = {
    user: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(user)),
      update: jest.fn().mockResolvedValue(user),
      create: jest
        .fn()
        .mockImplementation(
          ({
            data,
            select,
          }: {
            data: Record<string, unknown>;
            select: Record<string, boolean>;
          }) => {
            const created = { id: 'new-user', ...data };
            return Promise.resolve(
              Object.fromEntries(
                Object.keys(select).map((key) => [
                  key,
                  created[key as keyof typeof created],
                ]),
              ),
            );
          },
        ),
    },
  };

  beforeAll(async () => {
    user.passwordHash = await bcrypt.hash('test-password-for-login', 10);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    user.isActive = true;
    user.role = 'ADMIN';
    jest.clearAllMocks();
  });

  it.each([
    '/reporting/summary',
    '/leads',
    '/prospects/board',
    '/admin/users',
    '/integrations/automations',
    '/budget',
  ])('requires a token for %s', async (path) => {
    await request(app.getHttpServer<Server>()).get(path).expect(401);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('allows login, returns the current identity, and rejects a deactivated account', async () => {
    const login = await request(app.getHttpServer<Server>())
      .post('/auth/login')
      .send({ email: user.email, password: 'test-password-for-login' })
      .expect(201);
    const token = (login.body as { access_token: string }).access_token;
    expect(token).toBeTruthy();
    const me = await request(app.getHttpServer<Server>())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body).toMatchObject({
      sub: user.id,
      userId: user.id,
      email: user.email,
    });
    user.isActive = false;
    await request(app.getHttpServer<Server>())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects an incorrect password', async () => {
    await request(app.getHttpServer<Server>())
      .post('/auth/login')
      .send({ email: user.email, password: 'wrong-password' })
      .expect(401);
  });

  it('lets an admin create an account using the authenticated subject', async () => {
    const token = app.get(JwtService).sign({ sub: user.id });
    const result = await request(app.getHttpServer<Server>())
      .post('/auth/create-user')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'new@test.invalid',
        password: 'new-password',
        role: 'SETTER',
      })
      .expect(201);
    expect(result.body).toMatchObject({
      email: 'new@test.invalid',
      role: 'SETTER',
    });
    expect(result.body).not.toHaveProperty('passwordHash');
  });

  it('rejects account creation by a closer', async () => {
    user.role = 'CLOSER';
    const token = app.get(JwtService).sign({ sub: user.id });
    await request(app.getHttpServer<Server>())
      .post('/auth/create-user')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'new@test.invalid',
        password: 'new-password',
        role: 'SETTER',
      })
      .expect(403);
  });

  it('rejects an unconfigured or invalid webhook secret', async () => {
    await request(app.getHttpServer<Server>())
      .post('/integrations/ghl/webhook')
      .send({})
      .expect(401);
    await request(app.getHttpServer<Server>())
      .post('/integrations/ghl/webhook')
      .set('x-webhook-secret', 'incorrect-secret')
      .send({})
      .expect(401);
  });

  it('refuses the development JWT secret in production', () => {
    const previousMode = process.env.NODE_ENV;
    const previousSecret = process.env.JWT_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      expect(() => getJwtSecret()).toThrow('JWT_SECRET');
    } finally {
      if (previousMode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousMode;
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    }
  });
});
