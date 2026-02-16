alter table if exists public.generated_docs
  add column if not exists receipt_date date;

alter table if exists public.doc_jobs
  add column if not exists receipt_date date;

alter table if exists public.documents
  add column if not exists receipt_date date;

alter table if exists public.jobs
  add column if not exists receipt_date date;
