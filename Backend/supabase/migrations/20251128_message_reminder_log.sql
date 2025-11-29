-- Create a table that tracks how many automated reminders an employee has sent to a given peer for a
-- specific request. This is used by the messaging UI to throttle reminder spam.
create table if not exists public.message_reminder_log (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid references business (id) on delete cascade,
  request_type text not null,
  request_identifier text not null,
  send_count integer not null default 1 check (send_count >= 0),
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_reminder_log_unique unique (sender_id, recipient_id, request_type, request_identifier)
);

create index if not exists message_reminder_log_sender_idx
  on public.message_reminder_log (sender_id, recipient_id);
