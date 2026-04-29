-- Harden generated_docs writes for RLS-safe inserts from authenticated users.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'generated_docs'
      and column_name = 'properties'
  ) then
    execute $stmt$
      alter table public.generated_docs
      alter column properties set default '{}'::jsonb
    $stmt$;

    execute $stmt$
      update public.generated_docs
      set properties = '{}'::jsonb
      where properties is null
    $stmt$;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'generated_docs'
      and column_name = 'created_by'
  ) then
    execute $policy$
      create policy "generated_docs_insert_authenticated_created_by"
      on public.generated_docs
      for insert
      to authenticated
      with check (created_by = auth.uid()::text)
    $policy$;
  end if;
exception
  when duplicate_object then
    null;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'generated_docs'
      and column_name = 'user_id'
  ) then
    execute $policy$
      create policy "generated_docs_insert_authenticated_user_id"
      on public.generated_docs
      for insert
      to authenticated
      with check (user_id = auth.uid())
    $policy$;

    execute $policy$
      create policy "generated_docs_select_authenticated_user_id"
      on public.generated_docs
      for select
      to authenticated
      using (user_id = auth.uid())
    $policy$;
  end if;
exception
  when duplicate_object then
    null;
end
$$;
