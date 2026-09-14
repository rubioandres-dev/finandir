-- =============================================================================
-- 022 · Borrar los datos en claro de quien YA migró
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Se puede correr muchas veces.
--
-- ██ BORRA DATOS. No se puede deshacer. ██
--
-- POR QUÉ EXISTE, Y POR QUÉ ES MEJOR QUE LA 021
--
-- La 021 borra las TABLAS, así que necesita que TODOS hayan migrado. Y como la
-- clave de cada usuario se deriva de su contraseña —que nunca llega al
-- servidor—, nadie puede migrar a nadie: sólo cada uno puede activar su Bóveda.
--
-- Eso hace que la 021 dependa del último usuario que se decida. Si uno no lo
-- hace nunca, las tablas no se borran nunca, y mientras tanto los datos de los
-- que SÍ migraron siguen ahí, legibles, al lado de su copia cifrada.
--
-- Esto borra por USUARIO. El que activa Bóveda hoy tiene el cifrado real hoy,
-- sin esperar a nadie. La 021 queda para el final, cuando no quede ninguno.
--
-- A QUIÉN TOCA
--
-- Sólo a los usuarios que cumplen LAS DOS condiciones:
--
--   1. su `storage_backend` NO es 'SUPABASE'
--   2. tienen al menos un bloque escrito en `almacen_bloques`
--
-- La segunda no es redundante: un puntero movido sin datos copiados significa
-- que la migración no terminó, y borrarle las filas a ese usuario lo deja sin
-- nada. Se pide evidencia de la copia, no la promesa del puntero.
--
-- QUÉ **NO** TOCA
--
--   user_profiles        las preferencias se quedan en claro, por diseño
--   shared_*             gastos compartidos: siguen relacionales
--   bug_reports          bandeja de soporte
--   exchange_rates       caché global sin user_id
-- =============================================================================

do $$
declare
  v_migrados uuid[];
  v_borradas int;
  v_total int := 0;
begin
  -- Un solo cálculo, reusado por todos los deletes: así no hay forma de que un
  -- usuario entre en el criterio de una tabla y no en el de otra.
  select coalesce(array_agg(p.user_id), '{}')
    into v_migrados
    from public.user_profiles p
   where p.storage_backend <> 'SUPABASE'
     and exists (select 1 from public.almacen_bloques b where b.user_id = p.user_id);

  if array_length(v_migrados, 1) is null then
    raise notice 'No hay usuarios migrados con datos cifrados. No se borra nada.';
    return;
  end if;

  raise notice 'Usuarios migrados: %', array_length(v_migrados, 1);

  -- El orden es el de las dependencias: primero lo que apunta, después lo
  -- apuntado. `credit_card_details` y `category_budgets` caen solos por sus
  -- cascadas, pero se borran explícitos para que el conteo sea honesto.
  delete from public.category_budgets where user_id = any(v_migrados);
  get diagnostics v_borradas = row_count;
  v_total := v_total + v_borradas;
  raise notice '  category_budgets: %', v_borradas;

  delete from public.credit_card_details
   where account_id in (select id from public.accounts where user_id = any(v_migrados));
  get diagnostics v_borradas = row_count;
  v_total := v_total + v_borradas;
  raise notice '  credit_card_details: %', v_borradas;

  -- Las deudas antes que los movimientos: `source_transaction_id` los apunta.
  delete from public.debts where user_id = any(v_migrados);
  get diagnostics v_borradas = row_count;
  v_total := v_total + v_borradas;
  raise notice '  debts: %', v_borradas;

  -- Las cuotas antes que sus madres, por `parent_transaction_id`.
  delete from public.transactions
   where user_id = any(v_migrados) and parent_transaction_id is not null;
  get diagnostics v_borradas = row_count;
  v_total := v_total + v_borradas;
  raise notice '  transactions (cuotas): %', v_borradas;

  delete from public.transactions where user_id = any(v_migrados);
  get diagnostics v_borradas = row_count;
  v_total := v_total + v_borradas;
  raise notice '  transactions (resto): %', v_borradas;

  delete from public.financial_goals where user_id = any(v_migrados);
  get diagnostics v_borradas = row_count;
  v_total := v_total + v_borradas;
  raise notice '  financial_goals: %', v_borradas;

  delete from public.investments where user_id = any(v_migrados);
  get diagnostics v_borradas = row_count;
  v_total := v_total + v_borradas;
  raise notice '  investments: %', v_borradas;

  -- Las categorías después de los movimientos: aunque la FK sea `set null`,
  -- borrarlas antes dejaría los movimientos sin clasificar durante el rato que
  -- dura la transacción, y si algo falla en el medio, para siempre.
  delete from public.categories where user_id = any(v_migrados);
  get diagnostics v_borradas = row_count;
  v_total := v_total + v_borradas;
  raise notice '  categories: %', v_borradas;

  delete from public.accounts where user_id = any(v_migrados);
  get diagnostics v_borradas = row_count;
  v_total := v_total + v_borradas;
  raise notice '  accounts: %', v_borradas;

  raise notice 'Filas borradas: %', v_total;
end
$$;


-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------
-- Tiene que devolver CERO. Si devuelve algo, hay datos en claro de alguien que
-- ya está en modo cifrado.
--
--   select count(*) as filas_en_claro_de_migrados
--     from public.transactions t
--     join public.user_profiles p on p.user_id = t.user_id
--    where p.storage_backend <> 'SUPABASE';
--
-- Y para ver a quién falta convencer:
--
--   select user_id, storage_backend
--     from public.user_profiles
--    where storage_backend = 'SUPABASE';
