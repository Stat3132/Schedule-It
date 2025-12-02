alter table if exists public.announcements
  add column if not exists target_recipient_emails text[],
  add column if not exists target_recipient_display_names text[];
