-- Ferienkasse 1.3: Erfasste Ausgleichszahlungen, nur Testprojekt
create table if not exists public.fk_settlements (
 id uuid primary key default gen_random_uuid(),
 trip_id uuid not null references public.fk_trips(id) on delete cascade,
 from_person_id uuid not null,
 to_person_id uuid not null,
 amount_cents bigint not null check(amount_cents>0),
 paid_on date not null default current_date,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 constraint fk_settlement_distinct check(from_person_id<>to_person_id),
 foreign key(from_person_id,trip_id) references public.fk_people(id,trip_id),
 foreign key(to_person_id,trip_id) references public.fk_people(id,trip_id)
);
alter table public.fk_settlements enable row level security;
drop policy if exists fk_settlements_read on public.fk_settlements;
drop policy if exists fk_settlements_create on public.fk_settlements;
drop policy if exists fk_settlements_remove on public.fk_settlements;
create policy fk_settlements_read on public.fk_settlements for select to authenticated using(public.fk_is_member(trip_id));
create policy fk_settlements_create on public.fk_settlements for insert to authenticated with check(public.fk_is_member(trip_id) and created_by=auth.uid());
create policy fk_settlements_remove on public.fk_settlements for delete to authenticated using(public.fk_is_member(trip_id));
revoke all on public.fk_settlements from anon;
grant select,insert,delete on public.fk_settlements to authenticated;
