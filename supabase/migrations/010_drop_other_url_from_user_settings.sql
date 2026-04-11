-- Remove optional "other" link field (URLs live in linkedin_url, github_url, website_url only)
ALTER TABLE public.user_settings
  DROP COLUMN IF EXISTS other_url;
