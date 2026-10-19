-- Ferienkasse 1.3: Kategorien – ausschliesslich im Supabase-Testprojekt ausführen.
create table if not exists public.fk_categories(
 id uuid primary key default gen_random_uuid(),
 trip_id uuid not null references public.fk_trips(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 60),
 unique(trip_id,name)
);
alter table public.fk_categories enable row level security;
create policy fk_categories_read on public.fk_categories for select to authenticated using(public.fk_is_member(trip_id));
create policy fk_categories_create on public.fk_categories for insert to authenticated with check(public.fk_is_member(trip_id));
create policy fk_categories_edit on public.fk_categories for update to authenticated using(public.fk_is_member(trip_id)) with check(public.fk_is_member(trip_id));
create policy fk_categories_remove on public.fk_categories for delete to authenticated using(public.fk_is_member(trip_id));
grant select,insert,update,delete on public.fk_categories to authenticated;
revoke all on public.fk_categories from anon;
alter table public.fk_expenses add column if not exists category text;
insert into public.fk_categories(trip_id,name)
select t.id,c.name from public.fk_trips t
cross join (values ('Restaurant'),('Unterkunft'),('Einkauf'),('Transport'),('Aktivitäten'),('Diverses')) c(name)
on conflict(trip_id,name) do nothing;
update public.fk_expenses set category='Diverses' where category is null;
alter table public.fk_expenses alter column category set default 'Diverses';
alter table public.fk_expenses alter column category set not null;
-- Kategorien konsistent halten: Umbenennung aktualisiert Ausgaben; benutzte Kategorien nicht löschen.
create or replace function public.fk_category_rename() returns trigger language plpgsql set search_path=''
as $$ begin
 if new.trip_id<>old.trip_id then raise exception 'Cannot move category'; end if;
 if new.name<>old.name then update public.fk_expenses set category=new.name where trip_id=old.trip_id and category=old.name; end if;
 return new;
end; $$;
drop trigger if exists fk_category_rename_trigger on public.fk_categories;
create trigger fk_category_rename_trigger after update on public.fk_categories for each row execute function public.fk_category_rename();
create or replace function public.fk_category_guard() returns trigger language plpgsql set search_path=''
as $$ begin
 if exists(select 1 from public.fk_expenses where trip_id=old.trip_id and category=old.name) then raise exception 'Category is in use'; end if;
 return old;
end; $$;
drop trigger if exists fk_category_guard_trigger on public.fk_categories;
create trigger fk_category_guard_trigger before delete on public.fk_categories for each row execute function public.fk_category_guard();
create or replace function public.fk_save_categorized_expense(
 p_trip uuid,p_expense uuid,p_payer uuid,p_description text,
 p_amount_cents bigint,p_date date,p_people uuid[],p_category text
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;v_count int;v_i int;v_person uuid;v_owner uuid;v_category text;
begin
 if auth.uid() is null or not public.fk_is_member(p_trip) then raise exception 'Not a trip member'; end if;
 if p_description is null or length(trim(p_description)) not between 1 and 500
 or p_amount_cents is null or p_amount_cents <= 0 or p_date is null then
  raise exception 'Invalid expense';
 end if;
 if not exists(select 1 from public.fk_people where id=p_payer and trip_id=p_trip) then raise exception 'Invalid payer'; end if;
 select count(distinct x),count(x) into v_count,v_i from unnest(p_people) x;
 if v_count=0 or v_count<>v_i or v_count>1000 then raise exception 'Select one or more distinct participants'; end if;
 if (select count(*) from public.fk_people where trip_id=p_trip and id=any(p_people))<>v_count then
  raise exception 'Participants must belong to trip';
 end if;
 v_category:=trim(coalesce(p_category,''));
 if not exists(select 1 from public.fk_categories where trip_id=p_trip and name=v_category) then raise exception 'Invalid category'; end if;
 if p_expense is null then
  insert into public.fk_expenses(trip_id,person_id,description,amount_cents,currency,expense_date,created_by,category)
  select p_trip,p_payer,trim(p_description),p_amount_cents,t.currency,p_date,auth.uid(),v_category
  from public.fk_trips t where t.id=p_trip returning id into v_id;
 else
  select id into v_id from public.fk_expenses where id=p_expense and trip_id=p_trip for update;
  if v_id is null then raise exception 'Expense not found'; end if;
  update public.fk_expenses set person_id=p_payer,description=trim(p_description),
   amount_cents=p_amount_cents,expense_date=p_date,category=v_category where id=v_id;
 end if;
 delete from public.fk_expense_splits where expense_id=v_id;
 for v_i in 1..v_count loop
  v_person:=p_people[v_i];
  insert into public.fk_expense_splits(expense_id,person_id,amount_cents)
  values(v_id,v_person,p_amount_cents/v_count + case when v_i<=p_amount_cents%v_count then 1 else 0 end);
 end loop;
 return v_id;
end;
$$;

revoke all on function public.fk_save_categorized_expense(uuid,uuid,uuid,text,bigint,date,uuid[],text) from public,anon;
grant execute on function public.fk_save_categorized_expense(uuid,uuid,uuid,text,bigint,date,uuid[],text) to authenticated;
-- Neue Reisen bekommen Standardkategorien.
create or replace function public.fk_seed_categories() returns trigger language plpgsql security definer set search_path=''
as $$ begin
 insert into public.fk_categories(trip_id,name)
 select new.id,x.name from (values ('Restaurant'),('Unterkunft'),('Einkauf'),('Transport'),('Aktivitäten'),('Diverses')) x(name);
 return new;
end; $$;
drop trigger if exists fk_seed_categories_trigger on public.fk_trips;
create trigger fk_seed_categories_trigger after insert on public.fk_trips for each row execute function public.fk_seed_categories();
-- Realtime für gemeinsame Kategorieverwaltung.
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='fk_categories') then
  alter publication supabase_realtime add table public.fk_categories;
 end if;
end $$;
