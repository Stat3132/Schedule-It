-- Add description column to role table
ALTER TABLE public.role
ADD COLUMN IF NOT EXISTS description text;
