# Ledger — Backend (Express + MongoDB)

Express REST API for the **Ledger** personal finance app. Replaces the previous Supabase
(Postgres + Supabase Auth + RLS) stack with a self-hosted MERN backend.

- **Runtime**: Node.js + Express 4 (ESM)
- **Database**: MongoDB via Mongoose 8
- **Auth**: JWT access token (short-lived, `Authorization: Bearer`) + rotating
  `httpOnly` refresh-token cookie
- **Validation**: Zod (shared route schemas)
- **Security**: Helmet, CORS allowlist, `bcrypt` (cost 12), rate limiting
- **AI**: Google Gemini (key kept server-side, never exposed to the browser)

---

## Project Structure

```
backend/
├── config/
│   └── db.js                # Mongoose connection, health + ping helpers
├── controllers/             # Request handlers (thin; business logic here)
├── middleware/
│   ├── auth.js              # Verifies the Bearer access token
│   ├── admin.js             # requireAdmin guard
│   ├── validate.js          # Zod request validation
│   └── errorHandler.js      # Centralized error formatting
├── models/                  # Mongoose schemas (User, Category, Expense)
├── routes/                  # Express routers, mounted in server.js
├── services/
│   ├── aiService.js         # Gemini integration for spending insights
│   └── statsService.js      # Aggregation helpers (admin dashboard)
├── utils/
│   └── financeCalculations.js  # Pure money math (minor units, budgets, rates)
├── scripts/
│   ├── seed.js                    # Demo users + sample expenses
│   └── migrate-supabase-to-mongo.js  # One-off legacy data migration
├── tests/                  # Vitest + Supertest + mongodb-memory-server
└── server.js               # App entry point
```

---

## Environment Variables

Copy the example file and fill in real values:

```bash
cp .env.example .env
```

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Express port | `5000` |
| `NODE_ENV` | Runtime mode | `development` |
| `MONGODB_URI` | Mongoose connection string | `mongodb://127.0.0.1:27017/ledger` |
| `JWT_ACCESS_SECRET` | Signs short-lived access tokens | — |
| `JWT_REFRESH_SECRET` | Signs/verifies refresh tokens | — |
| `GEMINI_API_KEY` | Enables `/api/insight` (optional) | empty |
| `FRONTEND_URL` | CORS origin for the Vite app | `http://localhost:5173` |

> Always replace both JWT secrets in production. Never commit `.env`.

---

## Setup

```bash
npm install
cp .env.example .env
npm run seed     # optional: demo data
npm run dev      # starts on http://localhost:5000
```

Verify the service is up:

```bash
curl http://localhost:5000/api/health
```

### Seeded credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@ledger.app` | `AdminPassword123!` |
| User | `user@ledger.app` | `UserPassword123!` |

`npm run seed` only clears and recreates demo accounts
(`admin@`, `user@`, `demo@` prefixes) — it never touches real accounts.

---

## API Reference

All routes are prefixed with `/api`. Protected routes require
`Authorization: Bearer <accessToken>`.

### Auth — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/register` | – | Create account, seeds 9 default categories, sets refresh cookie |
| `POST` | `/login` | – | Returns `accessToken` + sets refresh cookie |
| `POST` | `/logout` | – | Clears the refresh cookie |
| `POST` | `/refresh` | cookie | Rotates refresh cookie, issues a new access token |
| `GET` | `/me` | ✔ | Current user + profile |

### Profile — `/api/profile`

| Method | Path | Description |
|---|---|---|
| `GET` | `/profile` | Read profile |
| `PUT` | `/profile` | Update `fullName`, `monthlyBudget`, `currency` (strict allowlist) |
| `PUT` | `/settings/budget` | Update monthly budget, returns budget warning |
| `DELETE` | `/profile/clear` | Wipe own data (requires `{ "confirm": true }`) |

> Privilege escalation is blocked: `isAdmin` and `email` are not writable through
> `PUT /api/profile`.

### Categories — `/api/categories`

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List the caller's categories |
| `POST` | `/` | Create a category |
| `DELETE` | `/:name` | Delete a category by name |

### Expenses — `/api/expenses`

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List expenses. Query params: `category`, `search`, `dateFrom`, `dateTo`, `sortBy` (`date-asc`, `date-desc`, `amount-asc`, `amount-desc`), `page`, `limit` |
| `POST` | `/` | Create an expense |
| `PUT` | `/:id` | Update an expense |
| `DELETE` | `/:id` | Delete an expense |

Every query is scoped to `req.user`, so one user can never read, update, or delete
another user's records (such requests return `404`).

### AI — `/api/insight`

| Method | Path | Description |
|---|---|---|
| `POST` | `/insight` | Auto-generated spending summary |
| `POST` | `/insight/chat` | Follow-up Q&A about the caller's spending |

Rate limited to 20 requests per 5 minutes per user. If `GEMINI_API_KEY` is unset the
endpoints still respond `200` with a fallback message telling you to configure the key,
so the UI degrades gracefully instead of erroring.

### Admin — `/api/admin`

| Method | Path | Description |
|---|---|---|
| `GET` | `/stats` | Platform-wide totals (requires `isAdmin`) |
| `GET` | `/users` | User list |
| `GET` | `/users/:userId/expenses` | Per-user expense drill-down |

Non-admins receive `403`.

---

## Data Models

| Model | Key fields |
|---|---|
| `User` | `email` (unique, lowercased), `passwordHash` (`select: false`), `fullName`, `isAdmin`, `monthlyBudget`, `currency` |
| `Category` | `user`, `name`, `color`, `icon`, unique per `(user, name)` |
| `Expense` | `user`, `categoryRef`, `category`, `amountMinor`, `note`, `date` |

Money is stored as an integer `amountMinor` (1/100th units) to avoid floating-point
drift. `utils/financeCalculations.js` converts to and from display amounts.

Serialized users include snake_case aliases (`full_name`, `monthly_budget`,
`is_admin`, `joined_at`) so the frontend can migrate without breaking older UI code.

---

## Security

- Passwords hashed with `bcrypt` cost factor 12; `passwordHash` is never returned.
- Access tokens are short-lived; the refresh token lives in an `httpOnly` cookie.
- `helmet` security headers, explicit CORS allowlist, credentials enabled.
- Rate limits: general API 120 req/min, auth 30 req / 15 min, AI 20 req / 5 min.
- Body size capped at 100 kB; all input validated with Zod.
- `isAdmin` and `email` are excluded from every client-writable field.

---

## Testing

```bash
npm test
```

Uses Vitest, Supertest, and `mongodb-memory-server`, so **no running MongoDB is
required**. Coverage includes the auth flow (register / login / refresh / logout),
profile allowlist protection, cross-user ownership isolation, admin authorization,
and expense filtering.

---

## Migrating from Supabase

```bash
npm run migrate:supabase -- path/to/supabase_export.json
```

Expect a JSON export with `profiles`, `categories`, and `expenses` arrays.
Password hashes cannot be exported from Supabase, so every imported user is created
with the temporary password `TemporaryPassword123!` and must reset it.