# Ledger — Backend (Supabase Database)

## Overview
This directory contains all backend database configuration for the **Ledger** personal finance app.

- **Database**: Supabase (Postgres)
- **Project URL**: `https://gpqejbwocvrtnfcxrdjk.supabase.co`
- **Authentication**: Supabase Auth (Email + Password)

---

## Files

| File | Description |
|------|------------|
| `schema.sql` | Complete database migration script — tables, RLS policies, triggers |
| `supabaseAdmin.js` | Server-side Supabase admin client (used by Next.js API routes) |

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User profile (email, joined_at, monthly_budget, currency) |
| `categories` | Expense categories per user (name, color, emoji) |
| `expenses` | Transaction logs (amount, category, note, spent_at) |
| `monthly_summaries` | Historical monthly spending records per user |

---

## Setup Instructions

1. Open your [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **SQL Editor**
3. Copy the contents of `schema.sql` and paste it into the editor
4. Click **Run** to create all tables, RLS policies, and triggers
5. Copy your **Project URL**, **anon key**, and **service_role key** from **Settings > API**
6. Paste them into `frontend/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://gpqejbwocvrtnfcxrdjk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```

---

## Row Level Security (RLS)

All tables have RLS enabled. Every policy enforces `user_id = auth.uid()` so users can only access their own data. No user can read or modify another user's records.

## Auto-Provisioning Trigger

When a new user signs up via Supabase Auth, the `handle_new_user()` trigger automatically:
1. Creates their `profiles` row with email and `joined_at` timestamp
2. Seeds 9 default expense categories (Food & Dining, Drinks & Milk, Shopping, etc.)
