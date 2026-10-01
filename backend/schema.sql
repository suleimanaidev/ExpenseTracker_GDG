-- ═══════════════════════════════════════════════════════════════════════════════
-- Ledger — Supabase Backend Database Schema & RLS Setup Script
-- Project URL: https://gpqejbwocvrtnfcxrdjk.supabase.co
-- Paste and run this script in your Supabase SQL Editor (https://supabase.com/dashboard)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Create PROFILES Table (User metadata, signup date, budget, currency)
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  full_name text,
  is_admin boolean default false,
  joined_at timestamptz default now(),
  monthly_budget numeric default 50000,
  currency text default 'PKR',
  created_at timestamptz default now()
);

-- 2. Create CATEGORIES Table (User expense categories)
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  color text default '#00A19B',
  emoji text default '📦',
  created_at timestamptz default now()
);

-- 3. Create EXPENSES Table (Transaction logs)
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  amount numeric not null check (amount >= 0),
  category_id uuid references public.categories on delete set null,
  category text not null,
  note text default '',
  spent_at timestamptz default now(),
  created_at timestamptz default now()
);

-- 4. Create MONTHLY_SUMMARIES Table (Historical monthly financial records per user)
create table if not exists public.monthly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  year_month text not null,
  total_spent numeric default 0,
  budget_limit numeric default 50000,
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(user_id, year_month)
);

-- 5. Enable Row Level Security (RLS) on All Tables
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.expenses enable row level security;
alter table public.monthly_summaries enable row level security;

-- 6. RLS Policies for PROFILES Table
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can delete own profile" on public.profiles for delete using (auth.uid() = id);

-- 7. RLS Policies for CATEGORIES Table
create policy "Users can view own categories" on public.categories for select using (auth.uid() = user_id);
create policy "Users can insert own categories" on public.categories for insert with check (auth.uid() = user_id);
create policy "Users can update own categories" on public.categories for update using (auth.uid() = user_id);
create policy "Users can delete own categories" on public.categories for delete using (auth.uid() = user_id);

-- 8. RLS Policies for EXPENSES Table
create policy "Users can view own expenses" on public.expenses for select using (auth.uid() = user_id);
create policy "Users can insert own expenses" on public.expenses for insert with check (auth.uid() = user_id);
create policy "Users can update own expenses" on public.expenses for update using (auth.uid() = user_id);
create policy "Users can delete own expenses" on public.expenses for delete using (auth.uid() = user_id);

-- 9. RLS Policies for MONTHLY_SUMMARIES Table
create policy "Users can view own monthly summaries" on public.monthly_summaries for select using (auth.uid() = user_id);
create policy "Users can insert own monthly summaries" on public.monthly_summaries for insert with check (auth.uid() = user_id);
create policy "Users can update own monthly summaries" on public.monthly_summaries for update using (auth.uid() = user_id);
create policy "Users can delete own monthly summaries" on public.monthly_summaries for delete using (auth.uid() = user_id);

-- 10. Trigger Function: Automatically record Profile & Default Categories on Signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Create default profile with email and signup date
  insert into public.profiles (id, email, full_name, is_admin, joined_at, monthly_budget, currency)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    false,
    new.created_at,
    50000,
    'PKR'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, profiles.full_name);

  -- Create default categories
  insert into public.categories (user_id, name, color, emoji) values
    (new.id, 'Food & Dining', '#E07A5F', '🍕'),
    (new.id, 'Drinks & Milk', '#4EA8DE', '🥛'),
    (new.id, 'Shopping', '#F2CC8F', '🛍️'),
    (new.id, 'Housing', '#81B29A', '🏠'),
    (new.id, 'Utilities', '#3D405B', '⚡'),
    (new.id, 'Transport', '#6B705C', '🚗'),
    (new.id, 'Entertainment', '#9B5DE5', '🎬'),
    (new.id, 'Health', '#00A19B', '💊'),
    (new.id, 'Other', '#747982', '📦');

  return new;
end;
$$;

-- Drop trigger if already exists and recreate
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
