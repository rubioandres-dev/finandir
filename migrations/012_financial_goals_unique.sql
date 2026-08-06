-- =============================================================================
-- 012 · Restricción única real para el upsert de objetivos
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Idempotente.
--
-- EL BUG QUE ARREGLA
--
--   There is no unique or exclusion constraint matching the ON CONFLICT
--   specification
--
-- Guardar un objetivo hacía `upsert(..., { onConflict: 'user_id,type' })` y la
-- 010 no creó una restricción con esas columnas: creó dos índices únicos
-- PARCIALES.
--
--   financial_goals_tipo_unico      (user_id, type)        where category_id is null
--   financial_goals_categoria_unica (user_id, category_id) where category_id is not null
--
-- Un índice parcial SÍ sirve para `ON CONFLICT`, pero solo si la sentencia
-- repite su predicado: `ON CONFLICT (user_id, type) WHERE category_id IS NULL`.
-- PostgREST no expone esa cláusula —`on_conflict=` en la URL solo acepta la
-- lista de columnas— así que emite el ON CONFLICT pelado, Postgres no encuentra
-- ningún índice TOTAL que cubra esas columnas, y rechaza la sentencia con
-- 42P10. No es que faltara la restricción: es que la que había no se podía
-- nombrar desde el cliente.
--
-- POR QUÉ UNA SOLA RESTRICCIÓN SOBRE LAS TRES COLUMNAS
--
-- La regla del producto es "un objetivo por tipo, salvo los de presupuesto, que
-- son uno por categoría". Eso es exactamente `(user_id, type, category_id)`, y
-- se puede expresar con UNA restricción total en vez de dos parciales.
--
-- El detalle está en los NULL: en `category_id is null` (todos los tipos que no
-- son presupuesto), un UNIQUE normal NO restringe nada, porque en SQL dos NULL
-- nunca son iguales entre sí. Se podrían cargar cincuenta objetivos de tasa de
-- ahorro. `NULLS NOT DISTINCT` (Postgres 15+) invierte esa regla para este
-- índice: dos NULL cuentan como el mismo valor, y la restricción vuelve a
-- significar lo que la 010 quería decir.
--
-- La alternativa portable era una columna generada con un UUID centinela en
-- lugar del NULL. Se descartó: agrega una columna al esquema para esquivar una
-- limitación que Supabase ya no tiene (todos los proyectos nuevos vienen con
-- Postgres 15 o superior desde 2023). El bloque de abajo verifica la versión y
-- corta con un mensaje legible si el servidor es más viejo, en vez de dejar el
-- upsert roto en silencio.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Requisitos del servidor
-- -----------------------------------------------------------------------------
do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception
      'Esta migración necesita PostgreSQL 15 o superior (este servidor es %). '
      'Actualizá el proyecto de Supabase, o pedí la variante con columna '
      'generada.', current_setting('server_version');
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 2. Chequeo previo: que no haya duplicados que bloqueen la restricción
-- -----------------------------------------------------------------------------
-- No debería haber ninguno —los índices parciales de la 010 los venían
-- impidiendo—, pero se verifica antes de crear nada. Se INFORMA, no se borra:
-- un DELETE automático sobre datos del usuario para desbloquear una migración
-- es exactamente el tipo de arreglo que después nadie puede deshacer.
do $$
declare
  duplicados int;
begin
  select count(*) into duplicados
  from (
    select 1
    from public.financial_goals
    group by user_id, type, category_id
    having count(*) > 1
  ) as repetidos;

  if duplicados > 0 then
    raise exception
      'Hay % combinaciones (user_id, type, category_id) repetidas en '
      'financial_goals. Resolvelas a mano antes de correr esta migración: '
      'select user_id, type, category_id, count(*) from public.financial_goals '
      'group by 1,2,3 having count(*) > 1;', duplicados;
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 3. La restricción
-- -----------------------------------------------------------------------------
-- Se crea el índice aparte y después se lo adopta como constraint. Es un paso
-- más que `alter table ... add constraint ... unique nulls not distinct (...)`,
-- pero `add constraint` no acepta `if not exists` y correr la migración dos
-- veces tiene que ser un no-op, no un error.
--
-- EL DETALLE QUE ROMPE LA IDEMPOTENCIA SI SE HACE MAL
--
-- `unique using index` no copia el índice: lo ADOPTA y lo renombra con el
-- nombre de la restricción. Después de la primera corrida ya no existe ningún
-- `financial_goals_unico_idx`, así que un `create unique index if not exists`
-- suelto arriba crearía en la segunda pasada un índice nuevo, idéntico y
-- huérfano —el `if not exists` no lo detiene, porque el nombre efectivamente
-- quedó libre—. Por eso las dos sentencias van adentro del mismo `if`: o se
-- hacen las dos, o no se hace ninguna.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'financial_goals_unico'
      and conrelid = 'public.financial_goals'::regclass
  ) then
    raise notice 'financial_goals_unico ya existe: no hay nada que hacer.';
    return;
  end if;

  -- Limpia el residuo de una corrida que haya fallado entre el `create index` y
  -- el `add constraint`: sin esto, el reintento muere con "already exists".
  drop index if exists public.financial_goals_unico_idx;

  create unique index financial_goals_unico_idx
    on public.financial_goals (user_id, type, category_id)
    nulls not distinct;

  alter table public.financial_goals
    add constraint financial_goals_unico
    unique using index financial_goals_unico_idx;
end $$;

comment on constraint financial_goals_unico on public.financial_goals is
  'Un objetivo por tipo; los de presupuesto, uno por categoría. NULLS NOT '
  'DISTINCT hace que los tipos sin categoría también queden restringidos. '
  'Es la que nombra el upsert de app/dashboard/goals/actions.ts.';


-- -----------------------------------------------------------------------------
-- 4. Los índices parciales de la 010 quedan de más
-- -----------------------------------------------------------------------------
-- La restricción nueva cubre los dos casos, así que mantenerlos sería pagar dos
-- escrituras de índice por cada insert para garantizar algo ya garantizado.
--
-- La única regla que se pierde es "una categoría no puede tener dos objetivos
-- aunque sean de tipos distintos". Es una regla que no aplica a nada: de los
-- cinco tipos, CATEGORY_BUDGET es el único que usa `category_id`.
drop index if exists public.financial_goals_tipo_unico;
drop index if exists public.financial_goals_categoria_unica;


-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------
-- Tiene que devolver una fila: financial_goals_unico | u
--
--   select conname, contype
--   from pg_constraint
--   where conrelid = 'public.financial_goals'::regclass and contype = 'u';
