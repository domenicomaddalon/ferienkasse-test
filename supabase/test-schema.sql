-- Ferienkasse 1.3: isoliertes Testschema, nicht auf bestehende Produktivdaten anwenden.
-- Ausfuehrung im Supabase SQL Editor. Nur fuer ein leeres Testprojekt.
create extension if not exists pgcrypto;

create table if not exists public.fk_trips (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id),
 name text not null check (char_length(trim(name)) between 1 and 200),
 currency text not null default 'CHF' check (currency ~ '^[A-Z]{3}$'),
 created_at timestamptz not null default now()
);
create table if not exists public.fk_members (
 trip_id uuid not null references public.fk_trips(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 joined_at timestamptz not null default now(),
 primary key (trip_id,user_id)
);
create table if not exists public.fk_people (
 id uuid primary key default gen_random_uuid(),
 trip_id uuid not null references public.fk_trips(id) on delete cascade,
 name text not null check (char_length(trim(name)) between 1 and 120),
 unique(id,trip_id)
);
create table if not exists public.fk_expenses (
 id uuid primary key default gen_random_uuid(),
 trip_id uuid not null references public.fk_trips(id) on delete cascade,
 person_id uuid not null,
 description text not null check (char_length(trim(description)) between 1 and 500),
 amount_cents bigint not null check(amount_cents > 0),
 currency text not null default 'CHF' check(currency ~ '^[A-Z]{3}$'),
 expense_date date not null default current_date,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key (person_id,trip_id) references public.fk_people(id,trip_id)
);

-- Security-definer function avoids recursive membership policies.
create or replace function public.fk_is_member(p_trip uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.fk_members m where m.trip_id=p_trip and m.user_id=(select auth.uid()))
or exists(select 1 from public.fk_trips t where t.id=p_trip and t.owner_id=(select auth.uid())); $$;
revoke all on function public.fk_is_member(uuid) from public;
grant execute on function public.fk_is_member(uuid) to authenticated;

create or replace function public.fk_add_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin insert into public.fk_members(trip_id,user_id) values(new.id,new.owner_id); return new; end; $$;
drop trigger if exists fk_trip_owner_member on public.fk_trips;
create trigger fk_trip_owner_member after insert on public.fk_trips for each row execute function public.fk_add_owner();

-- Prevent changing ownership and moving children to another trip.
create or replace function public.fk_protect_trip()
returns trigger language plpgsql set search_path = ''
as $$ begin
 if new.owner_id is distinct from old.owner_id then raise exception 'Trip owner cannot be changed'; end if;
 return new;
end; $$;
drop trigger if exists fk_protect_trip_owner on public.fk_trips;
create trigger fk_protect_trip_owner before update on public.fk_trips for each row execute function public.fk_protect_trip();

create or replace function public.fk_protect_child()
returns trigger language plpgsql set search_path = ''
as $$ begin
 if new.trip_id is distinct from old.trip_id then raise exception 'Trip cannot be changed'; end if;
 return new;
end; $$;
drop trigger if exists fk_protect_people_trip on public.fk_people;
create trigger fk_protect_people_trip before update on public.fk_people for each row execute function public.fk_protect_child();
drop trigger if exists fk_protect_expenses_trip on public.fk_expenses;
create trigger fk_protect_expenses_trip before update on public.fk_expenses for each row execute function public.fk_protect_child();

alter table public.fk_trips enable row level security;
alter table public.fk_members enable row level security;
alter table public.fk_people enable row level security;
alter table public.fk_expenses enable row level security;

create policy fk_trips_read on public.fk_trips for select to authenticated using(public.fk_is_member(id));
create policy fk_trips_create on public.fk_trips for insert to authenticated with check(owner_id=(select auth.uid()));
create policy fk_trips_edit on public.fk_trips for update to authenticated using(public.fk_is_member(id)) with check(public.fk_is_member(id));
create policy fk_trips_remove on public.fk_trips for delete to authenticated using(owner_id=(select auth.uid()));
create policy fk_members_read on public.fk_members for select to authenticated using(public.fk_is_member(trip_id));
-- Membership writes are deliberately blocked pending secure invitations.
create policy fk_people_read on public.fk_people for select to authenticated using(public.fk_is_member(trip_id));
create policy fk_people_create on public.fk_people for insert to authenticated with check(public.fk_is_member(trip_id));
create policy fk_people_edit on public.fk_people for update to authenticated using(public.fk_is_member(trip_id)) with check(public.fk_is_member(trip_id));
create policy fk_people_remove on public.fk_people for delete to authenticated using(public.fk_is_member(trip_id));
create policy fk_expenses_read on public.fk_expenses for select to authenticated using(public.fk_is_member(trip_id));
create policy fk_expenses_create on public.fk_expenses for insert to authenticated with check(public.fk_is_member(trip_id) and created_by=(select auth.uid()));
create policy fk_expenses_edit on public.fk_expenses for update to authenticated using(public.fk_is_member(trip_id)) with check(public.fk_is_member(trip_id) and created_by=(select auth.uid()));
create policy fk_expenses_remove on public.fk_expenses for delete to authenticated using(public.fk_is_member(trip_id));

-- Prevent direct membership mutations and unauthenticated access.
revoke all on public.fk_trips,public.fk_members,public.fk_people,public.fk_expenses from anon;
grant select,insert,update,delete on public.fk_trips,public.fk_people,public.fk_expenses to authenticated;
grant select on public.fk_members to authenticated;
revoke insert,update,delete on public.fk_members from authenticated;

-- Next steps: secure invitation flow, expense splits/payments, optimistic concurrency,
-- audit logs and receipt storage policies before real shared use.
