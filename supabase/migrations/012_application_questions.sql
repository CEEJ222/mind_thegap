-- Screening/application questions answered via RAG over JD + profile chunks + generated resume.
-- Reusable across web (/applications, /generate) and the Chrome side panel.

create table if not exists public.application_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,

  question_text text not null,
  answer_text text,

  answer_length text not null default 'medium' check (answer_length in ('short','medium','long')),
  tone text,
  word_limit int,

  source_chunk_ids uuid[] not null default '{}',
  source_resume_id uuid references public.generated_resumes(id) on delete set null,

  model text,
  prompt_version text,
  gaps text[] not null default '{}',
  confidence numeric,

  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists application_questions_app_idx
  on public.application_questions (application_id, position);
create index if not exists application_questions_user_idx
  on public.application_questions (user_id, created_at desc);

alter table public.application_questions enable row level security;

create policy "own application_questions select"
  on public.application_questions for select
  using (auth.uid() = user_id);

create policy "own application_questions insert"
  on public.application_questions for insert
  with check (auth.uid() = user_id);

create policy "own application_questions update"
  on public.application_questions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own application_questions delete"
  on public.application_questions for delete
  using (auth.uid() = user_id);

create or replace function public.set_application_questions_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_application_questions_updated_at on public.application_questions;
create trigger trg_application_questions_updated_at
  before update on public.application_questions
  for each row execute function public.set_application_questions_updated_at();
