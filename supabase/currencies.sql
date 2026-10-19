-- Ferienkasse 1.3 – Währungen und historisierte Umrechnung; NUR TESTPROJEKT.
-- Vor Aktivierung der neuen Währungsoberfläche einmal im Supabase SQL Editor ausführen.
create table if not exists public.fk_rates(
 trip_id uuid not null references public.fk_trips(id) on delete cascade,
 currency text not null check(currency ~ '^[A-Z]{3}$'),
 rate numeric(24,12) not null check(rate>0),
 rate_date date,
 primary key(trip_id,currency)
);
alter table public.fk_rates enable row level security;
drop policy if exists fk_rates_read on public.fk_rates;
create policy fk_rates_read on public.fk_rates for select to authenticated using(public.fk_is_member(trip_id));
drop policy if exists fk_rates_insert on public.fk_rates;
create policy fk_rates_insert on public.fk_rates for insert to authenticated with check(public.fk_is_member(trip_id));
drop policy if exists fk_rates_update on public.fk_rates;
create policy fk_rates_update on public.fk_rates for update to authenticated using(public.fk_is_member(trip_id)) with check(public.fk_is_member(trip_id));
drop policy if exists fk_rates_delete on public.fk_rates;
create policy fk_rates_delete on public.fk_rates for delete to authenticated using(public.fk_is_member(trip_id));
revoke all on public.fk_rates from anon;
grant select,insert,update,delete on public.fk_rates to authenticated;
alter table public.fk_expenses add column if not exists original_amount_cents bigint;
alter table public.fk_expenses add column if not exists original_currency text;
alter table public.fk_expenses add column if not exists exchange_rate numeric(24,12);
update public.fk_expenses set original_amount_cents=amount_cents,original_currency=currency,exchange_rate=1
where original_amount_cents is null or original_currency is null or exchange_rate is null;
-- Rückwärtskompatibilität für ältere Clients/RPCs, die nur den CHF-Betrag schreiben.
create or replace function public.fk_fill_original_currency() returns trigger language plpgsql set search_path=''
as $ begin
 if new.original_amount_cents is null then new.original_amount_cents:=new.amount_cents; end if;
 if new.original_currency is null then new.original_currency:=new.currency; end if;
 if new.exchange_rate is null then new.exchange_rate:=1; end if;
 return new;
end; $;
drop trigger if exists fk_fill_original_currency_trigger on public.fk_expenses;
create trigger fk_fill_original_currency_trigger before insert on public.fk_expenses
for each row execute function public.fk_fill_original_currency();
alter table public.fk_expenses alter column original_amount_cents set not null;
alter table public.fk_expenses alter column original_currency set not null;
alter table public.fk_expenses alter column exchange_rate set not null;
alter table public.fk_expenses add constraint fk_expenses_original_positive check(original_amount_cents>0 and original_currency ~ '^[A-Z]{3}$' and exchange_rate>0);
-- Bereits bestehende Aufrufe bleiben kompatibel; neuer RPC für Fremdwährungen.
create or replace function public.fk_save_currency_expense(
 p_trip uuid,p_expense uuid,p_payer uuid,p_description text,
 p_original_amount_cents bigint,p_original_currency text,p_date date,p_people uuid[],p_category text
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;v_count integer;v_i integer;v_person uuid;v_currency text;v_rate numeric;v_amount bigint;v_category text;
begin
 if auth.uid() is null or not public.fk_is_member(p_trip) then raise exception 'Not a trip member'; end if;
 if p_description is null or length(trim(p_description)) not between 1 and 500
 or p_original_amount_cents is null or p_original_amount_cents<=0 or p_date is null then raise exception 'Invalid expense'; end if;
 if not exists(select 1 from public.fk_people where id=p_payer and trip_id=p_trip) then raise exception 'Invalid payer'; end if;
 select count(distinct x),count(x) into v_count,v_i from unnest(p_people) x;
 if v_count=0 or v_count<>v_i or v_count>1000 then raise exception 'Invalid participants'; end if;
 if (select count(*) from public.fk_people where trip_id=p_trip and id=any(p_people))<>v_count then raise exception 'Participants must belong to trip'; end if;
 v_category:=trim(coalesce(p_category,''));
 if not exists(select 1 from public.fk_categories where trip_id=p_trip and name=v_category) then raise exception 'Invalid category'; end if;
 select currency into v_currency from public.fk_trips where id=p_trip;
 if p_original_currency=v_currency then v_rate:=1;
 else
  select rate into v_rate from public.fk_rates where trip_id=p_trip and currency=p_original_currency;
  if v_rate is null then raise exception 'Missing exchange rate'; end if;
 end if;
 v_amount:=round(p_original_amount_cents*v_rate);
 if v_amount<=0 then raise exception 'Converted amount too small'; end if;
 if p_expense is null then
  insert into public.fk_expenses(trip_id,person_id,description,amount_cents,currency,expense_date,created_by,category,original_amount_cents,original_currency,exchange_rate)
  values(p_trip,p_payer,trim(p_description),v_amount,v_currency,p_date,auth.uid(),v_category,p_original_amount_cents,p_original_currency,v_rate)
  returning id into v_id;
 else
  select id into v_id from public.fk_expenses where id=p_expense and trip_id=p_trip for update;
  if v_id is null then raise exception 'Expense not found'; end if;
  update public.fk_expenses set person_id=p_payer,description=trim(p_description),amount_cents=v_amount,
   currency=v_currency,expense_date=p_date,category=v_category,original_amount_cents=p_original_amount_cents,
   original_currency=p_original_currency,exchange_rate=v_rate where id=v_id;
 end if;
 delete from public.fk_expense_splits where expense_id=v_id;
 for v_i in 1..v_count loop
  v_person:=p_people[v_i];
  insert into public.fk_expense_splits(expense_id,person_id,amount_cents)
  values(v_id,v_person,v_amount/v_count+case when v_i<=v_amount%v_count then 1 else 0 end);
 end loop;
 return v_id;
end;
$$;
revoke all on function public.fk_save_currency_expense(uuid,uuid,uuid,text,bigint,text,date,uuid[],text) from public,anon;
grant execute on function public.fk_save_currency_expense(uuid,uuid,uuid,text,bigint,text,date,uuid[],text) to authenticated;
-- Basiswährung für alle vorhandenen Reisen sicherstellen.
insert into public.fk_rates(trip_id,currency,rate)
select id,currency,1 from public.fk_trips on conflict(trip_id,currency) do nothing;
create or replace function public.fk_seed_base_rate() returns trigger language plpgsql security definer set search_path=''
as $$ begin insert into public.fk_rates(trip_id,currency,rate) values(new.id,new.currency,1) on conflict do nothing;return new;end; $$;
drop trigger if exists fk_seed_base_rate_trigger on public.fk_trips;
create trigger fk_seed_base_rate_trigger after insert on public.fk_trips for each row execute function public.fk_seed_base_rate();
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='fk_rates') then
  alter publication supabase_realtime add table public.fk_rates;
 end if;
end $$;
