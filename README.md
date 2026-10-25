# Ledger

Personal finance dashboard: track expenses, manage bills and invoices, set category
budgets, and ask an AI assistant about your spending.

The repository is split into two independently deployable apps so the UI and the API can
scale separately:

| Directory | Stack | Default port |
|---|---|---|
| `frontend/` | React 19 · Vite 8 · React Router 7 | `5173` |
| `backend/` | Express 4 · MongoDB (Mongoose 8) · Zod | `5000` |

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
[backend/README.md](backend/README.md) (full API reference)

---

## Features

**Spending**
- Expense CRUD with category, note and date (dates use your local day, not UTC)
- Monthly budget with progress tracking and over-budget warnings
- Safe-to-spend-today figure based on the remaining budget and days left
- 9 default categories per user, plus custom ones
- Transactions page (Transactions and Bills tabs) with search, category filter, date range and sorting

**Bills and invoices**
- Create bills manually or by scanning a JPG, PNG, WEBP or PDF (up to 8 MB)
- A scan is only a draft: you review it and nothing is saved until you confirm
- Duplicate protection (same vendor and invoice number, or same vendor, total and date)
- Paid / unpaid status with a derived overdue state, due-soon summary
- Each bill owns exactly one linked expense; attachments are stored privately in
  GridFS and only served to their owner

**Analytics**
- Daily trend line, category donut, month-over-month bars, weekday heatmap

**Ledger AI**
- *Overview → Get AI Insight* writes a short bullet analysis of the month, with the key
  amounts highlighted and a separate **Recommendation** block. It refreshes itself
  whenever an expense, bill or the budget changes, so it never quotes stale numbers.
- *Ledger AI* chat answers questions about spending, budgets and bills in English,
  Roman Urdu or Urdu script, with voice input. It is **read-only**: it never creates
  expenses. Expenses are added with the Add Expense button.
- Attach a receipt or invoice in the chat to scan it into a bill draft.
- The conversation survives page changes and reloads (per user, per tab).

**Admin console** (`/admin`, database-backed role check on every request)
- Platform stats and charts, user list and detail, suspend / promote / reset password /
  delete a user
- Per-user AI daily limits, AI usage monitor, append-only audit log
- Browse platform expenses and bills, CSV export (users, expenses, bills)
- Platform settings: allow signups, maintenance mode, default AI limit, upload size

**Other**
- Light and dark themes
- Offline demo mode: if the backend is unreachable the app falls back to localStorage
- Failed saves are never silent: the change is rolled back and an error toast explains it

---

## Pages

| Route | Page | Access |
|---|---|---|
| `/` | Landing page (stays on the landing page after a reload, even when signed in) | public |
| `/login` | Sign in / create account | public |
| `/overview` | Dashboard home | signed in |
| `/transactions` | Expenses and bills, with Add Expense and Add Bill (`?view=bills` opens the Bills tab; `/bills` redirects there) | signed in |
| `/insights` | **Ledger AI** chat | signed in |
| `/analytics` | Charts | signed in |
| `/settings` | Budget, currency, categories, theme, clear data | signed in |
| `/admin/*` | Admin console | admins |

---

## Quick start

You need Node.js 20 or newer and a MongoDB database (local install or Atlas).

```bash
# 1. Install both apps
npm run install:all

# 2. Backend
cd backend
cp .env.example .env       # PowerShell: Copy-Item .env.example .env
# edit .env: MONGODB_URI, JWT secrets, GEMINI_API_KEY
npm run seed               # optional demo users and sample expenses
npm run dev

# 3. Frontend (new terminal)
cd frontend
cp .env.example .env       # PowerShell: Copy-Item .env.example .env
npm run dev
```

Open <http://localhost:5173>. From the repo root you can also run
`npm run dev:backend` and `npm run dev:frontend`.

Seeded demo accounts (`npm run seed`; change or remove them outside local development):

| Role | Email | Password |
|---|---|---|
| Admin | `admin@ledger.app` | `AdminPassword123!` |
| User | `user@ledger.app` | `UserPassword123!` |

To make an existing account an admin:

```bash
cd backend && npm run create-admin -- you@example.com
```

> If your `MONGODB_URI` has no database name, Mongoose uses the `test` database. Add one
> before the `?`, e.g. `.../ledger?appName=Cluster0`.

### Troubleshooting: port 5000 already in use

Only one backend should run on port `5000`. If `npm run dev:backend` reports
`EADDRINUSE`, the API is probably already running. Check it first:

```powershell
Invoke-WebRequest http://localhost:5000/api/health
```

If it returns `200`, keep the existing process. To restart it on purpose, stop only the
listener:

```powershell
netstat -ano | Select-String ':5000'
Stop-Process -Id <PID>
npm run dev:backend
```

To use another port, set `PORT` in `backend/.env` and point `VITE_API_URL` in
`frontend/.env` at the same port.

---

## Scripts

Run from the repository root.

| Command | Description |
|---|---|
| `npm run install:all` | Install frontend and backend dependencies |
| `npm run dev:frontend` | Start the Vite dev server |
| `npm run dev:backend` | Start the Express API |
| `npm run seed` | Seed demo data |
| `npm test` | Backend tests |
| `npm run test:frontend` | Frontend tests |
| `npm run lint` | ESLint (frontend, zero warnings allowed) |
| `npm run format:check` | Prettier check (frontend) |
| `npm run build` | Production build of the frontend |
| `npm run check` | Lint, format check, both test suites and the build |

Backend extras (run inside `backend/`): `npm run create-admin -- <email>` and
`npm run migrate:supabase -- <export.json>` (one-off legacy import).

---

## Environment

`backend/.env` (see `backend/.env.example`)

| Variable | Purpose |
|---|---|
| `PORT` | Express port (default `5000`) |
| `NODE_ENV` | `development` or `production` |
| `MONGODB_URI` | Mongoose connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Token signing secrets. Production refuses to start with the development defaults or secrets shorter than 32 characters |
| `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY` | AI providers. Set at least one; the app runs with any single key. With several, they are tried in order and a failure moves to the next |
| `AI_PROVIDER_ORDER` | Comma-separated provider order, e.g. `groq,gemini` (default `gemini,claude,openai,groq`) |
| `GLOBAL_AI_DAILY_CAP` | Optional. Maximum AI requests per day across all users |
| `CLAUDE_BACKUP_DAILY_CAP` | Optional. Maximum Claude calls per day (Claude is the paid backup). When spent, the other providers are still used |
| `REDIS_URL` | Optional locally, recommended in production. Shared rate-limit counters and the admin cache (`rediss://` for TLS). Without it, limits use per-process memory |
| `RATE_LIMIT_PREFIX` | Redis key prefix for rate limits (default `ledger:rl:`) |
| `TRUST_PROXY` | Proxy hops trusted for `req.ip` (default `1` in production, off in development) |
| `FRONTEND_URL` | Allowed CORS origin |
| `ADMIN_RATE_LIMIT_PER_MINUTE` | Admin API requests per minute (default `120`) |
| `DEFAULT_AI_DAILY_LIMIT` | Daily AI requests per user for new accounts, counted across chat, analysis and scans (default `100`) |
| `MAX_UPLOAD_SIZE_BYTES` | Maximum bill attachment size (default 8 MB) |
| `CLOUDINARY_URL` | Optional. Store bill attachments in Cloudinary instead of GridFS |

`frontend/.env` (see `frontend/.env.example`)

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend base URL, e.g. `http://localhost:5000` |

Both `.env` files are gitignored. Never commit secrets.

---

## AI

| Use | Model | Notes |
|---|---|---|
| Chat and monthly analysis | `gemini-3.5-flash-lite` | Typically 2 to 4 seconds. The previous 3.8 Flash spent 40 to 120 seconds thinking and timed out |
| Bill scanning | `gemini-3.5-flash` | Thinking disabled; extraction accuracy matters more than a second or two |

- The API key stays on the server and is never sent to the browser.
- Replies are asked to be plain, conversational text; the dashboard analysis is the only
  place that renders bullets and highlighted amounts.
- Each user has one daily AI allowance shared by chat, analysis, bill scans and chat
  attachments. The admin console can change it per user or set the default for new accounts.
- Per-minute and per-hour limits, the daily quota, and the optional platform and Claude caps
  are described under Rate limits below.
- Gemini 429 and 5xx responses are retried with backoff, honouring `Retry-After`.

---

## Architecture

```
Browser (React SPA)
   │  fetch + Authorization: Bearer <accessToken>
   ▼
Express API ──► Mongoose ──► MongoDB (documents + GridFS bill files)
   │
   └──► Google Gemini (chat, analysis, bill scanning)
```

Following one action end to end:

1. The user signs in; the frontend calls `/api/auth/*`, then `/api/profile`,
   `/api/categories`, `/api/expenses` and `/api/bills`.
2. Express validates the request with Zod, authenticates the user and scopes every query
   to `req.user._id`.
3. The shared data provider updates the dashboard, charts and AI analysis together, so
   they always agree.

### Auth

A short-lived JWT access token is held in memory by the client, paired with a rotating
`httpOnly` refresh cookie. On a `401` the frontend calls `POST /api/auth/refresh` once
and retries the request, so a reload restores the session without a login screen.

### Data isolation

Every query is scoped to the signed-in user. Requesting another user's expense or bill
returns `404`, never `403`, so ids cannot be probed. `PUT /api/profile` uses a strict
allowlist, so `isAdmin` and `email` cannot be changed from the client. Admin actions are
audited, and the admin role is re-read from the database on every request.

### Rate limits

All limiters are built in `backend/middleware/rateLimiters.js`, and every limit can be
changed with an environment variable.

| Scope | Limit | Counted per | Variable |
|---|---|---|---|
| Whole API | 120 / minute (1000 in development) | IP | `RATE_LIMIT_GLOBAL_PER_MIN` |
| Sign in, failures only | 20 / 15 min | IP | `RATE_LIMIT_LOGIN_IP` |
| Sign in, failures only | 8 / 15 min | email (case-insensitive) | `RATE_LIMIT_LOGIN_EMAIL` |
| Register | 5 / hour | IP | `RATE_LIMIT_REGISTER_PER_HOUR` |
| Token refresh | 60 / 15 min | IP | `RATE_LIMIT_REFRESH` |
| AI chat and analysis | 20 / 5 min (100 in development) | user | `RATE_LIMIT_AI` |
| Chat file attach (burst) | 5 / 10 min | user | `RATE_LIMIT_AI_ATTACH` |
| AI file reads: bill scans and chat attachments **share one budget** | 10 / hour | user | `RATE_LIMIT_AI_FILE_HOURLY` |
| Admin API | 120 / minute | admin user | `ADMIN_RATE_LIMIT_PER_MINUTE` |

There is no password-reset or OAuth route yet, so those have no limiter.

**What a client sees.** Every limit answers `429` with the same body and a `Retry-After`
header:

```json
{ "error": "Too many requests", "code": "RATE_LIMITED", "retryAfterSeconds": 120 }
```

The daily AI limits keep their own codes (`AI_DAILY_LIMIT_REACHED`, `AI_GLOBAL_CAP_REACHED`,
`AI_BACKUP_CAP_REACHED`). The web app turns these into plain messages ("Too many attempts,
try again in 2 minutes") and disables the button for a few seconds.

**Where the counters live.** With `REDIS_URL` set, limiter counters are in Redis, so they
are shared by every server instance and survive restarts. Without it, they are in memory
and the server prints one warning at startup. If Redis is configured but becomes
unreachable, each request falls back to a per-process memory counter for that limiter: the
API keeps working and keeps limiting, and a warning is logged at most once a minute.

**Behind a proxy.** On Render, Railway, Vercel or any reverse proxy, every request arrives
from the proxy's address. Without `trust proxy` the app would see one IP for everybody, and
all users would share a single rate-limit bucket. `TRUST_PROXY` (default `1` in production)
tells Express how many hops to trust. Set it to the real number: trusting too many lets a
client forge `X-Forwarded-For` and dodge its own limit.

**Account lockout.** After 10 consecutive failed sign-ins an account is locked for 15
minutes (`MAX_FAILED_LOGINS`, `LOGIN_LOCK_MINUTES`). This is stored in MongoDB, so it
survives restarts. A locked account answers with the same `429` as the limiter, and an
unknown email and a wrong password return identical responses and take similar time.
Admins can unlock a user from the Users page.

**Daily AI quota.** One combined counter per user per day covers chat, analysis, bill scans
and chat attachments. It lives in MongoDB (not Redis) and is checked and incremented in a
single atomic update, so concurrent requests cannot exceed the limit. A day runs from
midnight to midnight in Asia/Karachi. `GLOBAL_AI_DAILY_CAP` and `CLAUDE_BACKUP_DAILY_CAP`
add optional platform-wide caps. The admin System page shows today's usage.

**Running Redis locally.**

```bash
docker run -d --name ledger-redis -p 6379:6379 redis:7
# backend/.env
REDIS_URL=redis://localhost:6379
```

Then open `GET /api/health` (or the admin System page) and check that `redis.ok` is `true`.

---|---|
| Whole API | 120 requests per minute in production (1000 in development) |
| Sign in / register | 30 per 15 minutes |
| Admin API | 120 per minute (configurable) |
| AI | see the AI section |

---

## Project structure

```
.
├── frontend/
│   └── src/
│       ├── pages/          Landing, Login, Overview, Transactions,
│       │                   Insights (Ledger AI), Analytics, Settings, Admin
│       ├── components/     Sidebar, charts, modals, bill form, InsightText
│       └── lib/            AuthContext, DataContext, api client, toasts, dates
├── backend/
│   ├── routes/             auth, profile, categories, expenses, bills, ai, admin
│   ├── controllers/        request handlers
│   ├── middleware/         auth, admin, validation, upload, AI limits, maintenance
│   ├── models/             User, Expense, Category, Bill, AiUsage, AuditLog,
│   │                       PlatformSettings, Counter
│   ├── services/           AI, bill scanning, bill storage, audit, stats
│   ├── schemas/ utils/     Zod schemas and pure helpers (money, files, AI input)
│   ├── scripts/            seed, create-admin, Supabase migration
│   └── tests/              Vitest + Supertest + mongodb-memory-server
├── docs/ARCHITECTURE.md
└── .github/workflows/ci.yml
```

---

## Testing and CI

```bash
npm test               # backend
npm run test:frontend  # frontend
npm run check          # everything CI runs
```

Backend tests use `mongodb-memory-server`, so no MongoDB install is needed. They cover
the auth flow, profile allowlist protection, cross-user isolation, admin authorization,
suspension and maintenance mode, bill scanning, duplicate detection and AI input
validation.

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main` and every pull
request: install, lint, format check, frontend tests, backend tests and the production
build.

---

## Security notes

- Passwords are hashed with bcrypt; the hash is never returned by the API.
- Helmet headers, an explicit CORS allowlist, credentials only for allowed origins.
- Uploads are verified by magic bytes, not by file extension or declared type.
- Text inside chat messages and attached documents is treated as data, never as
  instructions, and the chat model only has a read-only tool.
- Production startup fails fast on missing or weak secrets.

---

## More detail

- [`backend/README.md`](backend/README.md): full API reference, data models, security notes
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): how the repository is organised
- [`frontend/src/lib/api.js`](frontend/src/lib/api.js): the centralized API client
