-- Ferienkasse 1.3: Realtime nur im Testprojekt aktivieren.
-- RLS bleibt unveraendert. Die Clients abonnieren ausschliesslich ihre Reise.
do $$
declare t text;
begin
 foreach t in array array['fk_people','fk_expenses','fk_settlements'] loop
  if not exists (
   select 1 from pg_publication_tables
   where pubname='supabase_realtime' and schemaname='public' and tablename=t
  ) then
   execute format('alter publication supabase_realtime add table public.%I',t);
  end if;
 end loop;
end $$;
-- Auch DELETE-Ereignisse sollen den Reisebezug (trip_id) enthalten.
alter table public.fk_people replica identity full;
alter table public.fk_expenses replica identity full;
alter table public.fk_settlements replica identity full;
