-- =============================================================================
-- 005 · Políticas de RLS de los módulos posteriores a schema.sql
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Idempotente.
--
-- POR QUÉ EXISTE ESTA MIGRACIÓN
--
-- Editar una tarjeta de crédito fallaba con:
--
--   new row violates row-level security policy
--   for table "credit_card_details"  [42501]
--
-- El insert en `accounts` de la misma operación sí pasaba, así que la sesión y
-- `auth.uid()` funcionaban: el rechazo era exclusivo de la política de
-- `credit_card_details`.
--
-- La causa es un desfasaje de historia. Las tablas de los módulos 002 y 003 se
-- crearon a mano en el dashboard antes de que existieran los archivos de
-- migración; los .sql se escribieron después, reconstruidos por introspección.
-- Pero la introspección se hizo vía PostgREST con la anon key, que ve tablas y
-- columnas y **no ve políticas**. Así que las tablas quedaron con RLS activo y
-- sin la política permisiva que las acompaña: con RLS habilitado y ninguna
-- política que aplique, Postgres rechaza todo insert con 42501.
--
-- Esta migración vuelve a declarar las políticas y los grants de las cuatro
-- tablas de esos módulos. Es un `drop ... if exists` + `create`, así que da lo
-- mismo si ya estaban bien: quedan idénticas.
--
-- Nota sobre `(select auth.uid())`: el subselect hace que Postgres lo evalúe
-- una vez por consulta en vez de una vez por fila. Es la forma que ya usa
-- schema.sql; 002 y 003 habían quedado con la llamada suelta.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. credit_card_details · la pertenencia se hereda de la cuenta
-- -----------------------------------------------------------------------------
-- La tabla no tiene user_id propio, así que la política lo busca en `accounts`.
-- El subquery también pasa por el RLS de `accounts`, que ya filtra por dueño.
alter table public.credit_card_details enable row level security;

drop policy if exists "credit_card_details_todo" on public.credit_card_details;
create policy "credit_card_details_todo" on public.credit_card_details
  for all to authenticated
  using (
    exists (
      select 1 from public.accounts a
      where a.id = credit_card_details.account_id
        and a.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.accounts a
      where a.id = credit_card_details.account_id
        and a.user_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on public.credit_card_details to authenticated;


-- -----------------------------------------------------------------------------
-- 2. debts
-- -----------------------------------------------------------------------------
alter table public.debts enable row level security;

drop policy if exists "debts_todo" on public.debts;
create policy "debts_todo" on public.debts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.debts to authenticated;


-- -----------------------------------------------------------------------------
-- 3. budgets
-- -----------------------------------------------------------------------------
alter table public.budgets enable row level security;

drop policy if exists "budgets_todo" on public.budgets;
create policy "budgets_todo" on public.budgets
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.budgets to authenticated;


-- -----------------------------------------------------------------------------
-- 4. exchange_rates · tabla compartida, no tiene dueño
-- -----------------------------------------------------------------------------
-- Las cotizaciones son públicas y solo de referencia: cualquiera las lee y
-- cualquiera con sesión las completa. No hay dato privado que proteger acá.
alter table public.exchange_rates enable row level security;

drop policy if exists "exchange_rates_select" on public.exchange_rates;
create policy "exchange_rates_select" on public.exchange_rates
  for select to authenticated, anon
  using (true);

drop policy if exists "exchange_rates_insert" on public.exchange_rates;
create policy "exchange_rates_insert" on public.exchange_rates
  for insert to authenticated
  with check (true);

grant select on public.exchange_rates to anon, authenticated;
grant insert on public.exchange_rates to authenticated;


-- =============================================================================
-- Verificación
-- =============================================================================
-- Este select es el resultado que muestra el editor. Devuelve una fila por
-- objeto esperado con su estado, así que sirve como comprobante.
--
-- Incluye también el constraint y el índice de la migración 004: tampoco son
-- observables vía PostgREST y quedaron sin confirmar. Si ya estaban, aparecen
-- como OK y no hay nada que hacer.
select
  'política' as objeto,
  t.tablename || ' · ' || coalesce(p.policyname, '(NINGUNA)') as nombre,
  case
    when p.policyname is null then 'FALTA'
    when p.with_check is null and p.cmd in ('ALL', 'INSERT', 'UPDATE') then 'sin WITH CHECK'
    else 'OK'
  end as estado
from (
  values ('credit_card_details'), ('debts'), ('budgets'), ('exchange_rates')
) as t (tablename)
left join pg_policies p
  on p.schemaname = 'public' and p.tablename = t.tablename

union all

select 'constraint', 'transactions · transactions_interes_coherente',
       case when exists (
         select 1 from pg_constraint
         where conname = 'transactions_interes_coherente'
       ) then 'OK' else 'FALTA' end

union all

select 'índice', 'transactions · transactions_cuotas_futuras_idx',
       case when exists (
         select 1 from pg_indexes
         where schemaname = 'public'
           and indexname = 'transactions_cuotas_futuras_idx'
       ) then 'OK' else 'FALTA' end

order by objeto, nombre;
