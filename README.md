# Ledger

Personal finance dashboard — track expenses, set category budgets, and get AI-powered
spending insights.

This repository is intentionally split into two deployable apps so the UI and API can
scale independently while keeping the mental model simple:

- `frontend/` handles the React app, client state, navigation, and charts.
- `backend/` handles authentication, data persistence, validation, and AI insights.

A quick way to understand the project is to follow one user action end-to-end:

1. A user signs in from the React app.
2. The frontend calls `/api/auth/*` and then calls `/api/profile`, `/api/categories`, and `/api/expenses`.
3. Express validates the request, authorizes the user, and queries MongoDB.
4. The response is rendered in the dashboard, analytics pages, and budget widgets.

This repo is organized so each feature has a clear owner:

- UI pages live in `frontend/src/pages/`
- Shared app state lives in `frontend/src/lib/`
- API routes live in `backend/routes/`
- Request logic lives in `backend/controllers/`
- Database schemas live in `backend/models/`
- Business utilities live in `backend/utils/` and `backend/services/`

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

Split into two independently deployable apps:

| Directory | Stack | Default port |
|---|---|---|
| `frontend/` | React 19 + Vite + React Router | 5173 |
| `backend/` | Express 4 + MongoDB (Mongoose) | 5000 |

---

## Quick Start

You need Node.js 18+ and a running MongoDB (local install or Atlas).

```bash
# 1. Install both workspaces
npm run install:all

# 2. Backend
cd backend
cp .env.example .env      # add your Mongo URI, JWT secrets, GEMINI_API_KEY
npm run seed               # optional demo users + sample expenses
npm run dev

# 3. Frontend (new terminal)
cd frontend
cp .env.example .env       # VITE_API_URL=http://localhost:5000
npm run dev
```

Open http://localhost:5173.

Seeded credentials:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@ledger.app` | `AdminPassword123!` |
| User | `user@ledger.app` | `UserPassword123!` |

---

## Root Scripts

| Command | Description |
|---|---|
| `npm run install:all` | Install frontend and backend dependencies |
| `npm run dev:frontend` | Start the Vite dev server |
| `npm run dev:backend` | Start the Express server |
| `npm run seed` | Seed demo data (backend) |
| `npm test` | Run the backend test suite |

---

## Architecture

```
Browser (React SPA)
   │  fetch + Authorization: Bearer <accessToken>
   ▼
Express API ──► Mongoose ──► MongoDB
   │
   └──► Google Gemini (AI insights; API key stays server-side)
```

### Auth flow

Short-lived JWT access token held by the client, paired with a rotating `httpOnly`
refresh-token cookie. On a `401` the frontend calls `POST /api/auth/refresh` once and
retries the original request — the user never sees a session drop mid-navigation.

### Data isolation

Every query is scoped to `req.user._id`. A user requesting another user's expense id
gets `404`, never `403` — that distinction avoids leaking which ids exist.
`PUT /api/profile` uses a strict field allowlist, so `isAdmin` and `email` cannot be
escalated from the client.

---

## Features

- Expense CRUD with category, note, and date
- Monthly budget with progress tracking and over-budget warnings
- Category management (9 defaults seeded per user, custom ones addable)
- Analytics: daily trend line, category donut, spending heatmap, weekday breakdown
- Safe-to-spend-today calculation based on remaining budget and days left
- AI spending analysis and Q&A chat (Gemini 2.5 Flash)
- Protected admin console with database-backed role checks, paginated user/data views,
  audit logs, CSV exports, health checks, platform settings, and AI usage monitoring
- Light / dark themes
- Offline demo mode: if the backend is unreachable, the app falls back to localStorage

---

## Testing

```bash
cd backend && npm test
```

Vitest + Supertest + `mongodb-memory-server` (no MongoDB install needed) cover auth
flow, profile allowlist protection, cross-user ownership isolation, admin
authorization, suspension checks, and audit logging.

### Admin access

The `/admin` UI is only a navigation guard; every `/api/admin/*` request is protected
by `authenticate` and `requireAdmin`, which reloads the current user from MongoDB.
Admin actions are append-only audited. Use `backend/scripts/create-admin.js` to grant
the first administrator from a controlled CLI session.

---

## Environment

`backend/.env.example`

| Variable | Purpose |
|---|---|
| `PORT` | Express port |
| `MONGODB_URI` | Mongoose connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Token signing secrets — replace both in production |
| `GEMINI_API_KEY` | Enables AI insights (optional) |
| `FRONTEND_URL` | CORS origin |

`frontend/.env.example`

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend base URL |

Both `.env` files are gitignored. Never commit secrets.

---

## More Detail

- [`backend/README.md`](backend/README.md) — full API reference, data models, security notes
- [`frontend/src/lib/api.js`](frontend/src/lib/api.js) — the centralized API client