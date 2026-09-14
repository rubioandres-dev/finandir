-- =============================================================================
-- 023 · Los gastos compartidos, cifrados con la llave del grupo
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Se puede correr muchas veces.
--
-- NO BORRA NADA. Sólo afloja restricciones para que el dato pueda dejar de
-- estar en claro. Lo que borra los datos legibles es el cliente, cuando
-- re-escribe cada fila cifrada — y recién ahí.
--
-- QUÉ CIERRA ESTA MIGRACIÓN
--
-- Los gastos compartidos eran el último lugar donde el servidor podía leer
-- finanzas concretas: cuánto, en qué y con quién. La 020 dejó construidas las
-- llaves de grupo y la columna `payload_cifrado`, pero las columnas en claro
-- seguían siendo NOT NULL, así que no se podía escribir una fila cifrada sin
-- escribir también su versión legible al lado. Esto lo destraba.
--
-- QUÉ QUEDA EN CLARO, Y POR QUÉ NO ES UN DESCUIDO
--
--   space_id            es el filtro de la RLS: cifrado no habría permisos
--   date                ordena y pagina del lado del servidor
--   paid_by_member_id   FK con cascada: sin ella, borrar un miembro deja basura
--   currency            no dice cuánto, y agrupa los saldos
--   generacion          dice con qué llave abrir; es metadato de la llave
--
-- El servidor ve "el miembro X cargó algo el 12 de marzo". No ve cuánto, ni de
-- qué, ni cómo se repartió.
--
-- LAS FILAS VIEJAS
--
-- Se quedan en claro hasta que un miembro con la llave abre el grupo: recién
-- ahí hay quien pueda cifrarlas. El cliente las re-escribe y NULea las columnas
-- legibles. No se puede hacer desde acá, que es exactamente el punto.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Los gastos
-- -----------------------------------------------------------------------------
-- `amount` y `description` pasan al payload cifrado. Los CHECK se van con el
-- NOT NULL: un check sobre una columna que ahora es NULL en toda fila nueva
-- sólo puede estorbar.
alter table public.shared_transactions
  alter column amount      drop not null,
  alter column description drop not null,
  alter column split_type  drop not null;

alter table public.shared_transactions
  drop constraint if exists shared_transactions_amount_check,
  drop constraint if exists shared_transactions_description_check,
  drop constraint if exists shared_transactions_split_type_check;

comment on column public.shared_transactions.amount is
  'En claro sólo en filas anteriores a la 023. Las nuevas lo llevan dentro de payload_cifrado.';


-- -----------------------------------------------------------------------------
-- 2. Los repartos
-- -----------------------------------------------------------------------------
-- `shared_splits` deja de escribirse: el reparto viaja adentro del payload del
-- gasto, que es donde puede estar cifrado. La tabla se queda para poder leer lo
-- viejo, y se va a borrar cuando no quede ninguna fila sin cifrar.
--
-- Que el reparto sea una lista adentro del gasto y no filas propias tiene un
-- costo real: si se borra un miembro, su `member_id` queda colgado adentro del
-- texto cifrado, donde ninguna FK lo puede limpiar. Lo resuelve el cliente al
-- mostrarlo. Es el precio de que el servidor no pueda leer: toda integridad que
-- dependía de mirar el dato se muda a donde el dato se puede ver.
comment on table public.shared_splits is
  'Sólo lectura desde la 023. El reparto de los gastos nuevos va dentro de shared_transactions.payload_cifrado.';


-- -----------------------------------------------------------------------------
-- 3. Los pagos entre miembros
-- -----------------------------------------------------------------------------
-- La 020 le puso payload a gastos y objetivos, pero no a los pagos. Un pago
-- dice "A le pasó $X a B", que es exactamente el tipo de dato que no queremos
-- que el servidor tenga.
alter table public.shared_settlements
  add column if not exists payload_cifrado text,
  add column if not exists generacion      int;

alter table public.shared_settlements
  alter column amount drop not null;

alter table public.shared_settlements
  drop constraint if exists shared_settlements_amount_check;

comment on column public.shared_settlements.payload_cifrado is
  'AES-GCM con la clave del grupo: `v1.<iv>.<datos>`. Lleva el importe y la nota.';

-- Un pago se borra y se vuelve a cargar, no se edita: por eso no existía una
-- policy de UPDATE. Pero los pagos que ya están cargados hay que poder
-- cifrarlos, y eso sólo lo puede hacer un miembro desde su navegador.
--
-- La policy abre exactamente esa puerta y ninguna otra: sólo toca filas que
-- todavía están EN CLARO (`using`), y sólo las deja en estado cifrado y sin
-- rastro legible (`with check`). Un pago ya cifrado no se puede volver a tocar,
-- así que la regla de "se borra, no se edita" sigue valiendo para todo lo que
-- viene después del backfill.
drop policy if exists "shared_settlements_cifrar" on public.shared_settlements;
create policy "shared_settlements_cifrar" on public.shared_settlements
  for update to authenticated
  using (
    public.es_miembro_del_espacio(space_id)
    and payload_cifrado is null
  )
  with check (
    public.es_miembro_del_espacio(space_id)
    and payload_cifrado is not null
    and amount is null
    and note is null
  );

-- `from_member_id` y `to_member_id` siguen en claro: son FK con cascada y son
-- lo que la RLS necesita para decidir quién puede ver el pago. Sin el importe,
-- "A y B arreglaron algo" no es un dato financiero.


-- -----------------------------------------------------------------------------
-- 4. Los objetivos del grupo
-- -----------------------------------------------------------------------------
alter table public.shared_goals
  alter column title         drop not null,
  alter column target_amount drop not null;

alter table public.shared_goals
  drop constraint if exists shared_goals_title_check,
  drop constraint if exists shared_goals_target_amount_check;

-- La 019 exigía `category_name` en los presupuestos de categoría, porque era lo
-- único que el resto del grupo podía leer. Ahora el nombre va dentro del sobre,
-- donde lo leen todos los miembros y nadie más, así que el CHECK impediría
-- justamente la versión cifrada.
alter table public.shared_goals
  drop constraint if exists shared_goals_category_required;


-- -----------------------------------------------------------------------------
-- 5. Que no se pueda escribir una fila muda
-- -----------------------------------------------------------------------------
-- Aflojar los NOT NULL abre una puerta que antes no existía: insertar una fila
-- sin dato en claro Y sin dato cifrado. Eso no es un gasto, es un renglón que
-- nadie puede leer y que igual entra en los saldos como cero.
--
-- `not valid` a propósito: las filas viejas ya cumplen, pero pedir la
-- validación completa bloquearía la tabla en una migración que no lo necesita.
-- Rige para todo lo que se escriba de acá en adelante, que es lo que importa.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shared_transactions_tiene_dato'
  ) then
    alter table public.shared_transactions
      add constraint shared_transactions_tiene_dato
      check (payload_cifrado is not null or amount is not null) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'shared_settlements_tiene_dato'
  ) then
    alter table public.shared_settlements
      add constraint shared_settlements_tiene_dato
      check (payload_cifrado is not null or amount is not null) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'shared_goals_tiene_dato'
  ) then
    alter table public.shared_goals
      add constraint shared_goals_tiene_dato
      check (payload_cifrado is not null or target_amount is not null) not valid;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 6. Verificación
-- -----------------------------------------------------------------------------
-- Cuántas filas quedan legibles por el servidor. Baja sola a medida que los
-- miembros van abriendo sus grupos; cuando dé todo en cero se pueden dropear
-- las columnas en claro y la tabla `shared_splits`.
--
--   select 'gastos'    as tabla, count(*) from public.shared_transactions where amount        is not null
--   union all
--   select 'pagos',              count(*) from public.shared_settlements  where amount        is not null
--   union all
--   select 'objetivos',          count(*) from public.shared_goals        where target_amount is not null
--   union all
--   select 'repartos',           count(*) from public.shared_splits;
