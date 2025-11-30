-- Supports assigning multiple roles to a single employment record.
-- Run `supabase db push` (or your usual migration process) after committing.

create table if not exists public.employment_roles (
  id uuid not null default gen_random_uuid(),
  employment_id uuid not null references public.employment(id) on delete cascade,
  role_id uuid not null references public.role(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint employment_roles_pkey primary key (id),
  constraint employment_roles_employment_role_key unique (employment_id, role_id)
);

create index if not exists employment_roles_employment_id_idx on public.employment_roles(employment_id);
create index if not exists employment_roles_role_id_idx on public.employment_roles(role_id);

insert into public.employment_roles (employment_id, role_id)
select id, role_id
from public.employment
where role_id is not null
on conflict (employment_id, role_id) do nothing;
