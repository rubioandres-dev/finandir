-- =============================================================================
-- 024 · Que un admin pueda sacar a alguien del grupo
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Se puede correr muchas veces.
--
-- NO BORRA NADA. Agrega una policy.
--
-- EL AGUJERO
--
-- `shared_members_delete` (015) deja borrar SÓLO la fila propia, o la de un
-- invitado sin cuenta. O sea: un admin nunca pudo sacar del grupo a alguien con
-- cuenta. El DELETE no fallaba — afectaba cero filas y devolvía éxito.
--
-- Con los gastos en claro eso era un botón que no andaba. Con los gastos
-- cifrados es peor, y por un camino que no se ve:
--
--   1. el admin expulsa: se rota la llave y se re-cifra el grupo entero
--   2. el DELETE no borra nada, así que el expulsado sigue siendo miembro
--   3. la próxima vez que un admin abre el grupo, el expulsado figura como
--      "miembro sin llave de la generación vigente"
--   4. …y el reparto automático se la da
--
-- La expulsión se deshace sola, sin un solo error en el camino. Lo encontró un
-- test contra esta base: todo lo demás del ciclo daba bien y el expulsado
-- seguía en la lista de miembros.
--
-- LA REGLA
--
-- Un admin puede sacar a cualquiera de SU espacio. Cualquiera puede irse solo.
-- Nadie puede sacar a alguien de un espacio del que no es admin.
--
-- El trigger `impedir_espacio_sin_admin` de la 020 sigue cuidando lo otro: el
-- último admin no se puede ir ni ser sacado, porque un espacio sin admin es un
-- espacio donde nadie puede volver a repartir la llave.
-- =============================================================================

drop policy if exists "shared_members_delete" on public.shared_space_members;
create policy "shared_members_delete" on public.shared_space_members
  for delete to authenticated
  using (
    -- Irse uno mismo.
    user_id = (select auth.uid())
    -- Sacar a un invitado sin cuenta: es un dato del grupo, no una persona con
    -- sesión. Cualquier miembro puede, como antes de esta migración.
    or (user_id is null and public.es_miembro_del_espacio(space_id))
    -- Y lo que faltaba: un admin saca a un miembro con cuenta.
    or public.es_admin_del_espacio(space_id)
  );


-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------
-- Tiene que devolver una fila con `es_admin_del_espacio` adentro del `using`:
--
--   select qual
--     from pg_policies
--    where tablename = 'shared_space_members'
--      and policyname = 'shared_members_delete';
