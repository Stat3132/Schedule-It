-- Messaging privacy + moderation helpers.

-- Blocked users table ensures direct messages can be restricted.
create table if not exists public.blocked_user (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocked_user_no_self check (blocker_id <> blocked_id)
);

create index if not exists blocked_user_blocked_idx
  on public.blocked_user (blocked_id);

alter table public.blocked_user enable row level security;

drop policy if exists "blocked_user_select_visible" on public.blocked_user;
drop policy if exists "blocked_user_insert_self" on public.blocked_user;
drop policy if exists "blocked_user_delete_self" on public.blocked_user;

create policy "blocked_user_select_visible"
  on public.blocked_user
  for select
  using (blocker_id = auth.uid() or blocked_id = auth.uid());

create policy "blocked_user_insert_self"
  on public.blocked_user
  for insert
  with check (blocker_id = auth.uid());

create policy "blocked_user_delete_self"
  on public.blocked_user
  for delete
  using (blocker_id = auth.uid());

-- Muted threads allow users to silence peers or groups locally.
create table if not exists public.muted_thread (
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_type text not null check (thread_type in ('dm', 'group')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, thread_type, target_id)
);

create index if not exists muted_thread_target_idx
  on public.muted_thread (thread_type, target_id);

alter table public.muted_thread enable row level security;

drop policy if exists "muted_thread_select_self" on public.muted_thread;
drop policy if exists "muted_thread_mutate_self" on public.muted_thread;

create policy "muted_thread_select_self"
  on public.muted_thread
  for select
  using (user_id = auth.uid());

create policy "muted_thread_mutate_self"
  on public.muted_thread
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Helper to collapse groups that shrink below 3 members.
create or replace function public.trim_group_size(p_group_id uuid)
returns void
language plpgsql
security definer set search_path = public as $$
declare
  member_count integer;
begin
  select count(*) into member_count
  from public.group_thread_member
  where group_id = p_group_id;

  if member_count <= 2 then
    delete from public.group_thread where id = p_group_id;
  end if;
end;
$$;

-- Allow members to leave groups and enforce cleanup rules.
create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer set search_path = public as $$
begin
  delete from public.group_thread_member
  where group_id = p_group_id
    and user_id = auth.uid();

  if not found then
    raise exception 'not a member of this group';
  end if;

  perform public.trim_group_size(p_group_id);
end;
$$;

-- Allow group creators to remove specific members.
create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public as $$
begin
  if not exists (
    select 1
    from public.group_thread
    where id = p_group_id
      and created_by = auth.uid()
  ) then
    raise exception 'only the creator can remove members';
  end if;

  delete from public.group_thread_member
  where group_id = p_group_id
    and user_id = p_user_id;

  perform public.trim_group_size(p_group_id);
end;
$$;

-- Allow group creators to delete a group outright.
create or replace function public.delete_group_thread(p_group_id uuid)
returns void
language plpgsql
security definer set search_path = public as $$
begin
  delete from public.group_thread
  where id = p_group_id
    and created_by = auth.uid();

  if not found then
    raise exception 'only the creator can delete this group';
  end if;
end;
$$;

-- Prevent blocked users from exchanging direct messages.
create or replace function public.prevent_blocked_dm()
returns trigger
language plpgsql as $$
begin
  if exists (
    select 1
    from public.blocked_user
    where (blocker_id = new.recipient_id and blocked_id = new.sender_id)
       or (blocker_id = new.sender_id and blocked_id = new.recipient_id)
  ) then
    raise exception 'messaging is blocked between these users';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_blocked_dm on public.message;
create trigger trg_prevent_blocked_dm
  before insert on public.message
  for each row
  execute function public.prevent_blocked_dm();
