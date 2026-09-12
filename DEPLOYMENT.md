# Capability API — Vercel / Neon

## Deployment configuration

- Vercel project: `capability-api`, workspace `ibrahimabdou771-7900`.
- Node.js: 22.x. Framework: NestJS. Entrypoint: `src/main.ts`.
- Install: `npm ci`. Build: `npm run build`.
- Region: Cleveland (`cle1`), near the Neon database in Ohio.
- The entire API runs as one Vercel function. Chromium's compressed files are included for PDF exports.

Set these variables in the Vercel project's **Production** environment:

| Variable | Value / purpose |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL connection string; use SSL and a pooled connection with a conservative connection limit. |
| `JWT_SECRET` | A cryptographically random secret, at least 32 characters. |
| `JWT_EXPIRES` | `2h` |
| `PUBLIC_BASE_URL` | `https://capability-api-ibrahimabdou771-7900.vercel.app` |
| `TZ` | `Europe/Paris` |
| `GHL_WEBHOOK_SECRET` | A separate random secret, when activating external GHL webhooks. |
| `CORS_ORIGIN` | Optional list of browser origins. The frontend's `/api` proxy does not require browser CORS. |

Keep secrets in Vercel's environment settings and in ignored local environment files. Never add them to GitHub. Production must not use the development JWT secret. Preview deployments should use a separate Neon branch and separate secrets.

## Fresh database bootstrap

The existing migration history contains repeated enum alterations. For a new, empty database, `prisma/bootstrap.sql` creates the **current** schema and records the checksums of the 23 historical migrations as applied. This does not replay old SQL or alter the history used by an existing installation.

1. Confirm the selected database is empty and its connection string matches the Vercel project.
2. Apply `prisma/bootstrap.sql` as one transaction. It refuses to run if the public schema already contains tables.
3. Verify there are 20 application tables plus `_prisma_migrations`, and 23 completed migration records.
4. Compare the database with `prisma/schema.prisma` before deploying additional migrations.

If a statement fails, the transaction rolls back automatically. After successful initialization, keep this database; do not reset it. To undo only the initial installation, use a separate disposable Neon branch or a Neon restore point rather than dropping production tables.

## Administrator

The administrator requested for this deployment is `ibrahimabdou771@gmail.com`.

Create it once with the existing `prisma/seed.ts`, using locally supplied `ADMIN_EMAIL`, `ADMIN_PASSWORD` (at least 16 characters), and `ADMIN_FIRST_NAME`. The seed hashes the password with bcrypt and refuses to overwrite an existing account. Do not run the historical demo seeds or enable `ALLOW_OPEN_SEED` in production.

## Authentication and webhooks

- Login: `POST /auth/login`, JSON `{ "email": "...", "password": "..." }`; returns `{ "access_token": "...", "user": { ... } }`.
- CRM routes require `Authorization: Bearer <token>`; an unauthenticated request receives HTTP 401.
- `GET /auth/me` returns the authenticated subject as `sub` and `userId`. Active status and current role are read from the database on each authenticated request.
- `POST /auth/create-user` requires an active administrator; a closer receives HTTP 403.
- `POST /hook/:routeKey` retains its automation-specific route key and mapping behavior.
- `POST /webhooks/ghl` retains HMAC validation and requires a configured `GHL_WEBHOOK_SECRET` in production.
- `POST /integrations/ghl/webhook` requires the same secret in the `x-webhook-secret` header.

Vercel's filesystem is read-only except for `/tmp`. Optional PDF archives therefore use `/tmp` on Vercel and are temporary. Persistent report archives would require durable storage; the normal PDF download does not use archival storage.

## Validation performed

- Backend build and production source typecheck: passed.
- Deployment authentication suite: 12 tests passed, covering anonymous access, login, identity, deactivation, admin creation, role enforcement, webhook refusal, and JWT configuration.
- The original test suite has unrelated failures from missing service mocks and old fixtures; it is not a deployment acceptance check.
- Existing full-project lint fails on legacy formatting and typing problems; no broad formatting cleanup was applied.
- Local PDF execution is blocked by an extraction/chown limitation in the execution container. PDF generation must be checked in the deployed Vercel function.
- A backend preview deployment was created. Remote build status, environment provisioning, database initialization, administrator creation, and live browser verification are pending authenticated access to the Vercel workspace.
