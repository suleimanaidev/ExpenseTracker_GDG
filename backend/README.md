# Ledger — Backend (Express + MongoDB)

Express REST API for the **Ledger** personal finance app.

- **Runtime**: Node.js + Express 4 (ESM)
- **Database**: MongoDB via Mongoose 8 (documents + GridFS for bill attachments)
- **Auth**: short-lived JWT access token (`Authorization: Bearer`) plus a rotating
  `httpOnly` refresh-token cookie
- **Validation**: Zod
- **Security**: Helmet, CORS allowlist, bcrypt, layered rate limiting
- **AI**: Google Gemini (key stays server-side, never exposed to the browser)

---

## Project structure

```
backend/
├── config/
│   ├── db.js                 Mongoose connection, health and ping helpers
│   └── env.js                Production environment validation
├── controllers/              Request handlers (auth, profile, categories, expenses,
│                             bills, bill scan, AI, admin)
├── middleware/
│   ├── auth.js               Verifies the Bearer access token
│   ├── admin.js              requireAdmin guard (role re-read from the database)
│   ├── aiLimit.js            Per-user daily AI limit, per call type
│   ├── maintenance.js        Blocks non-admin traffic during maintenance mode
│   ├── upload.js             Multipart handling and magic-byte checks
│   ├── validate.js           Zod request validation
│   └── errorHandler.js       Centralized error formatting
├── models/                   User, Expense, Category, Bill, AiUsage, AuditLog,
│                             PlatformSettings, Counter
├── routes/                   Express routers, mounted in server.js
├── schemas/                  Zod schemas (bills, AI proposals)
├── services/
│   ├── aiService.js          Gemini chat and monthly analysis
│   ├── billScanService.js    Document extraction for bill scans
│   ├── billStorageService.js GridFS (or Cloudinary) attachment storage
│   ├── auditService.js       Append-only admin audit log
│   └── statsService.js       Aggregations for the admin dashboard
├── utils/                    Money math, bill math, file signatures, AI input helpers
├── scripts/
│   ├── seed.js                       Demo users and sample expenses
│   ├── create-admin.js               Grant admin to an existing user
│   └── migrate-supabase-to-mongo.js  One-off legacy import
├── tests/                    Vitest + Supertest + mongodb-memory-server
└── server.js                 App entry point
```

---

## Environment variables

```bash
cp .env.example .env      # PowerShell: Copy-Item .env.example .env
```

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Express port | `5000` |
| `NODE_ENV` | Runtime mode | `development` |
| `MONGODB_URI` | Mongoose connection string | `mongodb://127.0.0.1:27017/ledger` |
| `JWT_ACCESS_SECRET` | Signs short-lived access tokens | development default |
| `JWT_REFRESH_SECRET` | Signs and verifies refresh tokens | development default |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GROQ_API_KEY` | AI providers; any single key is enough, several are tried in order | empty |
| `AI_PROVIDER_ORDER` | Provider order, e.g. `groq,gemini` | `gemini,claude,openai,groq` |
| `GLOBAL_AI_DAILY_CAP` / `CLAUDE_BACKUP_DAILY_CAP` | Optional daily caps (all users / paid Claude backup) | unset |
| `REDIS_URL` | Shared rate-limit counters and admin cache (optional locally) | unset (memory) |
| `RATE_LIMIT_PREFIX` | Redis key prefix for limiters | `ledger:rl:` |
| `TRUST_PROXY` | Proxy hops trusted for `req.ip` | `1` in production, off in development |
| `FRONTEND_URL` | CORS origin for the Vite app | `http://localhost:5173` |
| `ADMIN_RATE_LIMIT_PER_MINUTE` | Admin API requests per minute | `120` |
| `DEFAULT_AI_DAILY_LIMIT` | Daily AI requests per type for new accounts | `100` |
| `MAX_UPLOAD_SIZE_BYTES` | Maximum bill attachment size | `8388608` (8 MB) |
| `CLOUDINARY_URL` | Optional: store attachments in Cloudinary instead of GridFS | unset |

When `NODE_ENV=production` the server refuses to start unless `MONGODB_URI`,
both JWT secrets and `FRONTEND_URL` are set, the secrets are at least 32 characters
and are not the development defaults. Never commit `.env`.

> A `MONGODB_URI` without a database name makes Mongoose use the `test` database.

---

## Setup

```bash
npm install
cp .env.example .env
npm run seed     # optional: demo data
npm run dev      # http://localhost:5000
```

Verify the service is up:

```bash
curl http://localhost:5000/api/health
```

`/api/health` returns `200` with `database: "connected"` when MongoDB is reachable and
`503` with `status: "degraded"` otherwise. It also reports `maintenance`.

### Seeded credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@ledger.app` | `AdminPassword123!` |
| User | `user@ledger.app` | `UserPassword123!` |

`npm run seed` only clears and recreates demo accounts (`admin@`, `user@`, `demo@`
prefixes); it never touches real accounts.

```bash
npm run create-admin -- you@example.com   # grant admin to an existing account
```

---

## API reference

All routes are prefixed with `/api`. Protected routes require
`Authorization: Bearer <accessToken>`. While maintenance mode is on, non-admin requests
receive `503` with `code: "MAINTENANCE_MODE"`.

### Auth — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/register` | – | Create account, seed 9 default categories, set refresh cookie |
| `POST` | `/login` | – | Returns `accessToken` and sets the refresh cookie |
| `POST` | `/logout` | – | Clears the refresh cookie |
| `POST` | `/refresh` | cookie | Rotates the refresh cookie, issues a new access token |
| `GET` | `/me` | ✔ | Current user |

Suspended accounts cannot sign in or refresh. Sign-up can be disabled from the admin
console.

### Profile

| Method | Path | Description |
|---|---|---|
| `GET` | `/profile` | Read profile |
| `PUT` | `/profile` | Update `fullName`, `monthlyBudget`, `currency` (strict allowlist) |
| `PUT` | `/settings/budget` | Update the monthly budget, returns a budget warning |
| `DELETE` | `/profile/clear` | Wipe own data (requires `{ "confirm": true }`) |

`isAdmin` and `email` are not writable through `PUT /api/profile`.

### Categories — `/api/categories`

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List the caller's categories |
| `POST` | `/` | Create a category |
| `DELETE` | `/:name` | Delete a category by name |

### Expenses — `/api/expenses`

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List expenses. Query: `category`, `search`, `dateFrom`, `dateTo`, `sortBy` (`date-asc`, `date-desc`, `amount-asc`, `amount-desc`), `page`, `limit` |
| `POST` | `/` | Create an expense |
| `PUT` | `/:id` | Update an expense |
| `DELETE` | `/:id` | Delete an expense |

Every query is scoped to `req.user`; another user's record returns `404`.

### Bills — `/api/bills`

| Method | Path | Description |
|---|---|---|
| `POST` | `/scan` | Multipart field `bill` (JPG, PNG, WEBP, PDF, up to 8 MB, verified by magic bytes). Returns an extracted draft and **persists nothing** |
| `GET` | `/summary` | Outstanding total, upcoming bills, due-soon alerts |
| `POST` | `/` | Create a bill (JSON or multipart with an optional `bill` file). Creates the bill and its one linked expense together, or neither |
| `GET` | `/` | List bills. Query: `status`, `vendor`, `from`, `to`, `search`, `page`, `limit` |
| `GET` | `/:id` | Read one bill |
| `GET` | `/:id/file` | Stream the attachment (owner only; `?download=1` forces a download) |
| `PUT` | `/:id` | Update a bill; keeps the linked expense in sync |
| `PATCH` | `/:id/status` | Set `paid` / `unpaid` |
| `DELETE` | `/:id` | Delete the bill, its attachment and its expense |

Duplicates return `409`: the same vendor and invoice number, or the same vendor, total
and issue date. `overdue` is derived from `dueDate` and never stored.

### AI

| Method | Path | Description |
|---|---|---|
| `POST` | `/insight` | Monthly spending analysis as bullet lines with `**highlighted**` amounts and a final `Recommendation:` line. Returns `insight`, `totalSpent`, `remaining`, `runwayDate` |
| `POST` | `/insight/chat` | Read-only Q&A. JSON `{ question, history, clientData }` returns `{ reply, answers, proposal: null }`. With a multipart `bill` file it returns a bill draft in `proposal` instead |

- Chat never creates data. A message that looks like an expense to record is answered
  with a pointer to the Add Expense button.
- Limits per user: 20 requests per 5 minutes in production (100 in development), bill
  attachments 5 per 10 minutes, `/api/bills/scan` 10 per hour, and a daily limit per call
  type (`insight`, `chat`, `scan`) set per user (default `DEFAULT_AI_DAILY_LIMIT`).
- Models: `gemini-3.5-flash-lite` for chat and analysis, `gemini-3.5-flash` (thinking
  off) for bill scans. Gemini 429 and 5xx responses are retried with backoff.
- If `GEMINI_API_KEY` is unset the endpoints still answer `200` with a message asking you
  to configure it, so the UI degrades gracefully.
- Upstream failures return `503` with `code: "AI_UNAVAILABLE"`.

### Admin — `/api/admin`

All routes require an authenticated administrator.

| Method | Path | Description |
|---|---|---|
| `GET` | `/stats`, `/charts` | Platform totals and chart series (`range`: `7d`, `30d`, `90d`, `12m`) |
| `GET` | `/users`, `/users/:userId` | Paginated user list (search, role, status, sort) and detail |
| `GET` | `/users/:userId/expenses` | Per-user expense drill-down |
| `PATCH` | `/users/:userId/status` | Suspend or reactivate |
| `PATCH` | `/users/:userId/role` | Grant or revoke admin |
| `POST` | `/users/:userId/reset-password` | Generate a one-time reset token (valid 15 minutes, stored hashed) |
| `PUT` | `/users/:userId/ai-limit` | Set the user's daily AI limit |
| `DELETE` | `/users/:userId` | Delete a user (requires `confirmEmail`) |
| `GET` | `/ai-usage` | AI usage monitor |
| `POST` | `/ai-usage/chat` | Admin assistant |
| `GET` | `/audit-logs` | Append-only audit trail |
| `GET` | `/expenses`, `/bills` | Browse platform data |
| `GET` | `/bills/:billId/file` | Read a bill attachment |
| `GET` | `/export/:type` | CSV export (`users`, `expenses`, `bills`) |
| `GET` | `/health` | Operational health |
| `GET` / `PUT` | `/settings` | `allowNewSignups`, `maintenanceMode`, `defaultAiDailyLimit`, `maxUploadSizeBytes` |

Non-admins receive `403`. Admin actions are written to the audit log.

---

## Data models

| Model | Key fields |
|---|---|
| `User` | `email` (unique, lowercased), `passwordHash` (`select: false`), `fullName`, `isAdmin`, `isSuspended`, `monthlyBudget`, `currency`, `aiDailyLimit` |
| `Category` | `user`, `name`, `color`, `icon`; unique per `(user, name)` |
| `Expense` | `user`, `category`, `amountMinor`, `note`, `date` |
| `Bill` | `user`, linked `expense`, `vendor`, `invoiceNumber`, dates, line items, totals in minor units, `status`, attachment metadata |
| `AiUsage` | `user`, `type` (`scan`, `insight`, `chat`), `model`, `success`, `latencyMs` |
| `AuditLog` | Append-only record of admin actions |
| `PlatformSettings` | Singleton: signups, maintenance mode, default AI limit, upload size |
| `Counter` | Sequence helper |

Money is stored as an integer `amountMinor` (1/100th units) to avoid floating-point
drift; `utils/financeCalculations.js` converts to and from display amounts.

Serialized users include snake_case aliases (`full_name`, `monthly_budget`, `is_admin`,
`joined_at`) so older UI code keeps working.

---

## Security

- Passwords hashed with bcrypt; `passwordHash` is never returned.
- Short-lived access tokens; the refresh token lives in an `httpOnly` cookie.
- Helmet headers, an explicit CORS allowlist, credentials enabled.
- Rate limits (Redis-backed when `REDIS_URL` is set, memory otherwise): whole API 120/min,
  sign in 20 failures per 15 min per IP and 8 per email, register 5/hour, refresh 60 per 15
  min, AI 20 per 5 min per user, AI file reads 10/hour per user (scans and chat attachments
  share it), admin 120/min. All answer `429` with
  `{ "error": "Too many requests", "code": "RATE_LIMITED", "retryAfterSeconds": n }`. The
  full table, variables, lockout and daily-quota rules are in the root README under
  *Rate limits*.
- Accounts lock for 15 minutes after 10 consecutive failed sign-ins (stored in MongoDB).
- JSON bodies capped at 1 MB; uploads capped by `MAX_UPLOAD_SIZE_BYTES` and verified by
  file signature; all input validated with Zod; request bodies are sanitized against
  NoSQL operator injection.
- `isAdmin` and `email` are excluded from every client-writable field.
- Bill attachments are never public: bytes are only readable through an authenticated,
  owner-scoped route.

---

## Testing

```bash
npm test
```

Uses Vitest, Supertest and `mongodb-memory-server`, so **no running MongoDB is
required**. Coverage includes the auth flow, profile allowlist protection, cross-user
isolation, admin authorization, suspension, maintenance mode, bill scanning and storage,
duplicate detection, environment validation, error handling and AI input validation.

---

## Migrating from Supabase

```bash
npm run migrate:supabase -- path/to/supabase_export.json
```

Expects a JSON export with `profiles`, `categories` and `expenses` arrays. Password hashes
cannot be exported from Supabase, so every imported user is created with the temporary
password `TemporaryPassword123!` and must reset it.
