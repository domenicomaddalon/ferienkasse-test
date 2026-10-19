-- Ferienkasse 1.3: Gemeinsames Bearbeiten von Ausgaben (nur Testprojekt).
create or replace function public.fk_protect_expense_identity()
returns trigger language plpgsql set search_path = ''
as $$
begin
 if new.trip_id is distinct from old.trip_id then raise exception 'Trip cannot be changed'; end if;
 if new.created_by is distinct from old.created_by then raise exception 'Expense creator cannot be changed'; end if;
 new.updated_at=now();
 return new;
end;
$$;
drop trigger if exists fk_protect_expenses_trip on public.fk_expenses;
drop trigger if exists fk_protect_expense_identity on public.fk_expenses;
create trigger fk_protect_expense_identity before update on public.fk_expenses
for each row execute function public.fk_protect_expense_identity();
drop policy if exists fk_expenses_edit on public.fk_expenses;
create policy fk_expenses_edit on public.fk_expenses
for update to authenticated
using (public.fk_is_member(trip_id))
with check (public.fk_is_member(trip_id));
