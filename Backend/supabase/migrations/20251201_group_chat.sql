-- Group chat tables to back multi-participant messaging.
create table if not exists public.group_thread (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_thread_member (
  group_id uuid not null references public.group_thread (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_by uuid references auth.users (id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.group_message (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.group_thread (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists group_thread_member_user_idx
  on public.group_thread_member (user_id);

create index if not exists group_message_group_idx
  on public.group_message (group_id, created_at);

-- Updated-at helper
create or replace function public.touch_group_thread()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create or replace trigger trg_group_thread_updated
  before update on public.group_thread
  for each row
  execute function public.touch_group_thread();

alter table public.group_thread enable row level security;
alter table public.group_thread_member enable row level security;
alter table public.group_message enable row level security;

drop policy if exists "group_thread_select_members" on public.group_thread;
drop policy if exists "group_thread_insert_owner" on public.group_thread;
drop policy if exists "group_thread_member_select_self" on public.group_thread_member;
drop policy if exists "group_thread_member_insert_by_member" on public.group_thread_member;
drop policy if exists "group_message_select_members" on public.group_message;
drop policy if exists "group_message_insert_members" on public.group_message;

create or replace function public.ensure_policy(
  p_schema text,
  p_table text,
  p_policy text,
  p_sql text
)
returns void as $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = p_schema
      and tablename = p_table
      and policyname = p_policy
  ) then
    execute p_sql;
  end if;
end;
$$ language plpgsql;

select public.ensure_policy(
  'public',
  'group_thread',
  'group_thread_select_members',
  $sql$
    create policy "group_thread_select_members"
      on public.group_thread
      for select
      using (
        created_by = auth.uid()
        or exists (
          select 1
          from public.group_thread_member m
          where m.group_id = id
            and m.user_id = auth.uid()
        )
      )
  $sql$
);

select public.ensure_policy(
  'public',
  'group_thread',
  'group_thread_insert_owner',
  $sql$
    create policy "group_thread_insert_owner"
      on public.group_thread
      for insert
      with check (created_by = auth.uid())
  $sql$
);

select public.ensure_policy(
  'public',
  'group_thread_member',
  'group_thread_member_select_self',
  $sql$
    create policy "group_thread_member_select_self"
      on public.group_thread_member
      for select
      using (
        user_id = auth.uid()
        or exists (
          select 1 from public.group_thread
          where group_thread.id = group_id
            and group_thread.created_by = auth.uid()
        )
      )
  $sql$
);

select public.ensure_policy(
  'public',
  'group_thread_member',
  'group_thread_member_insert_by_member',
  $sql$
    create policy "group_thread_member_insert_by_member"
      on public.group_thread_member
      for insert
      with check (added_by = auth.uid())
  $sql$
);

select public.ensure_policy(
  'public',
  'group_message',
  'group_message_select_members',
  $sql$
    create policy "group_message_select_members"
      on public.group_message
      for select
      using (
        exists (
          select 1
          from public.group_thread_member m
          where m.group_id = group_id
            and m.user_id = auth.uid()
        )
      )
  $sql$
);

select public.ensure_policy(
  'public',
  'group_message',
  'group_message_insert_members',
  $sql$
    create policy "group_message_insert_members"
      on public.group_message
      for insert
      with check (
        exists (
          select 1
          from public.group_thread_member m
          where m.group_id = group_id
            and m.user_id = auth.uid()
        )
      )
  $sql$
);

drop function if exists public.ensure_policy(text, text, text, text);
