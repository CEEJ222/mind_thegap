-- Add contact info fields to user_settings
-- Run this in Supabase Dashboard > SQL Editor

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS location text;
