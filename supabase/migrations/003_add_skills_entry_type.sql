-- Add 'skills' to the entry_type enum
-- Run this in Supabase Dashboard > SQL Editor

ALTER TYPE entry_type ADD VALUE IF NOT EXISTS 'skills';
