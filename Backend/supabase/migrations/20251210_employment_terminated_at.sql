-- Adds termination bookkeeping columns for employment records.
-- Run `supabase db push` (or your usual migration process) after committing.

alter table public.employment
  add column if not exists terminated_at timestamptz,
  add column if not exists delete_after timestamptz;
