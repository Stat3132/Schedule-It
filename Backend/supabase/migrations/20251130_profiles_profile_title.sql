-- Adds a persistent column for employee profile descriptions/bios.
-- Run `supabase db push` (or your usual migration process) after committing.

alter table public.profiles
  add column if not exists profile_title text;

-- Backfill from legacy auth metadata so existing bios are preserved.
update public.profiles as p
set profile_title = nullif(trim(au.raw_user_meta_data ->> 'profile_title'), '')
from auth.users as au
where au.id = p.id
  and p.profile_title is null
  and nullif(trim(au.raw_user_meta_data ->> 'profile_title'), '') is not null;
