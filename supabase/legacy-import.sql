-- Ferienkasse 1.3: atomarer JSON-v1-Import. NUR TESTPROJEKT.
create table if not exists public.fk_legacy_imports(
 owner_id uuid not null references auth.users(id),
 legacy_trip_id uuid not null,
 trip_id uuid not null unique references public.fk_trips(id) on delete cascade,
 imported_at timestamptz not null default now(),
 primary key(owner_id,legacy_trip_id)
);
alter table public.fk_legacy_imports enable row level security;
drop policy if exists fk_legacy_imports_read on public.fk_legacy_imports;
create policy fk_legacy_imports_read on public.fk_legacy_imports for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.fk_legacy_imports from public,anon,authenticated;
grant select on public.fk_legacy_imports to authenticated;

create or replace function public.fk_import_legacy_trip(p_trip jsonb)
returns uuid language plpgsql security definer set search_path=''
as $import$
declare
 v_owner uuid:=auth.uid();v_trip uuid;v_legacy uuid;v_person jsonb;v_expense jsonb;v_payment jsonb;
 v_map jsonb:='{}'::jsonb;v_new_person uuid;v_payer uuid;v_expense_id uuid;v_amount bigint;
 v_rate numeric;v_total bigint;v_base text;v_original text;v_name text;v_category text;
 v_date date;v_shares uuid[];v_share jsonb;v_person_id uuid;v_count integer;v_i integer;
 v_category_item jsonb;v_rate_key text;v_rate_value jsonb;v_rate_date date;
begin
 if v_owner is null then raise exception 'Not authenticated';end if;
 if jsonb_typeof(p_trip)<>'object' or jsonb_typeof(p_trip->'people')<>'array'
 or jsonb_typeof(p_trip->'expenses')<>'array' then raise exception 'Invalid backup trip';end if;
 v_legacy:=(p_trip->>'id')::uuid;
 v_name:=trim(p_trip->>'name');v_base:=p_trip->>'currency';
 if v_name is null or length(v_name) not between 1 and 180 or v_base is null or v_base !~ '^[A-Z]{3}$' then raise exception 'Invalid trip name/currency';end if;
 if jsonb_array_length(p_trip->'people') not between 1 and 100 or jsonb_array_length(p_trip->'expenses')>2000
 or jsonb_typeof(coalesce(p_trip->'payments','[]'::jsonb))<>'array' then raise exception 'Invalid entry count';end if;
 if jsonb_array_length(coalesce(p_trip->'payments','[]'::jsonb))>2000 then raise exception 'Too many payments';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_owner::text),pg_catalog.hashtext(v_legacy::text));
 if exists(select 1 from public.fk_legacy_imports where owner_id=v_owner and legacy_trip_id=v_legacy) then raise exception 'Diese Reise wurde bereits importiert';end if;
 insert into public.fk_trips(owner_id,name,currency) values(v_owner,v_name||' (Import 1.2.1)',v_base) returning id into v_trip;
 insert into public.fk_legacy_imports(owner_id,legacy_trip_id,trip_id) values(v_owner,v_legacy,v_trip);
 for v_person in select value from jsonb_array_elements(p_trip->'people') loop
  if trim(coalesce(v_person->>'name',''))='' or length(trim(v_person->>'name'))>120 then raise exception 'Invalid person';end if;
  if v_map ? (v_person->>'id') then raise exception 'Duplicate person ID';end if;
  perform (v_person->>'id')::uuid;
  insert into public.fk_people(trip_id,name) values(v_trip,trim(v_person->>'name')) returning id into v_new_person;
  v_map:=v_map||jsonb_build_object(v_person->>'id',v_new_person::text);
 end loop;
 -- Kurse aus der Sicherung. Buchungskurse der einzelnen Ausgaben bleiben separat erhalten.
 if jsonb_typeof(p_trip->'rates')='object' then
  for v_rate_key,v_rate_value in select key,value from jsonb_each(p_trip->'rates') loop
   if v_rate_key !~ '^[A-Z]{3}$' or jsonb_typeof(v_rate_value)<>'number'
    or (v_rate_value::text)::numeric<=0 then raise exception 'Invalid rate';end if;
   insert into public.fk_rates(trip_id,currency,rate)
   values(v_trip,v_rate_key,case when v_rate_key=v_base then 1 else (v_rate_value::text)::numeric end)
   on conflict(trip_id,currency) do update set rate=excluded.rate;
  end loop;
 end if;
 if jsonb_typeof(p_trip->'categories')='array' then
  for v_category_item in select value from jsonb_array_elements(p_trip->'categories') loop
   v_category:=trim(v_category_item #>> '{}');
   if length(v_category) not between 1 and 60 then raise exception 'Invalid category';end if;
   insert into public.fk_categories(trip_id,name) values(v_trip,v_category) on conflict(trip_id,name) do nothing;
  end loop;
 end if;
 for v_expense in select value from jsonb_array_elements(p_trip->'expenses') loop
  v_amount:=(v_expense->>'amount')::bigint;
  v_rate:=(v_expense->>'rate')::numeric;
  v_original:=v_expense->>'currency';
  v_name:=trim(v_expense->>'name');
  v_date:=(v_expense->>'date')::date;
  v_category:=coalesce(nullif(trim(v_expense->>'category'),''),'Diverses');
  if v_amount<=0 or v_rate<=0 or v_original !~ '^[A-Z]{3}$'
   or length(v_name) not between 1 and 500 or length(v_category) not between 1 and 60 then raise exception 'Invalid expense';end if;
  if v_original=v_base and v_rate<>1 then raise exception 'Base currency rate must equal 1';end if;
  v_payer:=(v_map->>(v_expense->>'payer'))::uuid;
  if v_payer is null then raise exception 'Unknown payer';end if;
  if jsonb_typeof(v_expense->'shares')<>'array' then raise exception 'Invalid shares';end if;
  if v_expense ? 'custom' and v_expense->'custom' not in ('null'::jsonb,'{}'::jsonb) then
   raise exception 'Individuelle Kostenaufteilungen sind noch nicht importierbar';
  end if;
  v_shares:=array[]::uuid[];
  for v_share in select value from jsonb_array_elements(v_expense->'shares') loop
   v_person_id:=(v_map->>(v_share #>> '{}'))::uuid;
   if v_person_id is null or v_person_id=any(v_shares) then raise exception 'Unknown or duplicate share';end if;
   v_shares:=array_append(v_shares,v_person_id);
  end loop;
  v_count:=coalesce(array_length(v_shares,1),0);
  if v_count<1 then raise exception 'Missing shares';end if;
  v_total:=round(v_amount*v_rate);
  if v_total<=0 then raise exception 'Converted amount too small';end if;
  insert into public.fk_categories(trip_id,name) values(v_trip,v_category) on conflict(trip_id,name) do nothing;
  insert into public.fk_expenses(trip_id,person_id,description,amount_cents,currency,expense_date,created_by,category,original_amount_cents,original_currency,exchange_rate)
  values(v_trip,v_payer,v_name,v_total,v_base,v_date,v_owner,v_category,v_amount,v_original,v_rate) returning id into v_expense_id;
  for v_i in 1..v_count loop
   insert into public.fk_expense_splits(expense_id,person_id,amount_cents)
   values(v_expense_id,v_shares[v_i],v_total/v_count+case when v_i<=v_total%v_count then 1 else 0 end);
  end loop;
 end loop;
 for v_payment in select value from jsonb_array_elements(coalesce(p_trip->'payments','[]'::jsonb)) loop
  if (v_payment->>'cents')::bigint<=0 then raise exception 'Invalid payment';end if;
  insert into public.fk_settlements(trip_id,from_person_id,to_person_id,amount_cents,paid_on,created_by)
  values(v_trip,(v_map->>(v_payment->>'from'))::uuid,(v_map->>(v_payment->>'to'))::uuid,
   (v_payment->>'cents')::bigint,coalesce((v_payment->>'date')::date,current_date),v_owner);
 end loop;
 return v_trip;
end;
$import$;
revoke all on function public.fk_import_legacy_trip(jsonb) from public,anon;
grant execute on function public.fk_import_legacy_trip(jsonb) to authenticated;
