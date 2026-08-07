-- =============================================================================
-- 015 · Gastos compartidos: invitados sin cuenta, liquidaciones y objetivos
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Idempotente.
--
-- NUMERACIÓN: 011 ya ocupa "gastos compartidos". Esto la EXTIENDE, no la
-- reemplaza: las cuatro tablas siguen siendo `shared_*` y sus datos quedan.
--
-- QUÉ CAMBIA Y POR QUÉ
--
-- 1 · MIEMBROS QUE NO TIENEN CUENTA EN AUREM
--
-- Hasta ahora un miembro ERA un usuario: la PK de `shared_space_members` era
-- (space_id, user_id) contra `auth.users`. La consecuencia es que no se podía
-- repartir una cena con alguien que no usa la app — justo el caso más común de
-- una cena. La tabla pasa a tener `id` propio y `user_id` nullable: un miembro
-- con `user_id` es una cuenta, uno sin `user_id` es un invitado que existe sólo
-- adentro de ese grupo.
--
-- Eso arrastra a los gastos y a los repartos, que dejan de apuntar a
-- `auth.users` y pasan a apuntar al MIEMBRO. Es el cambio que hace posible todo
-- lo demás, y el que obliga a reescribir las políticas que filtraban por
-- `user_id`.
--
-- 2 · LIQUIDACIONES CON REGISTRO
--
-- "Saldar" era poner `shared_splits.is_settled = true`. Eso dice que una deuda
-- se pagó pero no quién le pagó a quién, cuánto ni cuándo, así que no hay
-- historial ni forma de deshacer un error. `shared_settlements` guarda el pago
-- como un hecho propio.
--
-- 3 · CATEGORÍA Y TIPO DE REPARTO EXPLÍCITOS
--
-- El reparto siempre se guardó como porcentaje + monto ya redondeado (ver la
-- nota de la 011). Eso no cambia: `split_type` registra CÓMO lo eligió el
-- usuario, para poder volver a abrir el formulario en el modo en que lo cargó.
-- Sin esa columna, un reparto exacto se reabría como porcentajes con decimales.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Miembros: id propio, nombre visible y user_id opcional
-- -----------------------------------------------------------------------------
alter table public.shared_space_members
  add column if not exists id           uuid default gen_random_uuid(),
  add column if not exists display_name text;

-- El backfill va ANTES de poner el NOT NULL. Prioridad: el alias que el usuario
-- eligió para ese grupo, después su nombre de perfil, y recién ahí un genérico.
update public.shared_space_members m
   set display_name = coalesce(
         nullif(trim(m.alias), ''),
         nullif(trim(p.display_name), ''),
         'Miembro'
       )
  from public.user_profiles p
 where p.user_id = m.user_id
   and m.display_name is null;

-- Los que no tienen fila de perfil quedaron fuera del UPDATE de arriba.
update public.shared_space_members
   set display_name = coalesce(nullif(trim(alias), ''), 'Miembro')
 where display_name is null;

do $$
begin
  -- La PK compuesta se cambia por la simple. `if exists` porque correr esto dos
  -- veces tiene que ser un no-op.
  if exists (
    select 1 from pg_constraint
    where conname = 'shared_space_members_pkey'
      and conrelid = 'public.shared_space_members'::regclass
  ) then
    alter table public.shared_space_members drop constraint shared_space_members_pkey;
    alter table public.shared_space_members alter column id set not null;
    alter table public.shared_space_members add primary key (id);
  end if;
end $$;

alter table public.shared_space_members
  alter column display_name set not null,
  alter column user_id drop not null;

-- Una cuenta no puede estar dos veces en el mismo grupo. PARCIAL: los invitados
-- tienen `user_id` nulo y sí pueden repetirse —dos "Juan" distintos en el mismo
-- viaje es un caso real, y son filas distintas con `id` distinto—.
create unique index if not exists shared_members_cuenta_unica
  on public.shared_space_members (space_id, user_id)
  where user_id is not null;

-- El alias ya está copiado en `display_name`: mantener los dos garantiza que se
-- desincronicen.
alter table public.shared_space_members drop column if exists alias;

comment on column public.shared_space_members.user_id is
  'NULL = invitado sin cuenta en AUREM. Existe sólo dentro de este grupo.';
comment on column public.shared_space_members.display_name is
  'Nombre con el que aparece en el grupo. Puede diferir del perfil.';


-- -----------------------------------------------------------------------------
-- 2. Gastos: apuntan al miembro, con categoría y tipo de reparto
-- -----------------------------------------------------------------------------
alter table public.shared_transactions
  add column if not exists paid_by_member_id uuid references public.shared_space_members(id) on delete restrict,
  add column if not exists category_id       uuid references public.categories(id) on delete set null,
  add column if not exists split_type        text not null default 'EQUAL';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shared_transactions_split_type_check'
  ) then
    alter table public.shared_transactions
      add constraint shared_transactions_split_type_check
      check (split_type in ('EQUAL', 'PERCENTAGE', 'EXACT'));
  end if;
end $$;

-- Backfill: cada gasto apuntaba a un `auth.users` que ya es miembro del espacio.
update public.shared_transactions t
   set paid_by_member_id = m.id
  from public.shared_space_members m
 where m.space_id = t.space_id
   and m.user_id = t.paid_by
   and t.paid_by_member_id is null;

-- `on delete restrict` en la FK de arriba no es un descuido: borrar a un
-- miembro que puso plata dejaría gastos sin pagador y los saldos del grupo
-- dejarían de cerrar. La app tiene que impedirlo antes, con un mensaje.

do $$
begin
  -- Sólo se exige NOT NULL si el backfill cubrió todo. Si quedó alguna fila
  -- huérfana —un gasto de alguien que después se fue del grupo— se avisa en vez
  -- de abortar la migración entera.
  if exists (select 1 from public.shared_transactions where paid_by_member_id is null) then
    raise warning 'Hay gastos sin `paid_by_member_id`: su pagador ya no es miembro del espacio. Revisalos antes de exigir NOT NULL.';
  else
    alter table public.shared_transactions alter column paid_by_member_id set not null;
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 3. Repartos: por miembro
-- -----------------------------------------------------------------------------
alter table public.shared_splits
  add column if not exists member_id uuid references public.shared_space_members(id) on delete cascade;

update public.shared_splits s
   set member_id = m.id
  from public.shared_transactions t
  join public.shared_space_members m on m.space_id = t.space_id
 where t.id = s.transaction_id
   and m.user_id = s.user_id
   and s.member_id is null;

do $$
begin
  if exists (select 1 from public.shared_splits where member_id is null) then
    raise warning 'Hay repartos sin `member_id`: la persona ya no es miembro del espacio.';
  else
    alter table public.shared_splits alter column member_id set not null;

    if exists (
      select 1 from pg_constraint
      where conname = 'shared_splits_pkey'
        and conrelid = 'public.shared_splits'::regclass
    ) then
      alter table public.shared_splits drop constraint shared_splits_pkey;
      alter table public.shared_splits add primary key (transaction_id, member_id);
    end if;
  end if;
end $$;

create index if not exists shared_splits_member_idx on public.shared_splits (member_id);


-- -----------------------------------------------------------------------------
-- 4. Liquidaciones
-- -----------------------------------------------------------------------------
create table if not exists public.shared_settlements (
  id             uuid          primary key default gen_random_uuid(),
  space_id       uuid          not null references public.shared_spaces(id) on delete cascade,
  from_member_id uuid          not null references public.shared_space_members(id) on delete cascade,
  to_member_id   uuid          not null references public.shared_space_members(id) on delete cascade,
  amount         numeric(15,2) not null check (amount > 0),
  currency       char(3)       not null default 'ARS' check (currency ~ '^[A-Z]{3}$'),
  note           text          check (note is null or char_length(trim(note)) <= 200),
  /** Quién lo registró. No siempre es quien pagó. */
  created_by     uuid          not null references auth.users(id) on delete cascade,
  created_at     timestamptz   not null default now(),

  -- Un pago de alguien a sí mismo no significa nada y descuadraría los saldos.
  constraint shared_settlements_partes_distintas check (from_member_id <> to_member_id)
);

comment on table public.shared_settlements is
  'Pagos entre miembros para saldar. Antes esto era un booleano en shared_splits, que no decía quién ni cuándo. Ver migrations/015.';

create index if not exists shared_settlements_space_idx
  on public.shared_settlements (space_id, created_at desc);


-- -----------------------------------------------------------------------------
-- 5. Objetivos y presupuestos del grupo
-- -----------------------------------------------------------------------------
create table if not exists public.shared_goals (
  id                   uuid          primary key default gen_random_uuid(),
  space_id             uuid          not null references public.shared_spaces(id) on delete cascade,
  title                text          not null check (char_length(trim(title)) between 1 and 100),
  /**
   * 'CATEGORY_BUDGET' = techo de gasto del grupo en una categoría.
   * 'GROUP_SAVINGS'   = meta de ahorro conjunta con aporte mensual.
   *
   * Texto con CHECK y no enum de Postgres: agregar un valor a un enum pide un
   * ALTER TYPE que no corre dentro de una transacción.
   */
  type                 text          not null check (type in ('CATEGORY_BUDGET', 'GROUP_SAVINGS')),
  category_id          uuid          references public.categories(id) on delete set null,
  target_amount        numeric(15,2) not null check (target_amount > 0),
  monthly_contribution numeric(15,2) check (monthly_contribution is null or monthly_contribution >= 0),
  target_date          date,
  currency             char(3)       not null default 'ARS' check (currency ~ '^[A-Z]{3}$'),
  created_by           uuid          not null references auth.users(id) on delete cascade,
  created_at           timestamptz   not null default now(),
  updated_at           timestamptz   not null default now(),

  -- Un presupuesto sin categoría no tiene contra qué medirse.
  constraint shared_goals_categoria_si_presupuesto
    check (type <> 'CATEGORY_BUDGET' or category_id is not null)
);

comment on table public.shared_goals is
  'Presupuestos por categoría y metas de ahorro, a nivel grupo. Ver migrations/015.';

create index if not exists shared_goals_space_idx on public.shared_goals (space_id);

drop trigger if exists shared_goals_tocar_updated_at on public.shared_goals;
create trigger shared_goals_tocar_updated_at
  before update on public.shared_goals
  for each row execute function public.tocar_updated_at();


-- -----------------------------------------------------------------------------
-- 6. RLS
-- -----------------------------------------------------------------------------
-- `es_miembro_del_espacio` de la 011 sigue sirviendo TAL CUAL: compara
-- `m.user_id = auth.uid()`, y un invitado tiene `user_id` nulo, así que nunca
-- matchea. Un invitado no es un sujeto de RLS — no tiene sesión.

alter table public.shared_settlements enable row level security;
alter table public.shared_goals       enable row level security;

-- --- Miembros: ahora hay que poder agregar y editar invitados ----------------
-- Unirse por QR sigue siendo insertarse a uno mismo. Lo nuevo es que un miembro
-- puede crear invitados (filas con `user_id` nulo) en su propio espacio. Lo que
-- sigue prohibido es agregar a OTRA CUENTA: eso sería meter a alguien en un
-- grupo sin que lo pida.
drop policy if exists "shared_members_insert" on public.shared_space_members;
create policy "shared_members_insert" on public.shared_space_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    or (user_id is null and public.es_miembro_del_espacio(space_id))
  );

drop policy if exists "shared_members_update" on public.shared_space_members;
create policy "shared_members_update" on public.shared_space_members
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or (user_id is null and public.es_miembro_del_espacio(space_id))
  )
  with check (
    user_id = (select auth.uid())
    or (user_id is null and public.es_miembro_del_espacio(space_id))
  );

drop policy if exists "shared_members_delete" on public.shared_space_members;
create policy "shared_members_delete" on public.shared_space_members
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (user_id is null and public.es_miembro_del_espacio(space_id))
  );

-- --- Gastos: la policy de borrado ya no puede mirar `paid_by` ----------------
-- Antes comparaba `paid_by = auth.uid()`. Ahora `paid_by_member_id` apunta a un
-- miembro, que puede ser un invitado sin cuenta, así que hay que resolver el
-- `user_id` de ese miembro.
drop policy if exists "shared_tx_delete" on public.shared_transactions;
create policy "shared_tx_delete" on public.shared_transactions
  for delete to authenticated
  using (
    created_by = (select auth.uid())
    or exists (
      select 1 from public.shared_space_members m
      where m.id = paid_by_member_id and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "shared_tx_update" on public.shared_transactions;
create policy "shared_tx_update" on public.shared_transactions
  for update to authenticated
  using (public.es_miembro_del_espacio(space_id))
  with check (public.es_miembro_del_espacio(space_id));

-- --- Liquidaciones ------------------------------------------------------------
drop policy if exists "shared_settlements_select" on public.shared_settlements;
create policy "shared_settlements_select" on public.shared_settlements
  for select to authenticated using (public.es_miembro_del_espacio(space_id));

drop policy if exists "shared_settlements_insert" on public.shared_settlements;
create policy "shared_settlements_insert" on public.shared_settlements
  for insert to authenticated
  with check (created_by = (select auth.uid()) and public.es_miembro_del_espacio(space_id));

-- Se borra, no se edita: corregir un pago mal cargado es borrarlo y volver a
-- cargarlo. Un UPDATE dejaría un registro que dice una cosa y significó otra.
drop policy if exists "shared_settlements_delete" on public.shared_settlements;
create policy "shared_settlements_delete" on public.shared_settlements
  for delete to authenticated
  using (created_by = (select auth.uid()) and public.es_miembro_del_espacio(space_id));

-- --- Objetivos del grupo ------------------------------------------------------
-- Cualquier miembro los administra: un grupo de gastos no tiene jerarquía real,
-- y pedir rol de admin para poner un techo de gasto sería fricción sin dueño.
drop policy if exists "shared_goals_select" on public.shared_goals;
create policy "shared_goals_select" on public.shared_goals
  for select to authenticated using (public.es_miembro_del_espacio(space_id));

drop policy if exists "shared_goals_insert" on public.shared_goals;
create policy "shared_goals_insert" on public.shared_goals
  for insert to authenticated
  with check (created_by = (select auth.uid()) and public.es_miembro_del_espacio(space_id));

drop policy if exists "shared_goals_update" on public.shared_goals;
create policy "shared_goals_update" on public.shared_goals
  for update to authenticated
  using (public.es_miembro_del_espacio(space_id))
  with check (public.es_miembro_del_espacio(space_id));

drop policy if exists "shared_goals_delete" on public.shared_goals;
create policy "shared_goals_delete" on public.shared_goals
  for delete to authenticated using (public.es_miembro_del_espacio(space_id));

grant select, insert, update, delete on public.shared_settlements to authenticated;
grant select, insert, update, delete on public.shared_goals       to authenticated;


-- -----------------------------------------------------------------------------
-- 7. Columnas viejas: se dejan, no se borran todavía
-- -----------------------------------------------------------------------------
-- `shared_transactions.paid_by` y `shared_splits.user_id` quedan con sus datos.
-- El código nuevo no las lee, pero borrarlas en la misma migración que cambia
-- el modelo deja sin red al deploy: si algo sale mal, volver atrás es
-- redeployar el commit anterior y no restaurar un backup.
--
-- Cuando la 015 esté firme, la limpieza es:
--   alter table public.shared_transactions drop column paid_by;
--   alter table public.shared_splits       drop column user_id;
alter table public.shared_transactions alter column paid_by drop not null;
alter table public.shared_splits       alter column user_id drop not null;


-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------
-- Las cinco columnas tienen que dar `true`:
--
--   select
--     (select count(*) from public.shared_space_members where display_name is null) = 0
--       as miembros_con_nombre,
--     (select count(*) from public.shared_transactions where paid_by_member_id is null) = 0
--       as gastos_con_pagador,
--     (select count(*) from public.shared_splits where member_id is null) = 0
--       as repartos_con_miembro,
--     exists (select 1 from pg_policies where tablename = 'shared_settlements')
--       as settlements_con_rls,
--     exists (select 1 from pg_policies where tablename = 'shared_goals')
--       as goals_con_rls;
