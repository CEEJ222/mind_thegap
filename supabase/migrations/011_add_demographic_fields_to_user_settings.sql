-- Voluntary demographic fields for job applications (EEO-style self-ID)
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS pronouns text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS race_ethnicity text,
  ADD COLUMN IF NOT EXISTS hispanic_latinx text,
  ADD COLUMN IF NOT EXISTS veteran_status text,
  ADD COLUMN IF NOT EXISTS disability_status text;
