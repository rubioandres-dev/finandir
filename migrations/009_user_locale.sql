-- =============================================================================
-- 009 · Formato regional por usuario
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Idempotente.
--
-- QUÉ HABILITA
--
-- Que los importes y las fechas se escriban como los escribe el país del
-- usuario, y no siempre como en Argentina.
--
--   es-AR →  $ 1.234,56   ·  10/09/2026  ·  10 de septiembre
--   es-ES →  1.234,56 €   ·  10/09/2026  ·  10 de septiembre
--   en-US →  $1,234.56    ·  09/10/2026  ·  September 10
--
-- Ojo con la fila del medio: el MISMO número y la MISMA fecha, con el símbolo
-- del otro lado y el día y el mes intercambiados. Por eso esto no es una
-- preferencia cosmética — "10/09" significa dos días distintos según quién lo
-- lea, y hasta ahora la app siempre respondía "es-AR" sin preguntar.
--
-- POR QUÉ EL LOCALE Y NO EL PAÍS
--
-- Un código de país obligaría a mantener un mapa país → formato acá adentro.
-- El locale IETF ya es exactamente ese dato, y es lo que consume `Intl` sin
-- traducción de por medio.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Columna
-- -----------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists locale text not null default 'es-AR';

comment on column public.user_profiles.locale is
  'Locale IETF que define el formato de números y fechas. Ver lib/formatters.ts.';

-- La lista cerrada es a propósito: cada locale que se agregue tiene que estar
-- también en CATALOGO_LOCALES (lib/formatters.ts), porque la UI ofrece esa
-- lista y el CHECK es lo que impide que se desincronicen.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_profiles_locale_valido') then
    alter table public.user_profiles
      add constraint user_profiles_locale_valido
        check (locale in ('es-AR', 'es-ES', 'en-US'));
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 2. Verificación
-- -----------------------------------------------------------------------------
select
  exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_profiles'
      and column_name = 'locale')                                  as columna_locale,
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'user_profiles'
      and column_name = 'locale')                                  as valor_por_defecto,
  exists (select 1 from pg_constraint
    where conname = 'user_profiles_locale_valido')                 as check_locale,
  (select count(*) from public.user_profiles)                      as perfiles_existentes;
