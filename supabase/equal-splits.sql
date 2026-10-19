-- Ferienkasse 1.3: Gleichmaessige Aufteilung (nur Testprojekt).
-- Alte Ausgaben bleiben unveraendert und erhalten keine erfundene Aufteilung.
create table if not exists public.fk_expense_splits(
 expense_id uuid not null references public.fk_expenses(id) on delete cascade,
 person_id uuid not null references public.fk_people(id),
 amount_cents bigint not null check(amount_cents >= 0),
 primary key(expense_id,person_id)
);
alter table public.fk_expense_splits enable row level security;
drop policy if exists fk_splits_read on public.fk_expense_splits;
create policy fk_splits_read on public.fk_expense_splits for select to authenticated
using(exists(select 1 from public.fk_expenses e where e.id=expense_id and public.fk_is_member(e.trip_id)));
revoke all on public.fk_expense_splits from anon, authenticated;
grant select on public.fk_expense_splits to authenticated;

create or replace function public.fk_save_split_expense(
 p_trip uuid,p_expense uuid,p_payer uuid,p_description text,
 p_amount_cents bigint,p_date date,p_people uuid[]
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;v_count int;v_i int;v_person uuid;v_owner uuid;
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
 if p_expense is null then
  insert into public.fk_expenses(trip_id,person_id,description,amount_cents,currency,expense_date,created_by)
  select p_trip,p_payer,trim(p_description),p_amount_cents,t.currency,p_date,auth.uid()
  from public.fk_trips t where t.id=p_trip returning id into v_id;
 else
  select id into v_id from public.fk_expenses where id=p_expense and trip_id=p_trip for update;
  if v_id is null then raise exception 'Expense not found'; end if;
  update public.fk_expenses set person_id=p_payer,description=trim(p_description),
   amount_cents=p_amount_cents,expense_date=p_date where id=v_id;
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
revoke all on function public.fk_save_split_expense(uuid,uuid,uuid,text,bigint,date,uuid[]) from public,anon;
grant execute on function public.fk_save_split_expense(uuid,uuid,uuid,text,bigint,date,uuid[]) to authenticated;
