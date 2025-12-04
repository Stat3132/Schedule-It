-- Drop old min_skill_level column now replaced by description
ALTER TABLE public.role
DROP COLUMN IF EXISTS min_skill_level;
