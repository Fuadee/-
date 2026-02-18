alter table if exists public.generated_docs
  add column if not exists tax_id text;

alter table if exists public.doc_jobs
  add column if not exists tax_id text;

alter table if exists public.documents
  add column if not exists tax_id text;

alter table if exists public.jobs
  add column if not exists tax_id text;
