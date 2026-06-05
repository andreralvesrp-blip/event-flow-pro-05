
ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS attendant_name text,
  ADD COLUMN IF NOT EXISTS attendant_avatar_url text,
  ADD COLUMN IF NOT EXISTS attendant_online boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS privacy_policy_url text;
