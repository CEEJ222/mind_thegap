-- Migration: Add source_document_id to profile_entries for cascade delete
-- Also add 'skills' to the entry_type enum
-- Run this in Supabase Dashboard > SQL Editor

-- Add source_document_id column
ALTER TABLE public.profile_entries
  ADD COLUMN IF NOT EXISTS source_document_id uuid REFERENCES public.uploaded_documents(id) ON DELETE SET NULL;

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_profile_entries_source_doc ON public.profile_entries(source_document_id);
