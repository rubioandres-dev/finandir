-- =============================================================================
-- 019 · La categoría viaja adentro de la fila compartida
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Idempotente.
-- Requiere: 015 y 018 aplicadas.
--
-- POR QUÉ
--
-- `shared_transactions.category_id` y `shared_goals.category_id` apuntaban a
-- `public.categories` con `on delete set null`. Con la 018 las categorías
-- personales se van a un bloque cifrado que el servidor no puede leer, así que
-- esa FK deja de poder existir: no hay tabla contra la cual validarla.
--
-- ARREGLA ALGO QUE YA ESTABA ROTO
--
-- Y conviene decirlo, porque no es sólo una concesión al cifrado. En un espacio
-- compartido cada miembro tiene SUS PROPIAS categorías, con sus propios ids. La
-- RLS de `categories` limita cada fila a su dueño. O sea: el `category_id` de un
-- gasto compartido apuntaba a una categoría que NINGÚN otro miembro del grupo
-- podía leer. Servía como clave de agrupación y nada más; el nombre no se podía
-- mostrar del otro lado.
--
-- Con el nombre, el ícono y el color copiados en la fila, la categoría se vuelve
-- legible para todo el grupo por primera vez.
--
-- ES UNA FOTO, NO UN VÍNCULO
--
-- Renombrar "Comida" a "Delivery" en tus categorías NO cambia los gastos
-- compartidos viejos. Es deliberado y es lo mismo que ya hace `amount_owed` con
-- el reparto: el dato queda congelado como estaba cuando se cargó. Un grupo no
-- puede depender de que una persona no renombre una categoría suya.
--
-- `category_id` SOBREVIVE, sin FK
--
-- Se conserva como clave de agrupación opaca: le sirve al dueño para reconciliar
-- contra sus propias categorías cifradas. No se valida contra nada y para los
-- demás miembros no significa nada.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Las columnas nuevas
-- -----------------------------------------------------------------------------
alter table public.shared_transactions
  add column if not exists category_name  text,
  add column if not exists category_icon  text,
  add column if not exists category_color text;

alter table public.shared_goals
  add column if not exists category_name  text,
  add column if not exists category_icon  text,
  add column if not exists category_color text;

comment on column public.shared_transactions.category_name is
  'Foto del nombre al momento de cargar el gasto. No sigue los renombres.';
comment on column public.shared_transactions.category_id is
  'Clave de agrupacion opaca, sin FK. Solo su dueno puede resolverla.';


-- -----------------------------------------------------------------------------
-- 2. Backfill, MIENTRAS `categories` todavía se pueda leer
-- -----------------------------------------------------------------------------
-- Este bloque es el único momento en que se puede hacer: después de que un
-- usuario pase al modo cifrado, sus categorías ya no están en la base y el dato
-- se pierde para siempre. Por eso la 019 va ANTES de habilitar el modo, no
-- después.
--
-- Corre como dueño del esquema (el SQL Editor usa service_role), así que ve
-- todas las filas salteando RLS. Es correcto: es una migración de datos, no una
-- consulta de la app.
update public.shared_transactions st
   set category_name  = c.name,
       category_icon  = c.icon,
       category_color = c.color
  from public.categories c
 where c.id = st.category_id
   and st.category_name is null;

update public.shared_goals sg
   set category_name  = c.name,
       category_icon  = c.icon,
       category_color = c.color
  from public.categories c
 where c.id = sg.category_id
   and sg.category_name is null;


-- -----------------------------------------------------------------------------
-- 3. Fuera las claves foráneas
-- -----------------------------------------------------------------------------
-- Se buscan por catálogo en vez de por nombre fijo: el nombre por defecto de
-- Postgres es `<tabla>_<columna>_fkey`, pero si alguna se creó a mano con otro
-- nombre un `drop constraint if exists` la dejaría viva y la migración diría que
-- funcionó sin haber hecho nada.
do $$
declare
  r record;
begin
  for r in
    select con.conname, rel.relname
      from pg_constraint con
      join pg_class      rel on rel.oid = con.conrelid
      join pg_namespace  nsp on nsp.oid = rel.relnamespace
      join pg_class      ref on ref.oid = con.confrelid
     where nsp.nspname = 'public'
       and con.contype = 'f'
       and rel.relname in ('shared_transactions', 'shared_goals')
       and ref.relname = 'categories'
  loop
    execute format('alter table public.%I drop constraint %I', r.relname, r.conname);
    raise notice 'FK eliminada: %.%', r.relname, r.conname;
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- 4. El CHECK de los objetivos pasa a mirar el nombre
-- -----------------------------------------------------------------------------
-- Un objetivo de tipo CATEGORY_BUDGET necesita una categoría que el GRUPO pueda
-- ver. `category_id` ya no garantiza eso —es opaco para los demás—, así que lo
-- que tiene que estar presente es el nombre.
alter table public.shared_goals
  drop constraint if exists shared_goals_category_required;

do $$
begin
  -- Sólo se agrega si no quedó ninguna fila que lo viole. Una migración que
  -- falla a mitad de camino por datos viejos es peor que una que avisa.
  if not exists (
    select 1 from public.shared_goals
     where type = 'CATEGORY_BUDGET' and category_name is null
  ) then
    alter table public.shared_goals
      add constraint shared_goals_category_required
      check (type <> 'CATEGORY_BUDGET' or category_name is not null);
  else
    raise warning
      'Hay objetivos CATEGORY_BUDGET sin category_name (la categoria ya no existia). '
      'El CHECK no se agrego. Completalos y volve a correr la 019.';
  end if;
end
$$;
