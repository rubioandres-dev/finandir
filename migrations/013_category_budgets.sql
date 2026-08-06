-- =============================================================================
-- 013 · `category_budgets`: una sola fuente para el techo de gasto
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Idempotente.
--
-- QUÉ REDUNDANCIA ELIMINA
--
-- Había DOS lugares donde definir el presupuesto mensual de una categoría, y
-- ninguno de los dos sabía del otro:
--
--   · `budgets` (migración 002), que edita la vista de Ajustes.
--   · objetivos de tipo CATEGORY_BUDGET (migración 010), que muestra el Home
--     y son los únicos que sumaban XP al cumplirse.
--
-- El mismo número podía valer $80.000 en una pantalla y $120.000 en la otra sin
-- que nada lo señalara. Esta migración los junta en `category_budgets` y deja a
-- las dos tablas viejas intactas: no se borra una fila, así que volver atrás es
-- apagar el código nuevo, no restaurar un backup.
--
-- QUÉ SE PIERDE EN EL CAMINO
--
-- Los presupuestos dejan de sumar XP. Era la única ventaja real que tenían los
-- objetivos CATEGORY_BUDGET sobre `budgets`, y se paga a propósito: un techo de
-- gasto es una herramienta de control mensual, no un logro que se consigue una
-- vez y queda. Los otros cuatro tipos de objetivo —tasa de ahorro, inversión,
-- fondo de emergencia y reducción de deuda— siguen dando XP igual.
--
-- POR QUÉ LA MONEDA NO ES UN ENUM DE DOS VALORES
--
-- El pedido decía `VARCHAR(3) ... -- 'ARS' o 'USD'`. Desde la 007 el usuario
-- elige sus divisas en el onboarding y la app maneja EUR, BRL, CLP y UYU: un
-- CHECK cerrado en ARS/USD rebotaría un presupuesto en euros de alguien que ya
-- tiene cuentas en euros. Se usa el mismo `char(3)` con CHECK de ISO 4217 que
-- el resto de las tablas de la app.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. La tabla
-- -----------------------------------------------------------------------------
create table if not exists public.category_budgets (
  id          uuid          primary key default gen_random_uuid(),
  user_id     uuid          not null references auth.users (id) on delete cascade,
  category_id uuid          not null references public.categories (id) on delete cascade,
  amount      numeric(15,2) not null check (amount >= 0),
  currency    char(3)       not null default 'ARS' check (currency ~ '^[A-Z]{3}$'),
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now(),

  -- La clave incluye `user_id`, a diferencia de la de `budgets`, que era sólo
  -- (category_id, currency). Las categorías son por usuario, así que en la
  -- práctica daba igual; pero una restricción que no nombra al dueño depende de
  -- que otra tabla mantenga esa invariante, y eso es una suposición de más.
  constraint category_budgets_user_category_currency_key
    unique (user_id, category_id, currency)
);

comment on table public.category_budgets is
  'Techo de gasto mensual por categoría y moneda. Fuente ÚNICA desde la 013: reemplaza a `budgets` (002) y a los objetivos CATEGORY_BUDGET (010).';

create index if not exists category_budgets_user_idx
  on public.category_budgets (user_id);


-- -----------------------------------------------------------------------------
-- 2. RLS
-- -----------------------------------------------------------------------------
alter table public.category_budgets enable row level security;

drop policy if exists "category_budgets_todo" on public.category_budgets;
create policy "category_budgets_todo" on public.category_budgets
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.category_budgets to authenticated;

-- `(select auth.uid())` y no `auth.uid()` pelado: envuelto en un subselect
-- Postgres lo evalúa UNA vez por query en lugar de una vez por fila. Es el mismo
-- patrón que usan las políticas de la 010 y la 011.


-- -----------------------------------------------------------------------------
-- 3. `updated_at`
-- -----------------------------------------------------------------------------
-- La función ya existe desde la 007.
drop trigger if exists category_budgets_tocar_updated_at on public.category_budgets;
create trigger category_budgets_tocar_updated_at
  before update on public.category_budgets
  for each row execute function public.tocar_updated_at();


-- -----------------------------------------------------------------------------
-- 4. Migración de datos
-- -----------------------------------------------------------------------------
-- ORDEN DELIBERADO: primero `budgets`, después los objetivos. Cuando los dos
-- definen la misma (categoría, moneda), gana el OBJETIVO — es el que venía
-- mostrando el Home y el que el usuario vio por última vez, así que es el
-- número que tiene en la cabeza.

-- 4.1 · Desde `budgets` (002)
insert into public.category_budgets (user_id, category_id, amount, currency)
select b.user_id, b.category_id, b.amount, b.currency
from public.budgets b
where b.amount >= 0
on conflict (user_id, category_id, currency) do nothing;

-- 4.2 · Desde los objetivos CATEGORY_BUDGET (010)
-- `where category_id is not null` no es defensivo de más: la 010 permite un
-- objetivo de presupuesto sin categoría a nivel de esquema (sólo lo valida la
-- app), y esas filas no se pueden migrar a ningún lado.
insert into public.category_budgets (user_id, category_id, amount, currency)
select g.user_id, g.category_id, g.target_value, g.currency
from public.financial_goals g
where g.type = 'CATEGORY_BUDGET'
  and g.category_id is not null
  and g.target_value >= 0
on conflict (user_id, category_id, currency)
  do update set amount = excluded.amount;


-- -----------------------------------------------------------------------------
-- 5. Los objetivos migrados salen de circulación, pero no se borran
-- -----------------------------------------------------------------------------
-- `is_active = false` en vez de DELETE: la fila queda para poder volver atrás,
-- y cualquier lectura que todavía no se haya actualizado deja de verla. El
-- valor de `goal_type` tampoco se saca del enum de Postgres — quitarlo
-- invalidaría estas mismas filas que queremos conservar.
update public.financial_goals
   set is_active = false
 where type = 'CATEGORY_BUDGET'
   and is_active = true;


-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------
-- Las tres columnas tienen que dar `true`:
--
--   select
--     (select count(*) from public.category_budgets) >=
--       (select count(*) from public.budgets)                          as migro_budgets,
--     (select count(*) from public.financial_goals
--       where type = 'CATEGORY_BUDGET' and is_active)  = 0             as objetivos_apagados,
--     exists (select 1 from pg_policies
--       where tablename = 'category_budgets')                          as tiene_rls;
