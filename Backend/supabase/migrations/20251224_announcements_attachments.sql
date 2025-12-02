alter table if exists public.announcements
  add column if not exists attachment_url text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_size bigint,
  add column if not exists attachment_path text,
  add column if not exists target_recipient_emails text[],
  add column if not exists target_recipient_display_names text[];
