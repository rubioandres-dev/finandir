-- =============================================================================
-- 021 · Borrar las tablas en claro
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor.
--
-- ██ ESTA MIGRACIÓN NO SE PUEDE DESHACER ██
--
-- Todas las anteriores son idempotentes y reversibles. Esta borra datos y no
-- hay `undo`. Leela entera antes de correrla.
--
-- POR QUÉ EXISTE
--
-- Activar el modo Bóveda COPIA los datos a bloques cifrados y deja las tablas
-- viejas intactas, a propósito, para poder arrepentirse. Eso significa que
-- mientras estas tablas existan, las finanzas del usuario siguen ahí, legibles,
-- al lado de su copia cifrada.
--
-- La promesa de cifrado NO es real el día que alguien activa el modo. Es real
-- el día que se corre esto.
--
-- ESTA NO ES LA QUE VAS A CORRER PRIMERO
--
-- Borra las TABLAS, asi que necesita que TODOS los usuarios hayan migrado. Y
-- como la clave de cada uno se deriva de su contrasenia —que nunca llega al
-- servidor— nadie puede migrar a nadie: solo cada usuario puede activar su
-- Boveda. Eso hace que esta migracion dependa del ultimo que se decida.
--
-- Para no esperar a nadie esta la 022, que borra las filas de QUIEN YA MIGRO.
-- Esta queda para el final, cuando no quede ninguno en modo Estandar.
--
-- LA GUARDA
--
-- Aborta si queda UN solo usuario en modo SUPABASE. Borrarle las tablas a
-- alguien que todavía lee de ahí no es un bug con mala suerte: es dejarlo sin
-- sus finanzas, sin copia y sin aviso.
--
-- La guarda no se saltea "porque en mi base no hay nadie asi". Si aborta, hay
-- alguien — andá a ver quién antes de tocar nada.
--
-- QUÉ **NO** BORRA
--
--   user_profiles        las preferencias se quedan en claro, por disenio
--   almacen_bloques      es el destino, no el origen
--   almacen_sobres       sin el sobre no se abre ningun bloque
--   bug_reports          bandeja de soporte, sin datos financieros
--   exchange_rates       cache global de cotizaciones, sin user_id
--   shared_*             gastos compartidos: siguen relacionales
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. La guarda
-- -----------------------------------------------------------------------------
do $$
declare
  v_en_claro int;
  v_sin_bloques int;
begin
  select count(*) into v_en_claro
    from public.user_profiles
   where storage_backend = 'SUPABASE';

  if v_en_claro > 0 then
    raise exception
      'Hay % usuario(s) en modo Estandar. Borrar ahora los deja sin sus datos. '
      'Corre: select user_id from user_profiles where storage_backend = ''SUPABASE'';',
      v_en_claro;
  end if;

  -- Segunda guarda, contra el error opuesto: un usuario marcado como migrado
  -- que en realidad no tiene ni un bloque escrito. Eso significa que la
  -- migracion de datos no corrio, y el puntero miente.
  select count(*) into v_sin_bloques
    from public.user_profiles p
   where p.storage_backend <> 'SUPABASE'
     and not exists (
       select 1 from public.almacen_bloques b where b.user_id = p.user_id
     );

  if v_sin_bloques > 0 then
    raise exception
      'Hay % usuario(s) marcados como migrados SIN un solo bloque cifrado. '
      'El puntero dice una cosa y los datos dicen otra: revisalo antes de borrar.',
      v_sin_bloques;
  end if;

  raise notice 'Guardas OK. Se borran las tablas en claro.';
end
$$;


-- -----------------------------------------------------------------------------
-- 2. La FK que cruza de deudas a movimientos
-- -----------------------------------------------------------------------------
-- `debts.source_transaction_id` referencia a `transactions`. Se suelta antes de
-- borrar nada: si no, el drop falla a mitad de camino y deja el esquema en un
-- estado que nadie escribio a proposito.
--
-- `debts` se borra igual mas abajo; esto es para que el orden no importe.
alter table if exists public.debts
  drop constraint if exists debts_source_transaction_id_fkey;


-- -----------------------------------------------------------------------------
-- 3. Las tablas
-- -----------------------------------------------------------------------------
-- En orden de dependencia: primero las que apuntan, despues las apuntadas.
-- `cascade` igual, porque los indices, triggers y politicas cuelgan de ellas.
drop table if exists public.category_budgets     cascade;
drop table if exists public.credit_card_details  cascade;
drop table if exists public.transactions         cascade;
drop table if exists public.debts                cascade;
drop table if exists public.investments          cascade;
drop table if exists public.financial_goals      cascade;
drop table if exists public.categories           cascade;
drop table if exists public.accounts             cascade;

-- La tabla de presupuestos anterior a la 013. Ya nadie la leia ni la escribia
-- desde entonces; se va con el resto.
drop table if exists public.budgets              cascade;


-- -----------------------------------------------------------------------------
-- 4. Lo que quedaba colgado
-- -----------------------------------------------------------------------------
-- Los triggers y las funciones de saldo e integridad no tienen a quien cuidar.
drop function if exists public.apply_transaction_to_balance()  cascade;
drop function if exists public.check_transaction_ownership()   cascade;
drop function if exists public.seed_default_categories(uuid)   cascade;
drop function if exists public.seed_my_default_categories()    cascade;

-- El trigger de alta sembraba categorias en una tabla que ya no existe.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;

-- Los tipos enumerados quedan sin columnas que los usen.
drop type if exists public.transaction_type cascade;
drop type if exists public.category_type    cascade;


-- -----------------------------------------------------------------------------
-- 5. Verificación
-- -----------------------------------------------------------------------------
-- Tiene que devolver CERO filas. Si devuelve alguna, algo no se borro y el dato
-- sigue legible.
--
--   select table_name
--     from information_schema.tables
--    where table_schema = 'public'
--      and table_name in (
--        'accounts', 'categories', 'transactions', 'debts', 'investments',
--        'financial_goals', 'category_budgets', 'credit_card_details', 'budgets'
--      );
