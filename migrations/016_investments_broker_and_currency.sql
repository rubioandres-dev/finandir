-- =============================================================================
-- 016 · Inversiones: entidad, plazo fijo propio y divisas del perfil
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Idempotente.
--
-- Todo lo de acá es ADITIVO: ninguna columna se borra, ningún dato se toca.
--
-- 1 · EL BUG QUE ARRASTRABA LA 006
--
-- `investments.currency` quedó con `check (currency in ('ARS', 'USD'))`. La 007
-- abrió las divisas a lo que el usuario elija en el onboarding y el resto de las
-- tablas pasó al CHECK de ISO 4217 genérico, pero ésta se quedó atrás. La
-- consecuencia concreta: alguien con cuentas en euros no puede cargar una
-- inversión en euros — el insert rebota con 23514 y el mensaje no explica nada.
--
-- 2 · POR QUÉ `amount_invested` Y `current_value` SIGUEN SIENDO DOS
--
-- El pedido original traía un `amount` único. No se aplica: son dos cosas
-- distintas. `amount_invested` es lo que se puso (costo) y `current_value` lo
-- que vale hoy; su diferencia es el resultado de la cartera, que es lo único
-- que dice si la inversión va bien. Colapsarlos en una columna borraría esa
-- lectura de toda la app, incluido el resultado que muestra el Home.
--
-- 3 · PLAZO FIJO COMO TIPO PROPIO
--
-- Hoy se carga como FIXED_INCOME + LOCKED. Funciona —los cálculos ya lo tratan
-- bien— pero en pantalla dice "Renta fija · Inmovilizada", que es una
-- descripción y no un nombre. `TIME_DEPOSIT` es cómo lo llama el usuario.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Plazo fijo en el enum de tipos de activo
-- -----------------------------------------------------------------------------
-- `add value` va suelto y NO adentro de un `do $$`: en un bloque plpgsql el
-- valor nuevo no queda visible para el resto de la transacción, y Postgres
-- rechaza usarlo. Acá sólo se agrega —ninguna fila lo estrena en esta
-- migración— así que alcanza con la forma simple.
alter type public.asset_type add value if not exists 'TIME_DEPOSIT';


-- -----------------------------------------------------------------------------
-- 2. Entidad donde está el activo
-- -----------------------------------------------------------------------------
alter table public.investments
  add column if not exists broker_entity text
    check (broker_entity is null or char_length(trim(broker_entity)) <= 100);

comment on column public.investments.broker_entity is
  'Dónde está el activo: Mercado Pago, Balanz, PPI, Binance. Opcional: dos fondos money market con la misma TNA en dos apps distintas son dos filas que sólo se distinguen por esto.';


-- -----------------------------------------------------------------------------
-- 3. Divisas: alinear con el resto del esquema
-- -----------------------------------------------------------------------------
-- El CHECK viejo se busca por su definición y no por su nombre: la 006 lo creó
-- inline, así que Postgres le puso un nombre generado que puede variar.
do $$
declare
  nombre_check text;
begin
  select con.conname into nombre_check
  from pg_constraint con
  where con.conrelid = 'public.investments'::regclass
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%currency%'
    and pg_get_constraintdef(con.oid) ilike '%ARS%'
    and pg_get_constraintdef(con.oid) ilike '%USD%'
  limit 1;

  if nombre_check is not null then
    execute format('alter table public.investments drop constraint %I', nombre_check);
    raise notice 'CHECK de moneda ARS/USD eliminado: %', nombre_check;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'investments_currency_iso'
  ) then
    alter table public.investments
      add constraint investments_currency_iso check (currency ~ '^[A-Z]{3}$');
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 4. TNA con más techo y `updated_at`
-- -----------------------------------------------------------------------------
-- `numeric(5,2)` tope en 999,99. En pesos una TNA de tres dígitos es normal y
-- entraba holgada, pero el margen no cuesta nada y una hiperinflación no debería
-- rebotar un insert.
alter table public.investments
  alter column expected_tna type numeric(6,2);

alter table public.investments
  add column if not exists updated_at timestamptz not null default now();

-- La función existe desde la 007.
drop trigger if exists investments_tocar_updated_at on public.investments;
create trigger investments_tocar_updated_at
  before update on public.investments
  for each row execute function public.tocar_updated_at();


-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------
-- Las cuatro columnas tienen que dar `true`:
--
--   select
--     exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
--       where t.typname = 'asset_type' and e.enumlabel = 'TIME_DEPOSIT')   as tiene_plazo_fijo,
--     exists (select 1 from information_schema.columns
--       where table_name = 'investments' and column_name = 'broker_entity') as tiene_broker,
--     exists (select 1 from pg_constraint
--       where conname = 'investments_currency_iso')                         as moneda_iso,
--     exists (select 1 from information_schema.columns
--       where table_name = 'investments' and column_name = 'updated_at')    as tiene_updated_at;
