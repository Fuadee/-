alter table if exists public.generated_docs
  add column if not exists return_from_status text,
  add column if not exists revision_phase text,
  add column if not exists revision_count integer not null default 0;

alter table if exists public.doc_jobs
  add column if not exists return_from_status text,
  add column if not exists revision_phase text,
  add column if not exists revision_count integer not null default 0;

alter table if exists public.documents
  add column if not exists return_from_status text,
  add column if not exists revision_phase text,
  add column if not exists revision_count integer not null default 0;

alter table if exists public.jobs
  add column if not exists return_from_status text,
  add column if not exists revision_phase text,
  add column if not exists revision_count integer not null default 0;
