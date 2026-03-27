-- Add company_description to profile_entries
-- Run this in Supabase Dashboard > SQL Editor

ALTER TABLE public.profile_entries
  ADD COLUMN IF NOT EXISTS company_description text;
