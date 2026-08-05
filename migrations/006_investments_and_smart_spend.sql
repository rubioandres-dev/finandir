-- =============================================================================
-- 006 · Inversiones y asistente de gasto inteligente
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Idempotente.
--
-- NUMERACIÓN: el pedido original decía 005, pero ese número ya lo ocupa
-- 005_rls_tarjetas_deudas.sql. Renumerado a 006 para no pisarlo.
--
-- QUÉ MODELA
--
-- Un activo de inversión (un FCI, un plazo fijo, un CEDEAR) con lo que hace
-- falta para responder dos preguntas distintas:
--
--   1. Cuánto vale mi cartera hoy  →  amount_invested vs current_value
--   2. Cuánto me RINDE la plata que puedo tocar  →  expected_tna + liquidity_term
--
-- La segunda es la que alimenta al asistente de gasto: el costo de oportunidad
-- de pagar contado es la tasa que deja de rendir la plata líquida. Un plazo
-- fijo a 90 días no financia una compra de hoy, así que no entra en esa tasa.
--
-- POR QUÉ NO ES UNA `accounts` MÁS
--
-- `accounts` ya tiene el tipo INVESTMENT, y esa cuenta sigue siendo el saldo
-- contable. Esta tabla es la capa de RENDIMIENTO: tasa, plazo de liquidez y
-- costo vs valor actual. Ninguna de esas columnas tiene sentido en una caja de
-- ahorro, y meterlas en `accounts` dejaría cinco columnas nulas en el 80% de
-- las filas. Se mantienen separadas a propósito.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Tipos
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'asset_type') then
    create type public.asset_type as enum
      ('MONEY_MARKET', 'FIXED_INCOME', 'STOCKS_CEDEARS', 'CRYPTO', 'REAL_ESTATE');
  end if;
end
$$;

-- T0/T1/T2 son los plazos de acreditación del mercado local: T0 se rescata el
-- mismo día, T1 al hábil siguiente. LOCKED es todo lo que tiene la plata
-- inmovilizada (plazo fijo, ladrillos) y por eso nunca financia una compra.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'liquidity_term') then
    create type public.liquidity_term as enum ('T0', 'T1', 'T2', 'LOCKED');
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 2. Tabla
-- -----------------------------------------------------------------------------
create table if not exists public.investments (
  id              uuid                    primary key default extensions.uuid_generate_v4(),
  user_id         uuid                    not null references auth.users (id) on delete cascade,
  name            text                    not null check (char_length(trim(name)) between 1 and 80),
  asset_type      public.asset_type       not null,
  currency        char(3)                 not null default 'ARS' check (currency in ('ARS', 'USD')),
  -- Lo que pusiste (costo). Puede ser 0 en un activo recibido, no regalado.
  amount_invested numeric(16,2)           not null check (amount_invested >= 0),
  -- Lo que vale hoy. Es el que manda para el patrimonio; el otro es el costo.
  current_value   numeric(16,2)           not null check (current_value >= 0),
  -- Tasa nominal anual estimada, en porcentaje: 40.00 = 40 % TNA.
  -- El techo de 999.99 lo impone numeric(5,2); en pesos una TNA de tres
  -- dígitos es normal, así que el rango útil entra holgado.
  expected_tna    numeric(5,2)            not null default 0 check (expected_tna >= 0),
  liquidity_term  public.liquidity_term   not null default 'T0',
  created_at      timestamptz             not null default now()
);

comment on table public.investments is
  'Activos de inversión con su tasa y plazo de liquidez. Alimenta el costo de '
  'oportunidad del asistente de gasto inteligente.';

comment on column public.investments.expected_tna is
  'Tasa nominal anual estimada, en porcentaje (40.00 = 40 %).';

comment on column public.investments.liquidity_term is
  'Plazo de rescate. Solo T0 y T1 se consideran líquidos para financiar un gasto.';

-- El servicio filtra por dueño y ordena por alta; el índice cubre las dos.
create index if not exists investments_user_idx
  on public.investments (user_id, created_at desc);

-- La TNA ponderada solo mira los activos líquidos: este índice parcial evita
-- recorrer plazos fijos y ladrillos en cada cálculo.
create index if not exists investments_liquidas_idx
  on public.investments (user_id, liquidity_term)
  where liquidity_term in ('T0', 'T1');


-- -----------------------------------------------------------------------------
-- 3. RLS
-- -----------------------------------------------------------------------------
-- `(select auth.uid())` y no `auth.uid()` suelto: el subselect se evalúa una
-- vez por consulta en vez de una vez por fila. Es la forma que usa schema.sql.
alter table public.investments enable row level security;

drop policy if exists "investments_todo" on public.investments;
create policy "investments_todo" on public.investments
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.investments to authenticated;


-- =============================================================================
-- Verificación
-- =============================================================================
-- Devuelve una fila por objeto esperado. Sirve como comprobante de que la
-- migración quedó aplicada: todo tiene que decir OK.
select 'tipo' as objeto, 'asset_type' as nombre,
       case when exists (select 1 from pg_type where typname = 'asset_type')
            then 'OK' else 'FALTA' end as estado
union all
select 'tipo', 'liquidity_term',
       case when exists (select 1 from pg_type where typname = 'liquidity_term')
            then 'OK' else 'FALTA' end
union all
select 'tabla', 'investments',
       case when exists (
         select 1 from pg_tables where schemaname = 'public' and tablename = 'investments'
       ) then 'OK' else 'FALTA' end
union all
select 'política', 'investments · investments_todo',
       case when exists (
         select 1 from pg_policies
         where schemaname = 'public' and tablename = 'investments'
           and policyname = 'investments_todo'
       ) then 'OK' else 'FALTA' end
union all
select 'índice', 'investments_user_idx',
       case when exists (
         select 1 from pg_indexes
         where schemaname = 'public' and indexname = 'investments_user_idx'
       ) then 'OK' else 'FALTA' end
union all
select 'índice', 'investments_liquidas_idx',
       case when exists (
         select 1 from pg_indexes
         where schemaname = 'public' and indexname = 'investments_liquidas_idx'
       ) then 'OK' else 'FALTA' end
order by objeto, nombre;
