alter table if exists public.generated_docs
  add column if not exists revision_note text,
  add column if not exists revision_requested_at timestamptz,
  add column if not exists revision_requested_by uuid;

alter table if exists public.doc_jobs
  add column if not exists revision_note text,
  add column if not exists revision_requested_at timestamptz,
  add column if not exists revision_requested_by uuid;

alter table if exists public.documents
  add column if not exists revision_note text,
  add column if not exists revision_requested_at timestamptz,
  add column if not exists revision_requested_by uuid;

alter table if exists public.jobs
  add column if not exists revision_note text,
  add column if not exists revision_requested_at timestamptz,
  add column if not exists revision_requested_by uuid;
