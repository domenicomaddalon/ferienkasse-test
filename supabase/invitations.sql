-- Ferienkasse 1.3: Einladungen fuer isoliertes fk_*-Testschema.
-- Nach erfolgreicher Ausfuehrung von supabase/test-schema.sql ausfuehren.
-- Einladungen sind einmalig, 7 Tage gueltig, nur Reisebesitzer duerfen sie erstellen.
create table if not exists public.fk_invitations (
 id uuid primary key default gen_random_uuid(),
 trip_id uuid not null references public.fk_trips(id) on delete cascade,
 token_hash text not null unique,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now() + interval '7 days'),
 used_by uuid references auth.users(id),
 used_at timestamptz,
 revoked_at timestamptz
);
create index if not exists fk_invitations_trip_idx on public.fk_invitations(trip_id);
alter table public.fk_invitations enable row level security;
revoke all on public.fk_invitations from anon, authenticated;
-- No direct client access: invitations are mediated by security-definer RPCs.

create or replace function public.fk_create_invitation(p_trip uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare v_token text;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.fk_trips t where t.id=p_trip and t.owner_id=(select auth.uid())) then
  raise exception 'Only the trip owner may invite members';
 end if;
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.fk_invitations(trip_id,token_hash,created_by)
 values(p_trip,encode(extensions.digest(v_token,'sha256'),'hex'),(select auth.uid()));
 return v_token;
end;
$$;

create or replace function public.fk_accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_inv public.fk_invitations%rowtype;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid invitation'; end if;
 select * into v_inv from public.fk_invitations
 where token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
 for update;
 if not found or v_inv.used_at is not null or v_inv.revoked_at is not null or v_inv.expires_at <= now() then
  raise exception 'Invitation expired or already used';
 end if;
 insert into public.fk_members(trip_id,user_id) values(v_inv.trip_id,(select auth.uid()))
 on conflict (trip_id,user_id) do nothing;
 update public.fk_invitations set used_at=now(),used_by=(select auth.uid()) where id=v_inv.id;
 return v_inv.trip_id;
end;
$$;

revoke all on function public.fk_create_invitation(uuid) from public, anon;
revoke all on function public.fk_accept_invitation(text) from public, anon;
grant execute on function public.fk_create_invitation(uuid) to authenticated;
grant execute on function public.fk_accept_invitation(text) to authenticated;

-- Verify that neither anon nor authenticated has table privileges on fk_invitations.
-- Future work: owner-managed revocation, member removal, audit trail, rate limits.
