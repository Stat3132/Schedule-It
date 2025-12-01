-- Add delivery and read receipt metadata for direct messages.
alter table if exists public.message
  add column if not exists delivered_at timestamptz not null default now(),
  add column if not exists read_at timestamptz null;

create index if not exists message_recipient_read_idx
  on public.message (recipient_id, read_at);

create index if not exists message_sender_read_idx
  on public.message (sender_id, read_at);
