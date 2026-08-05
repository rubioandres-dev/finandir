-- =============================================================================
-- 007 · Perfil de usuario y divisas dinámicas
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Idempotente.
--
-- QUÉ HABILITA
--
-- Que cada usuario elija con QUÉ divisas trabaja (1, 2 o N) en vez de tener el
-- par ARS/USD cableado en el código. Son tres cambios que van juntos porque
-- ninguno sirve sin los otros dos:
--
--   1. `user_profiles`  → dónde se guarda la elección.
--   2. CHECKs de moneda → hoy cuatro tablas sólo aceptan ARS y USD, así que
--      elegir EUR no dejaría cargar ni un movimiento en EUR.
--   3. `exchange_rates` → hoy guarda UNA cotización por día (el MEP). Sin un
--      par de divisas no hay dónde guardar el euro ni el real, y sin eso el
--      consolidado no puede unificar nada que no sea ARS/USD.
--
-- POR QUÉ UNA TABLA Y NO `user_metadata`
--
-- El nombre visible vive hoy en `auth.users.user_metadata` y ahí se queda: es
-- un campo de texto que sólo lee el cliente. La lista de divisas es distinta —
-- la necesitan los Server Components ANTES de consultar, para filtrar en el
-- origen, y queremos poder consultarla con SQL. `user_metadata` no es
-- consultable desde `public` sin exponer `auth.users`.
--
-- `display_name` se duplica acá a propósito: es la fuente de verdad del
-- onboarding, que escribe las dos cosas en un solo lugar. El menú de perfil
-- sigue leyendo `user_metadata`, y las server actions escriben en ambos.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Perfil de usuario
-- -----------------------------------------------------------------------------
create table if not exists public.user_profiles (
  user_id             uuid        primary key references auth.users(id) on delete cascade,
  display_name        text        check (display_name is null or char_length(trim(display_name)) <= 80),
  -- Códigos ISO 4217 en mayúsculas. El orden importa: el PRIMERO es la divisa
  -- principal, la que usa el consolidado para expresar el total unificado.
  selected_currencies text[]      not null default array['ARS', 'USD'],
  onboarding_completed boolean    not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table  public.user_profiles is 'Preferencias del usuario: nombre visible y divisas de trabajo.';
comment on column public.user_profiles.selected_currencies is 'ISO 4217 en mayúsculas. El primero es la divisa principal.';

-- Al menos una divisa, todas con forma de código ISO. Sin esto un array vacío
-- dejaría la app sin ninguna moneda activa que mostrar.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_profiles_divisas_validas') then
    alter table public.user_profiles
      add constraint user_profiles_divisas_validas check (
        array_length(selected_currencies, 1) between 1 and 8
        and selected_currencies <@ array['ARS','USD','EUR','BRL','CLP','UYU','GBP','MXN']::text[]
      );
  end if;
end
$$;

alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles_select" on public.user_profiles;
create policy "user_profiles_select" on public.user_profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "user_profiles_insert" on public.user_profiles;
create policy "user_profiles_insert" on public.user_profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "user_profiles_update" on public.user_profiles;
create policy "user_profiles_update" on public.user_profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "user_profiles_delete" on public.user_profiles;
create policy "user_profiles_delete" on public.user_profiles
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.user_profiles to authenticated;

-- `updated_at` no se mantiene solo. El trigger evita depender de que cada
-- server action se acuerde de escribirlo.
create or replace function public.tocar_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_profiles_tocar_updated_at on public.user_profiles;
create trigger user_profiles_tocar_updated_at
  before update on public.user_profiles
  for each row execute function public.tocar_updated_at();


-- -----------------------------------------------------------------------------
-- 2. Liberar los CHECK de moneda: de ARS/USD a cualquier ISO 4217
-- -----------------------------------------------------------------------------
-- `accounts.currency` ya usaba el patrón permisivo desde el esquema base; las
-- otras cuatro tablas quedaron con la lista cerrada de la 002/003/006. Esa
-- lista es exactamente lo que impide que las divisas dinámicas sean reales:
-- se puede ELEGIR euro, pero el insert de un movimiento en euros rebota.
do $$
declare
  objetivo record;
begin
  for objetivo in
    select * from (values
      ('transactions', 'transactions_currency_valida'),
      ('budgets',      'budgets_currency_check'),
      ('debts',        'debts_currency_check'),
      ('investments',  'investments_currency_check')
    ) as t(tabla, restriccion)
  loop
    -- El nombre de la restricción varía según la haya creado un `add
    -- constraint` con nombre (002) o un `check` inline (003/006, que Postgres
    -- bautiza `<tabla>_<columna>_check`). Se borra la que exista.
    execute format(
      'alter table public.%I drop constraint if exists %I',
      objetivo.tabla, objetivo.restriccion
    );

    if to_regclass('public.' || objetivo.tabla) is not null
       and not exists (
         select 1 from pg_constraint
         where conname = objetivo.tabla || '_currency_iso'
       )
    then
      execute format(
        'alter table public.%I add constraint %I check (currency ~ ''^[A-Z]{3}$'')',
        objetivo.tabla, objetivo.tabla || '_currency_iso'
      );
    end if;
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- 3. `exchange_rates` por par de divisas
-- -----------------------------------------------------------------------------
-- Antes: una fila por día, implícitamente USD→ARS (el MEP). Ahora el par es
-- explícito, así el euro y el real pueden convivir con el MEP en la misma
-- tabla.
--
-- Semántica de una fila: 1 unidad de `base` vale `sell` unidades de `quote`.
-- Los defaults están elegidos para que las filas existentes queden marcadas
-- como USD→ARS sin tener que tocarlas, que es lo que ya eran.
alter table public.exchange_rates
  add column if not exists base  char(3) not null default 'USD',
  add column if not exists quote char(3) not null default 'ARS';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'exchange_rates_par_iso') then
    alter table public.exchange_rates
      add constraint exchange_rates_par_iso check (
        base ~ '^[A-Z]{3}$' and quote ~ '^[A-Z]{3}$' and base <> quote
      );
  end if;
end
$$;

-- La PK pasa de (date) a (date, base, quote). Sin esto sólo entra una
-- cotización por día en TODA la tabla: guardar el euro pisaría el MEP.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'exchange_rates_pkey'
      and conrelid = 'public.exchange_rates'::regclass
      and array_length(conkey, 1) = 1
  ) then
    alter table public.exchange_rates drop constraint exchange_rates_pkey;
    alter table public.exchange_rates
      add constraint exchange_rates_pkey primary key (date, base, quote);
  end if;
end
$$;

comment on column public.exchange_rates.base  is 'Divisa que se cotiza. 1 base = sell quote.';
comment on column public.exchange_rates.quote is 'Divisa en la que se expresa el precio.';


-- -----------------------------------------------------------------------------
-- 4. Verificación
-- -----------------------------------------------------------------------------
-- Devuelve una fila por objeto que esta migración tenía que dejar creado. Si
-- alguna dice `false`, esa parte NO se aplicó.
--
-- (Y sí, hay que mirarla: que un .sql declare una política no prueba que
-- exista en la base. Es la lección de la 005.)
select
  to_regclass('public.user_profiles') is not null                        as tabla_user_profiles,
  (select relrowsecurity from pg_class
    where oid = 'public.user_profiles'::regclass)                        as rls_activo,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'user_profiles')         as politicas_perfil,
  exists (select 1 from pg_constraint
    where conname = 'transactions_currency_iso')                         as transactions_iso,
  exists (select 1 from pg_constraint
    where conname = 'budgets_currency_iso')                              as budgets_iso,
  exists (select 1 from pg_constraint
    where conname = 'debts_currency_iso')                                as debts_iso,
  exists (select 1 from pg_constraint
    where conname = 'investments_currency_iso')                          as investments_iso,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'exchange_rates'
      and column_name in ('base', 'quote'))                              as columnas_par,
  (select array_length(conkey, 1) from pg_constraint
    where conname = 'exchange_rates_pkey'
      and conrelid = 'public.exchange_rates'::regclass)                  as columnas_en_la_pk;
