-- ============================================================
-- Migration 007: Jobs Engine — new tables, enums, RLS policies
-- ============================================================

-- 1. New enums
CREATE TYPE job_status AS ENUM ('unseen', 'saved', 'dismissed', 'applied');
CREATE TYPE api_key_type AS ENUM ('apify', 'openrouter');

-- 2. jobs — global table, one row per LinkedIn job
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  title TEXT,
  company_name TEXT,
  company_linkedin_url TEXT,
  company_logo TEXT,
  company_description TEXT,
  company_website TEXT,
  company_employees_count INTEGER,
  location TEXT,
  salary_info JSONB,
  posted_at TIMESTAMPTZ,
  employment_type TEXT,
  seniority_level TEXT,
  job_function TEXT,
  industries TEXT[],
  description_text TEXT,
  description_html TEXT,
  apply_url TEXT,
  applicants_count INTEGER,
  job_poster_name TEXT,
  job_poster_title TEXT,
  job_poster_profile_url TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read jobs"
  ON jobs FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_jobs_company ON jobs (company_name);
CREATE INDEX idx_jobs_posted ON jobs (posted_at DESC);

CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. search_cache — caches Apify scrape results per search URL
CREATE TABLE search_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_url_hash TEXT UNIQUE NOT NULL,
  search_url TEXT NOT NULL,
  job_ids TEXT[] NOT NULL,
  result_count INTEGER NOT NULL DEFAULT 0,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE search_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read search_cache"
  ON search_cache FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_search_cache_hash ON search_cache (search_url_hash);
CREATE INDEX idx_search_cache_expires ON search_cache (expires_at);

-- 4. user_saved_searches — per-user saved search parameters
CREATE TABLE user_saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  search_url TEXT NOT NULL,
  search_url_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_saved_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own saved searches"
  ON user_saved_searches FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_saved_searches_user ON user_saved_searches (user_id);
CREATE INDEX idx_saved_searches_hash ON user_saved_searches (search_url_hash);

CREATE TRIGGER update_user_saved_searches_updated_at
  BEFORE UPDATE ON user_saved_searches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. user_jobs — junction table linking users to jobs with per-user state
CREATE TABLE user_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  search_id UUID REFERENCES user_saved_searches(id) ON DELETE SET NULL,
  status job_status NOT NULL DEFAULT 'unseen',
  fit_score REAL,
  resume_id UUID REFERENCES generated_resumes(id) ON DELETE SET NULL,
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, job_id)
);

ALTER TABLE user_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own user_jobs"
  ON user_jobs FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_user_jobs_user ON user_jobs (user_id);
CREATE INDEX idx_user_jobs_job ON user_jobs (job_id);
CREATE INDEX idx_user_jobs_status ON user_jobs (user_id, status);

CREATE TRIGGER update_user_jobs_updated_at
  BEFORE UPDATE ON user_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 6. user_api_keys — encrypted BYOK API keys
CREATE TABLE user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_type api_key_type NOT NULL,
  encrypted_value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, key_type)
);

ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own api keys"
  ON user_api_keys FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_user_api_keys_user ON user_api_keys (user_id);

CREATE TRIGGER update_user_api_keys_updated_at
  BEFORE UPDATE ON user_api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
