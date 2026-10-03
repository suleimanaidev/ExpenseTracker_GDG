# Repository architecture

This project is a personal finance dashboard built as a small full-stack application.
The goal is simple: let a user manage expenses, budgets, category tracking, and AI-powered
insights without mixing UI code and backend logic together.

## 1) High-level architecture

```text
Browser (React SPA)
    |
    | fetches data from API
    v
Frontend (Vite + React Router)
    |
    | uses api.js for JWT + refresh handling
    v
Backend (Express + MongoDB)
    |
    | verifies auth, validates payloads, scopes data by user
    v
MongoDB / Mongoose models
```

## 2) Why the repo is split

The repository keeps a clean separation of concerns:

- `frontend/` contains UI code, routing, local state, and chart logic.
- `backend/` contains the API, validation, database access, and security logic.
- Shared responsibilities are minimal: the frontend knows the API contract, and the backend owns the data model.

This separation makes the project easier to reason about, test, and deploy independently.

## 3) Frontend structure

```text
frontend/
├── src/
│   ├── components/      # Reusable UI pieces: sidebar, charts, summary cards
│   ├── lib/             # Auth, API client, data provider, categories
│   ├── pages/           # Route-level screens (Overview, Transactions, Bills, Analytics)
│   ├── App.jsx          # Router setup and protected-route composition
│   ├── main.jsx         # React entry point
│   └── index.css        # Application styling
├── package.json
└── vite.config.js
```

### Important frontend files

- `frontend/src/App.jsx`:
  - Mounts the router.
  - Decides which pages are public or protected.
  - Renders the main shell for logged-in users.

- `frontend/src/lib/AuthContext.jsx`:
  - Central auth state.
  - Restores the session from the backend.
  - Handles login, signup, logout, and refresh logic.

- `frontend/src/lib/DataContext.jsx`:
  - Main finance data provider.
  - Loads profile, categories, and expenses.
  - Keeps optimistic UI behavior for add/update/delete operations.

- `frontend/src/lib/api.js`:
  - Central API client.
  - Attaches JWT tokens.
  - Handles 401 refresh flow automatically.
  - Keeps credentials for session cookies.

## 4) Backend structure

```text
backend/
├── config/              # DB connection and Mongo connection helpers
├── controllers/         # Route handlers for auth, profile, expenses, admin, etc.
├── middleware/          # Auth guard, admin guard, validation, error handling
├── models/              # Mongoose schemas for User, Expense, Category, Bill, etc.
├── routes/              # Express routers grouped by feature
├── services/            # AI and stats service logic
├── utils/               # Utility helpers for calculations and file detection
├── scripts/             # Seeders and migration scripts
├── tests/               # Integration tests using Vitest + Supertest
├── server.js            # App bootstrap and route mounting
├── package.json
└── README.md
```

### Important backend files

- `backend/server.js`:
  - Starts the API server.
  - Applies CORS, Helmet, and rate-limiting middleware.
  - Mounts feature routes like `/api/auth`, `/api/expenses`, `/api/admin`, and `/api/bills`.

- `backend/middleware/auth.js`:
  - Verifies the JWT access token.
  - Loads the user from MongoDB before continuing.
  - Protects routes that require authentication.

- `backend/models/User.js`:
  - Defines the user schema.
  - Stores email, password hash, roles, budget, and profile preferences.

- `backend/models/Expense.js`:
  - Defines expense data and ownership relationships.
  - Keeps data tied to a user so one user cannot access another user's records.

- `backend/services/aiService.js`:
  - Connects to Gemini.
  - Produces spending insights or chat answers using user-specific data.

## 5) Request flow in practice

A typical flow for adding an expense looks like this:

```text
User clicks “Add Expense”
        |
        v
React page calls DataContext.addEntry()
        |
        v
api.post('/api/expenses', payload)
        |
        v
Express route -> controller -> schema validation
        |
        v
MongoDB save to Expense collection
        |
        v
Response returns created expense
        |
        v
UI updates immediately (optimistic UI) and re-renders dashboard
```

This pattern is repeated across categories, profile updates, auth, and admin actions.

## 6) Security / data boundaries

The project intentionally enforces ownership and access boundaries:

- Tokens are short-lived access tokens plus refresh cookies.
- Requests are checked against the logged-in user.
- Every resource query is scoped to `req.user`.
- Profile updates do not accept privileged fields like `isAdmin` or `email`.
- The backend ensures users cannot read or modify other users' finances.

## 7) How to navigate this repo

If you want to understand the app quickly, read in this order:

1. `README.md` at the root
2. `backend/server.js`
3. `backend/routes/*`
4. `backend/controllers/*`
5. `frontend/src/App.jsx`
6. `frontend/src/lib/AuthContext.jsx`
7. `frontend/src/lib/DataContext.jsx`

That sequence gives you the full picture of how the app starts, how data moves, and how the UI is wired to the backend.

## 8) Design summary

This repo follows a clean full-stack pattern:

- Frontend: user experience and display logic
- Backend: auth, business logic, validation, data access
- Database: persistent records, ownership, and analytics data
- Services: AI and summary computations

Because each layer has a specific job, the codebase stays easier to maintain and easier to explain to new contributors.
