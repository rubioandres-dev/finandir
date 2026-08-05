-- =============================================================================
-- 010 · Objetivos financieros, AUREM Tier e idioma de la interfaz
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Idempotente.
--
-- NUMERACIÓN: el pedido decía 009, pero ese número ya lo ocupa
-- 009_user_locale.sql. Renumerado a 010 para no pisarlo — es el mismo criterio
-- que se aplicó en la 006.
--
-- QUÉ MODELA
--
-- Un objetivo es una intención con número: "quiero ahorrar el 20% de lo que
-- entra". La app ya sabe calcular el valor logrado de cada tipo; lo que no
-- sabía es contra qué compararlo.
--
-- POR QUÉ EL XP NO SE CALCULA AL VUELO
--
-- El tier podría derivarse de los objetivos cumplidos hoy y no guardarse. No
-- se hace, y es deliberado: un mes malo borraría el reconocimiento de todos
-- los meses buenos. El XP es ACUMULATIVO e irreversible — reconoce que algo
-- se logró, no que se sostiene. Es la diferencia entre premiar y vigilar, y es
-- lo que pide el módulo: recompensa positiva, sin penalizar el gasto.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Tipo de objetivo
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'goal_type') then
    create type public.goal_type as enum (
      'SAVINGS_RATE',      -- % de los ingresos que queda sin gastar
      'INVESTMENT_RATE',   -- % de los ingresos que va a inversiones
      'EMERGENCY_FUND',    -- meses de gastos cubiertos por lo líquido
      'CATEGORY_BUDGET',   -- techo de gasto de una categoría
      'DEBT_REDUCTION'     -- bajar el pasivo a un monto
    );
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 2. Objetivos
-- -----------------------------------------------------------------------------
create table if not exists public.financial_goals (
  id           uuid            primary key default extensions.uuid_generate_v4(),
  user_id      uuid            not null references auth.users(id) on delete cascade,
  type         public.goal_type not null,
  -- La unidad depende del tipo: porcentaje en las tasas, MESES en el fondo de
  -- emergencia, y dinero en presupuesto y deuda. Por eso no hay un CHECK de
  -- rango único: cada tipo lo valida la app.
  target_value numeric(16,2)   not null check (target_value > 0),
  -- Última medición conocida. Es un CACHÉ para poder ordenar y mostrar sin
  -- recalcular todo; la fuente de verdad siguen siendo los movimientos.
  current_value numeric(16,2)  not null default 0,
  /** 'MONTHLY' | 'ONCE'. Texto y no enum: es lo único que puede crecer seguido. */
  period       text            not null default 'MONTHLY'
                               check (period in ('MONTHLY', 'ONCE')),
  currency     char(3)         not null default 'ARS' check (currency ~ '^[A-Z]{3}$'),
  -- Solo para CATEGORY_BUDGET. En el resto queda null.
  category_id  uuid            references public.categories(id) on delete cascade,
  /** Se marca la primera vez que se cumple, y ya no se desmarca. Ver el XP. */
  achieved_at  timestamptz,
  is_active    boolean         not null default true,
  created_at   timestamptz     not null default now(),
  updated_at   timestamptz     not null default now()
);

comment on table public.financial_goals is 'Metas financieras del usuario. Ver migrations/010.';
comment on column public.financial_goals.current_value is
  'Caché de la última medición. La verdad está en transactions/accounts.';
comment on column public.financial_goals.achieved_at is
  'Primera vez que se cumplió. No se limpia: el logro no se pierde.';

-- Un objetivo por tipo, salvo los de categoría, que son uno por categoría.
create unique index if not exists financial_goals_tipo_unico
  on public.financial_goals (user_id, type)
  where category_id is null;

create unique index if not exists financial_goals_categoria_unica
  on public.financial_goals (user_id, category_id)
  where category_id is not null;

create index if not exists financial_goals_user_idx on public.financial_goals (user_id);

alter table public.financial_goals enable row level security;

drop policy if exists "financial_goals_select" on public.financial_goals;
create policy "financial_goals_select" on public.financial_goals
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "financial_goals_insert" on public.financial_goals;
create policy "financial_goals_insert" on public.financial_goals
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "financial_goals_update" on public.financial_goals;
create policy "financial_goals_update" on public.financial_goals
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "financial_goals_delete" on public.financial_goals;
create policy "financial_goals_delete" on public.financial_goals
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.financial_goals to authenticated;

-- El trigger de `updated_at` ya existe desde la 007.
drop trigger if exists financial_goals_tocar_updated_at on public.financial_goals;
create trigger financial_goals_tocar_updated_at
  before update on public.financial_goals
  for each row execute function public.tocar_updated_at();


-- -----------------------------------------------------------------------------
-- 3. XP, tier e idioma en el perfil
-- -----------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists aurem_xp   integer not null default 0,
  add column if not exists aurem_tier text    not null default 'BRONZE',
  -- El IDIOMA es una cosa distinta del LOCALE de la 009. El locale define cómo
  -- se escriben números y fechas (es-AR, es-ES, en-US); el idioma define en qué
  -- lengua está la interfaz (es-AR con voseo, es neutro, en). Un español que
  -- trabaja en Argentina quiere formato es-AR y texto neutro: con una sola
  -- columna eso no se puede expresar.
  add column if not exists language   text    not null default 'es-AR';

comment on column public.user_profiles.aurem_xp   is 'Puntos acumulados. Nunca baja.';
comment on column public.user_profiles.aurem_tier is 'BRONZE|SILVER|GOLD|PLATINUM|BLACK, derivado del XP.';
comment on column public.user_profiles.language   is 'Idioma de la interfaz. Distinto de `locale`, que es el formato.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_profiles_tier_valido') then
    alter table public.user_profiles
      add constraint user_profiles_tier_valido
        check (aurem_tier in ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'BLACK'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'user_profiles_xp_no_negativo') then
    alter table public.user_profiles
      add constraint user_profiles_xp_no_negativo check (aurem_xp >= 0);
  end if;

  -- La lista tiene que coincidir con CATALOGO_IDIOMAS (lib/i18n.ts).
  if not exists (select 1 from pg_constraint where conname = 'user_profiles_language_valido') then
    alter table public.user_profiles
      add constraint user_profiles_language_valido
        check (language in ('es-AR', 'es', 'en'));
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 4. Verificación
-- -----------------------------------------------------------------------------
select
  to_regclass('public.financial_goals') is not null                  as tabla_objetivos,
  (select relrowsecurity from pg_class
    where oid = 'public.financial_goals'::regclass)                  as rls_activo,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'financial_goals')   as politicas_objetivos,
  exists (select 1 from pg_type where typname = 'goal_type')         as tipo_goal_type,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'user_profiles'
      and column_name in ('aurem_xp', 'aurem_tier', 'language'))     as columnas_de_perfil,
  exists (select 1 from pg_constraint
    where conname = 'user_profiles_tier_valido')                     as check_tier,
  exists (select 1 from pg_constraint
    where conname = 'user_profiles_language_valido')                 as check_idioma;
