-- Add AI-generated profile summary to users table
-- Run this in Supabase Dashboard > SQL Editor

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS profile_summary text;
