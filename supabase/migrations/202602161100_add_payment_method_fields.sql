alter table if exists public.generated_docs
  add column if not exists payment_method text,
  add column if not exists assignee_emp_code text,
  add column if not exists loan_doc_no text;

alter table if exists public.doc_jobs
  add column if not exists payment_method text,
  add column if not exists assignee_emp_code text,
  add column if not exists loan_doc_no text;

alter table if exists public.documents
  add column if not exists payment_method text,
  add column if not exists assignee_emp_code text,
  add column if not exists loan_doc_no text;

alter table if exists public.jobs
  add column if not exists payment_method text,
  add column if not exists assignee_emp_code text,
  add column if not exists loan_doc_no text;

alter table if exists public.generated_docs
  drop constraint if exists generated_docs_payment_method_check,
  add constraint generated_docs_payment_method_check
    check (payment_method in ('credit', 'advance', 'loan') or payment_method is null);

alter table if exists public.doc_jobs
  drop constraint if exists doc_jobs_payment_method_check,
  add constraint doc_jobs_payment_method_check
    check (payment_method in ('credit', 'advance', 'loan') or payment_method is null);

alter table if exists public.documents
  drop constraint if exists documents_payment_method_check,
  add constraint documents_payment_method_check
    check (payment_method in ('credit', 'advance', 'loan') or payment_method is null);

alter table if exists public.jobs
  drop constraint if exists jobs_payment_method_check,
  add constraint jobs_payment_method_check
    check (payment_method in ('credit', 'advance', 'loan') or payment_method is null);
