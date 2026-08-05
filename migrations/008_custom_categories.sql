-- =============================================================================
-- 008 · Categorías personalizadas
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Idempotente.
--
-- QUÉ CAMBIA
--
-- Hasta ahora TODAS las categorías eran del usuario: `seed_default_categories`
-- le copia siete a cada uno al registrarse. Funcionan bien, pero la UI no
-- podía distinguir "las que vinieron con la app" de "las que me armé yo", y
-- esa distinción es lo que pide el administrador de categorías: las del
-- sistema se muestran aparte y no se ofrecen para borrar.
--
-- Se resuelve con dos cosas:
--
--   1. `is_custom`  → marca por fila. Las siete sembradas quedan en false.
--   2. `user_id` nullable → habilita categorías GLOBALES (una fila, visible
--      para todos) para más adelante.
--
-- LO QUE ESTA MIGRACIÓN NO HACE, A PROPÓSITO
--
-- No convierte las categorías ya sembradas en globales. Sería una migración
-- destructiva: cada fila está referenciada por `transactions.category_id`, así
-- que "unificar" las siete de cada usuario en una global implicaría reapuntar
-- movimientos ajenos y borrar filas con historial colgando. El modelo por
-- usuario se queda; `user_id is null` queda disponible para categorías nuevas
-- que se quieran publicar globales, sin tocar nada de lo que ya existe.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Marca de categoría personalizada
-- -----------------------------------------------------------------------------
alter table public.categories
  add column if not exists is_custom boolean not null default true;

comment on column public.categories.is_custom is
  'false = vino con la app (seed). true = la creó el usuario.';

-- Las sembradas por `seed_default_categories` son las del sistema. Se
-- reconocen por nombre + tipo: es exactamente la lista del seed, y el índice
-- único (user_id, name, type) garantiza que no haya otra con ese nombre.
--
-- Sólo corre una vez: después de la primera pasada ya no queda ninguna con el
-- default `true` que coincida con la lista, salvo que el usuario se haya
-- creado una llamada igual — y en ese caso ya existía antes con is_custom
-- false, porque el unique lo impide.
update public.categories
set is_custom = false
where (name::text, type::text) in (
  ('Comida', 'EXPENSE'),
  ('Transporte', 'EXPENSE'),
  ('Servicios', 'EXPENSE'),
  ('Ocio', 'EXPENSE'),
  ('Educación', 'EXPENSE'),
  ('Salud', 'EXPENSE'),
  ('Sueldo', 'INCOME')
)
and is_custom is true;

-- El seed sigue insertando categorías del sistema, no personalizadas.
create or replace function public.seed_default_categories(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (user_id, name, type, icon, color, is_custom)
  values
    (p_user_id, 'Comida',     'EXPENSE', 'utensils',       '#F97316', false),
    (p_user_id, 'Transporte', 'EXPENSE', 'bus',            '#3B82F6', false),
    (p_user_id, 'Servicios',  'EXPENSE', 'plug',           '#8B5CF6', false),
    (p_user_id, 'Ocio',       'EXPENSE', 'gamepad-2',      '#EC4899', false),
    (p_user_id, 'Educación',  'EXPENSE', 'graduation-cap', '#14B8A6', false),
    (p_user_id, 'Salud',      'EXPENSE', 'heart-pulse',    '#EF4444', false),
    (p_user_id, 'Sueldo',     'INCOME',  'wallet',         '#22C55E', false)
  on conflict (user_id, name, type) do nothing;
end;
$$;


-- -----------------------------------------------------------------------------
-- 2. Categorías globales: `user_id` pasa a ser opcional
-- -----------------------------------------------------------------------------
alter table public.categories
  alter column user_id drop not null;

comment on column public.categories.user_id is
  'null = categoría global, visible para todos. Con valor = propia del usuario.';

-- El unique (user_id, name, type) NO alcanza para las globales: en Postgres
-- dos NULL no se consideran iguales, así que dejaría entrar "Comida" global
-- repetida infinitas veces. Hace falta un índice parcial aparte.
create unique index if not exists categories_globales_name_type_unique
  on public.categories (name, type)
  where user_id is null;


-- -----------------------------------------------------------------------------
-- 3. RLS: leer las propias MÁS las globales
-- -----------------------------------------------------------------------------
-- Escribir sigue siendo sólo sobre las propias: una categoría global la crea
-- una migración o el service_role, nunca un usuario desde la app.
drop policy if exists "categories_select_own" on public.categories;
create policy "categories_select_own" on public.categories
  for select to authenticated
  using (user_id is null or (select auth.uid()) = user_id);

drop policy if exists "categories_insert_own" on public.categories;
create policy "categories_insert_own" on public.categories
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "categories_update_own" on public.categories;
create policy "categories_update_own" on public.categories
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "categories_delete_own" on public.categories;
create policy "categories_delete_own" on public.categories
  for delete to authenticated
  using ((select auth.uid()) = user_id);


-- -----------------------------------------------------------------------------
-- 4. El trigger de pertenencia tiene que aceptar las globales
-- -----------------------------------------------------------------------------
-- `check_transaction_ownership` exige `c.user_id = new.user_id`. Con una
-- categoría global eso es false y el insert del movimiento rebotaría con
-- 42501. Sin este paso, el punto 2 crea categorías que no se pueden usar.
create or replace function public.check_transaction_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.accounts a
    where a.id = new.account_id and a.user_id = new.user_id
  ) then
    raise exception 'La cuenta % no pertenece al usuario %', new.account_id, new.user_id
      using errcode = '42501';
  end if;

  -- Una categoría sirve si es del usuario O si es global (user_id null).
  if new.category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = new.category_id
      and (c.user_id is null or c.user_id = new.user_id)
  ) then
    raise exception 'La categoría % no pertenece al usuario %', new.category_id, new.user_id
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_check_ownership on public.transactions;
create trigger transactions_check_ownership
  before insert or update of account_id, category_id, user_id on public.transactions
  for each row execute function public.check_transaction_ownership();


-- -----------------------------------------------------------------------------
-- 5. Verificación
-- -----------------------------------------------------------------------------
-- Si alguna columna vuelve `false` o en 0, esa parte NO se aplicó.
select
  exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'categories'
      and column_name = 'is_custom')                                  as columna_is_custom,
  (select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'categories'
      and column_name = 'user_id')                                    as user_id_nullable,
  exists (select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'categories_globales_name_type_unique')         as indice_globales,
  (select count(*) from public.categories where is_custom = false)    as categorias_de_sistema,
  (select count(*) from public.categories where is_custom = true)     as categorias_propias,
  (select pg_get_expr(polqual, polrelid) from pg_policy
    where polname = 'categories_select_own')                          as regla_de_lectura;
