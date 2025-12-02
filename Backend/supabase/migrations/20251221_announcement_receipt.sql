create table if not exists public.announcement_receipt (
    id uuid primary key default gen_random_uuid(),
    announcement_id uuid not null references public.announcements(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    read_at timestamptz not null default timezone('utc', now()),
    created_at timestamptz not null default timezone('utc', now()),
    constraint announcement_receipt_unique unique (announcement_id, user_id)
);

create index if not exists announcement_receipt_user_idx
    on public.announcement_receipt(user_id);

create index if not exists announcement_receipt_announcement_idx
    on public.announcement_receipt(announcement_id);
