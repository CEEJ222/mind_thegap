-- Mind the Gap — Initial Database Schema
-- Run this in Supabase Dashboard > SQL Editor

-- ============================================================
-- 1. Enable required extensions
-- ============================================================
create extension if not exists vector with schema extensions;

-- ============================================================
-- 2. Custom types
-- ============================================================
create type entry_type as enum ('job', 'project', 'education', 'award', 'certification');
create type entry_source as enum ('resume_upload', 'url_scrape', 'manual_entry', 'gap_fill');
create type output_format as enum ('docx', 'pdf');
create type resume_length as enum ('1_page', '1_5_pages', '2_pages', 'no_max');
create type theme_mode as enum ('light', 'dark');
create type interview_status as enum ('pending', 'yes', 'no');
create type score_tier as enum ('strong', 'weak', 'none');
create type document_type as enum ('resume', 'project_writeup', 'biz_case', 'award', 'certification', 'performance_review', 'other');
create type processing_status as enum ('pending', 'processing', 'completed', 'failed');

-- ============================================================
-- 3. Users table (extends Supabase auth.users)
-- ============================================================
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 4. User settings
-- ============================================================
create table public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  output_format output_format not null default 'pdf',
  include_summary boolean not null default true,
  resume_length resume_length not null default '1_page',
  theme theme_mode not null default 'light',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

-- ============================================================
-- 5. Profile entries (jobs, projects, education, awards, certs)
-- ============================================================
create table public.profile_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  entry_type entry_type not null,
  company_name text,
  job_title text,
  description text,
  date_start date,
  date_end date,
  industry text,
  domain text,
  source entry_source not null default 'manual_entry',
  user_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 6. Profile chunks (bullets with embeddings)
-- ============================================================
create table public.profile_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  entry_id uuid not null references public.profile_entries(id) on delete cascade,
  chunk_text text not null,
  embedding extensions.vector(1536),
  -- Denormalized fields for fast filtering
  company_name text,
  job_title text,
  date_start date,
  date_end date,
  industry text,
  domain text,
  entry_type entry_type,
  source entry_source,
  user_confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 7. Uploaded documents tracking
-- ============================================================
create table public.uploaded_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_type text not null,
  document_type document_type,
  processing_status processing_status not null default 'pending',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 8. Scraped URLs tracking
-- ============================================================
create table public.scraped_urls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  url text not null,
  url_type text,
  processing_status processing_status not null default 'pending',
  scraped_content text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 9. Applications (JD tracker)
-- ============================================================
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  company_name text,
  job_title text,
  jd_text text not null,
  fit_score integer check (fit_score >= 0 and fit_score <= 100),
  interview_converted interview_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 10. Application themes (gap analysis results)
-- ============================================================
create table public.application_themes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  theme_name text not null,
  theme_weight real not null default 0.5 check (theme_weight >= 0 and theme_weight <= 1),
  score_tier score_tier not null default 'none',
  score_numeric integer not null default 0 check (score_numeric >= 0 and score_numeric <= 100),
  explanation text,
  evidence_chunk_ids uuid[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 11. Generated resumes
-- ============================================================
create table public.generated_resumes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  file_path text,
  format output_format not null default 'pdf',
  length_setting resume_length not null default '1_page',
  summary_included boolean not null default true,
  editorial_notes jsonb default '{}',
  version integer not null default 1,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 12. Indexes
-- ============================================================

-- Profile entries
create index idx_profile_entries_user on public.profile_entries(user_id);
create index idx_profile_entries_type on public.profile_entries(entry_type);
create index idx_profile_entries_company on public.profile_entries(company_name);

-- Profile chunks
create index idx_profile_chunks_user on public.profile_chunks(user_id);
create index idx_profile_chunks_entry on public.profile_chunks(entry_id);
create index idx_profile_chunks_company on public.profile_chunks(company_name);
create index idx_profile_chunks_dates on public.profile_chunks(date_start, date_end);

-- HNSW index for vector similarity search
create index idx_profile_chunks_embedding on public.profile_chunks
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Applications
create index idx_applications_user on public.applications(user_id);
create index idx_applications_created on public.applications(created_at desc);

-- Application themes
create index idx_application_themes_app on public.application_themes(application_id);

-- Generated resumes
create index idx_generated_resumes_app on public.generated_resumes(application_id);
create index idx_generated_resumes_user on public.generated_resumes(user_id);

-- Uploaded documents
create index idx_uploaded_documents_user on public.uploaded_documents(user_id);

-- Scraped URLs
create index idx_scraped_urls_user on public.scraped_urls(user_id);

-- ============================================================
-- 13. Row Level Security (RLS)
-- ============================================================

alter table public.users enable row level security;
alter table public.user_settings enable row level security;
alter table public.profile_entries enable row level security;
alter table public.profile_chunks enable row level security;
alter table public.uploaded_documents enable row level security;
alter table public.scraped_urls enable row level security;
alter table public.applications enable row level security;
alter table public.application_themes enable row level security;
alter table public.generated_resumes enable row level security;

-- Users: can read/update own row
create policy "Users can view own profile"
  on public.users for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.users for update using (auth.uid() = id);
create policy "Users can insert own profile"
  on public.users for insert with check (auth.uid() = id);

-- User settings: full CRUD on own settings
create policy "Users can view own settings"
  on public.user_settings for select using (auth.uid() = user_id);
create policy "Users can insert own settings"
  on public.user_settings for insert with check (auth.uid() = user_id);
create policy "Users can update own settings"
  on public.user_settings for update using (auth.uid() = user_id);
create policy "Users can delete own settings"
  on public.user_settings for delete using (auth.uid() = user_id);

-- Profile entries: full CRUD on own entries
create policy "Users can view own profile entries"
  on public.profile_entries for select using (auth.uid() = user_id);
create policy "Users can insert own profile entries"
  on public.profile_entries for insert with check (auth.uid() = user_id);
create policy "Users can update own profile entries"
  on public.profile_entries for update using (auth.uid() = user_id);
create policy "Users can delete own profile entries"
  on public.profile_entries for delete using (auth.uid() = user_id);

-- Profile chunks: full CRUD on own chunks
create policy "Users can view own profile chunks"
  on public.profile_chunks for select using (auth.uid() = user_id);
create policy "Users can insert own profile chunks"
  on public.profile_chunks for insert with check (auth.uid() = user_id);
create policy "Users can update own profile chunks"
  on public.profile_chunks for update using (auth.uid() = user_id);
create policy "Users can delete own profile chunks"
  on public.profile_chunks for delete using (auth.uid() = user_id);

-- Uploaded documents: full CRUD on own documents
create policy "Users can view own documents"
  on public.uploaded_documents for select using (auth.uid() = user_id);
create policy "Users can insert own documents"
  on public.uploaded_documents for insert with check (auth.uid() = user_id);
create policy "Users can update own documents"
  on public.uploaded_documents for update using (auth.uid() = user_id);
create policy "Users can delete own documents"
  on public.uploaded_documents for delete using (auth.uid() = user_id);

-- Scraped URLs: full CRUD on own URLs
create policy "Users can view own scraped urls"
  on public.scraped_urls for select using (auth.uid() = user_id);
create policy "Users can insert own scraped urls"
  on public.scraped_urls for insert with check (auth.uid() = user_id);
create policy "Users can update own scraped urls"
  on public.scraped_urls for update using (auth.uid() = user_id);
create policy "Users can delete own scraped urls"
  on public.scraped_urls for delete using (auth.uid() = user_id);

-- Applications: full CRUD on own applications
create policy "Users can view own applications"
  on public.applications for select using (auth.uid() = user_id);
create policy "Users can insert own applications"
  on public.applications for insert with check (auth.uid() = user_id);
create policy "Users can update own applications"
  on public.applications for update using (auth.uid() = user_id);
create policy "Users can delete own applications"
  on public.applications for delete using (auth.uid() = user_id);

-- Application themes: access via application ownership
create policy "Users can view own application themes"
  on public.application_themes for select using (
    application_id in (
      select id from public.applications where user_id = auth.uid()
    )
  );
create policy "Users can insert own application themes"
  on public.application_themes for insert with check (
    application_id in (
      select id from public.applications where user_id = auth.uid()
    )
  );
create policy "Users can update own application themes"
  on public.application_themes for update using (
    application_id in (
      select id from public.applications where user_id = auth.uid()
    )
  );
create policy "Users can delete own application themes"
  on public.application_themes for delete using (
    application_id in (
      select id from public.applications where user_id = auth.uid()
    )
  );

-- Generated resumes: full CRUD on own resumes
create policy "Users can view own generated resumes"
  on public.generated_resumes for select using (auth.uid() = user_id);
create policy "Users can insert own generated resumes"
  on public.generated_resumes for insert with check (auth.uid() = user_id);
create policy "Users can update own generated resumes"
  on public.generated_resumes for update using (auth.uid() = user_id);
create policy "Users can delete own generated resumes"
  on public.generated_resumes for delete using (auth.uid() = user_id);

-- ============================================================
-- 14. Functions
-- ============================================================

-- Auto-create user profile and settings on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', '')
  );
  insert into public.user_settings (user_id)
  values (new.id);
  return new;
end;
$$;

-- Trigger on auth.users insert
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-update updated_at timestamp
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply updated_at triggers
create trigger update_users_updated_at
  before update on public.users
  for each row execute function public.update_updated_at();

create trigger update_user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.update_updated_at();

create trigger update_profile_entries_updated_at
  before update on public.profile_entries
  for each row execute function public.update_updated_at();

create trigger update_uploaded_documents_updated_at
  before update on public.uploaded_documents
  for each row execute function public.update_updated_at();

create trigger update_scraped_urls_updated_at
  before update on public.scraped_urls
  for each row execute function public.update_updated_at();

create trigger update_applications_updated_at
  before update on public.applications
  for each row execute function public.update_updated_at();

create trigger update_application_themes_updated_at
  before update on public.application_themes
  for each row execute function public.update_updated_at();

-- Semantic similarity search function
create or replace function public.match_profile_chunks(
  query_embedding extensions.vector(1536),
  match_threshold float default 0.7,
  match_count int default 20,
  filter_user_id uuid default null,
  filter_company text default null,
  filter_entry_type entry_type default null
)
returns table (
  id uuid,
  entry_id uuid,
  chunk_text text,
  company_name text,
  job_title text,
  date_start date,
  date_end date,
  industry text,
  domain text,
  entry_type entry_type,
  source entry_source,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    pc.id,
    pc.entry_id,
    pc.chunk_text,
    pc.company_name,
    pc.job_title,
    pc.date_start,
    pc.date_end,
    pc.industry,
    pc.domain,
    pc.entry_type,
    pc.source,
    1 - (pc.embedding <=> query_embedding) as similarity
  from public.profile_chunks pc
  where
    (filter_user_id is null or pc.user_id = filter_user_id)
    and (filter_company is null or pc.company_name ilike '%' || filter_company || '%')
    and (filter_entry_type is null or pc.entry_type = filter_entry_type)
    and 1 - (pc.embedding <=> query_embedding) > match_threshold
  order by pc.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- ============================================================
-- 15. Storage bucket for resumes and uploads
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  10485760, -- 10MB
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes',
  'resumes',
  false,
  10485760, -- 10MB
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
);

-- Storage policies: users can manage their own files
create policy "Users can upload own documents"
  on storage.objects for insert
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can view own documents"
  on storage.objects for select
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete own documents"
  on storage.objects for delete
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can upload own resumes"
  on storage.objects for insert
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can view own resumes"
  on storage.objects for select
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete own resumes"
  on storage.objects for delete
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
