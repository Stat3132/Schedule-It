-- Allow locations to optionally store day-by-day operating hours
alter table if exists public.location
  add column if not exists hours_by_day jsonb;

comment on column public.location.hours_by_day is 'Operating hours per day keyed by weekday (e.g., monday: { opens_at, closes_at, closed }).';
