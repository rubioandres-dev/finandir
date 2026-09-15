-- =============================================================================
-- 025 · Que un admin pueda completar la rotación de la llave
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Se puede correr muchas veces.
--
-- NO BORRA NADA. Agrega una función y ensancha una policy.
--
-- DOS AGUJEROS DEL MISMO TIPO QUE LA 024
--
-- Un test contra esta base encontró que un admin que NO es el creador podía
-- rotar la llave a medias. Las dos veces por lo mismo: un UPDATE que la RLS
-- descarta no falla, devuelve éxito habiendo tocado cero filas.
--
--   1. `shared_spaces.generacion` sólo la puede escribir `created_by` (011).
--      El admin insertaba las llaves de la generación nueva y re-cifraba los
--      gastos, pero el espacio seguía diciendo que la vigente era la vieja. La
--      próxima escritura usaba la llave ANTERIOR — la que el expulsado tiene.
--
--   2. La policy de cifrado de pagos (023) sólo deja tocar filas que están en
--      claro. Perfecto para el backfill, y justo lo contrario de lo que hace
--      falta al rotar: ahí hay que reescribir pagos que YA están cifrados, con
--      la llave nueva. Sin esto, los pagos se quedan en la generación vieja.
--
-- En los dos casos la rotación decía que había terminado y no había terminado.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Subir la generación siendo admin
-- -----------------------------------------------------------------------------
-- `security definer` y no una policy de UPDATE sobre `shared_spaces` porque un
-- admin necesita poder mover ESTA columna y ninguna otra. Una policy abierta le
-- daría de paso el nombre, el tipo y la moneda del grupo, que es una decisión
-- de producto que nadie tomó.
--
-- Devuelve la generación que quedó guardada. Quien llama la compara con la que
-- esperaba: es lo que convierte "no pasó nada" en un error.
create or replace function public.subir_generacion_del_espacio(
  p_space_id   uuid,
  p_generacion int
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actual int;
begin
  if not public.es_admin_del_espacio(p_space_id) then
    raise exception 'Solo un administrador puede rotar la llave del grupo.'
      using errcode = '42501';
  end if;

  select generacion into v_actual
    from public.shared_spaces
   where id = p_space_id;

  if v_actual is null then
    raise exception 'El espacio no existe.' using errcode = 'P0002';
  end if;

  -- Nunca baja. Si dos rotaciones se cruzan, el grupo no puede terminar
  -- apuntando a una llave anterior a la que ya se repartió.
  if p_generacion <= v_actual then
    return v_actual;
  end if;

  update public.shared_spaces
     set generacion = p_generacion
   where id = p_space_id;

  return p_generacion;
end
$$;

revoke all on function public.subir_generacion_del_espacio(uuid, int) from public;
grant execute on function public.subir_generacion_del_espacio(uuid, int) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. Re-cifrar un pago que ya estaba cifrado
-- -----------------------------------------------------------------------------
-- La 023 puso `payload_cifrado is null` en el `using` para que la única edición
-- posible fuera el backfill. Al rotar hace falta lo otro: reescribir el sobre
-- de un pago ya cifrado con la llave nueva.
--
-- EL PRECIO, DICHO EN VOZ ALTA
--
-- Con esto, un miembro puede pisar el sobre del pago de otro. No puede LEER
-- nada que no leyera ya —está en el grupo, ve todo el grupo— pero sí puede
-- romper un pago ajeno. Antes sólo podía borrar los suyos.
--
-- Se acepta porque la alternativa es peor: sin esto, echar a alguien deja sus
-- pagos cifrados con la llave que se llevó. Una rotación incompleta es una
-- promesa incumplida, y esta es la que hicimos.
--
-- Lo que el `with check` sigue garantizando es que de acá no puede salir una
-- fila legible: el resultado es siempre un sobre, con `amount` y `note` en NULL.
drop policy if exists "shared_settlements_cifrar" on public.shared_settlements;
create policy "shared_settlements_cifrar" on public.shared_settlements
  for update to authenticated
  using (public.es_miembro_del_espacio(space_id))
  with check (
    public.es_miembro_del_espacio(space_id)
    and payload_cifrado is not null
    and amount is null
    and note is null
  );


-- -----------------------------------------------------------------------------
-- 3. Verificación
-- -----------------------------------------------------------------------------
-- Las dos tienen que devolver una fila:
--
--   select proname from pg_proc where proname = 'subir_generacion_del_espacio';
--
--   select policyname from pg_policies
--    where tablename = 'shared_settlements' and policyname = 'shared_settlements_cifrar';
