-- =============================================================================
-- 011 · Gastos compartidos, invitación por QR y módulos activos
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Idempotente.
--
-- NUMERACIÓN: el pedido decía 010, pero ese número ya lo ocupa
-- 010_goals_and_aurem_tier.sql, que además ya está aplicada. Renumerado a 011.
--
-- QUÉ MODELA
--
-- Un ESPACIO es un grupo de gente que comparte gastos: una casa, un viaje, una
-- cena. Adentro, cada gasto tiene UN pagador y N repartos, uno por persona que
-- participa. La suma de los repartos es el gasto: por eso el porcentaje y el
-- monto conviven en la misma fila.
--
-- POR QUÉ EL PORCENTAJE Y EL MONTO ESTÁN LOS DOS
--
-- Se podría guardar sólo el porcentaje y multiplicar al leer. No se hace,
-- porque el redondeo no cierra: tres personas al 33,33% de $100 dan $99,99 y
-- falta un centavo que alguien tiene que poner. `amount_owed` guarda el
-- reparto YA redondeado y cuadrado, y el porcentaje queda como el dato que el
-- usuario eligió. Si sólo guardáramos el porcentaje, el centavo bailaría según
-- quién lo lea.
--
-- POR QUÉ NO HAY TABLA DE INVITACIONES
--
-- El QR codifica una URL con el `space_id`. Unirse es un insert en
-- `shared_space_members`, y la política de RLS es la que decide si se puede.
-- Una tabla de tokens agregaría expiración y revocación, que son features que
-- nadie pidió: cuando hagan falta, el QR ya apunta a una URL que puede cambiar
-- sin tocar la app.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Módulos activos del usuario
-- -----------------------------------------------------------------------------
-- JSONB y no una columna por módulo: la lista crece cada vez que se agrega una
-- sección, y una migración por switch es una migración de más. Lo que NO está
-- en el objeto se considera activo, así que un módulo nuevo aparece prendido
-- para todos sin tener que escribirle un default a cada fila.
alter table public.user_profiles
  add column if not exists active_modules jsonb not null default '{}'::jsonb;

comment on column public.user_profiles.active_modules is
  'Flags por módulo. Ausente = activo. accounts y transactions se ignoran: son fijos.';


-- -----------------------------------------------------------------------------
-- 2. Espacios compartidos
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'shared_space_type') then
    create type public.shared_space_type as enum ('CONVIVENCIA', 'VIAJE', 'EVENTO');
  end if;

  if not exists (select 1 from pg_type where typname = 'shared_member_role') then
    create type public.shared_member_role as enum ('ADMIN', 'MEMBER');
  end if;
end
$$;

create table if not exists public.shared_spaces (
  id         uuid                     primary key default extensions.uuid_generate_v4(),
  name       text                     not null check (char_length(trim(name)) between 1 and 80),
  type       public.shared_space_type not null default 'EVENTO',
  currency   char(3)                  not null default 'ARS' check (currency ~ '^[A-Z]{3}$'),
  created_by uuid                     not null references auth.users(id) on delete cascade,
  created_at timestamptz              not null default now()
);

create table if not exists public.shared_space_members (
  space_id  uuid                       not null references public.shared_spaces(id) on delete cascade,
  user_id   uuid                       not null references auth.users(id) on delete cascade,
  role      public.shared_member_role  not null default 'MEMBER',
  /** Nombre con el que aparece en el grupo. Puede diferir del perfil. */
  alias     text                       check (alias is null or char_length(trim(alias)) <= 60),
  joined_at timestamptz                not null default now(),
  primary key (space_id, user_id)
);

create table if not exists public.shared_transactions (
  id          uuid          primary key default extensions.uuid_generate_v4(),
  space_id    uuid          not null references public.shared_spaces(id) on delete cascade,
  /** Quién puso la plata. Puede no ser quien lo carga. */
  paid_by     uuid          not null references auth.users(id) on delete cascade,
  amount      numeric(16,2) not null check (amount > 0),
  description text          not null check (char_length(trim(description)) between 1 and 120),
  date        date          not null default current_date,
  created_by  uuid          not null references auth.users(id) on delete cascade,
  created_at  timestamptz   not null default now()
);

create table if not exists public.shared_splits (
  transaction_id uuid          not null references public.shared_transactions(id) on delete cascade,
  user_id        uuid          not null references auth.users(id) on delete cascade,
  percentage     numeric(6,3)  not null check (percentage >= 0 and percentage <= 100),
  /** El reparto ya redondeado. Es el que manda para los saldos. */
  amount_owed    numeric(16,2) not null check (amount_owed >= 0),
  is_settled     boolean       not null default false,
  primary key (transaction_id, user_id)
);

create index if not exists shared_members_user_idx on public.shared_space_members (user_id);
create index if not exists shared_tx_space_idx     on public.shared_transactions (space_id, date desc);
create index if not exists shared_splits_user_idx  on public.shared_splits (user_id);


-- -----------------------------------------------------------------------------
-- 3. RLS
-- -----------------------------------------------------------------------------
-- LA FUNCIÓN QUE EVITA LA RECURSIÓN
--
-- La regla natural sería: "podés ver un espacio si sos miembro". Escrita
-- directo, la policy de `shared_space_members` consultaría `shared_space_members`
-- y Postgres aborta con recursión infinita en la policy. Una función
-- `security definer` corta el ciclo: corre con los permisos del dueño y no
-- vuelve a evaluar RLS.
create or replace function public.es_miembro_del_espacio(p_space_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.shared_space_members m
    where m.space_id = p_space_id and m.user_id = auth.uid()
  );
$$;

revoke all on function public.es_miembro_del_espacio(uuid) from public;
grant execute on function public.es_miembro_del_espacio(uuid) to authenticated;

alter table public.shared_spaces        enable row level security;
alter table public.shared_space_members enable row level security;
alter table public.shared_transactions  enable row level security;
alter table public.shared_splits        enable row level security;

-- --- shared_spaces -----------------------------------------------------------
-- El SELECT es deliberadamente abierto a cualquier autenticado que conozca el
-- id: es lo que hace que el QR funcione. Sin esto, quien escanea no puede ni
-- leer el nombre del grupo al que lo invitan. Sólo expone nombre, tipo y
-- moneda — los gastos siguen cerrados a los miembros.
drop policy if exists "shared_spaces_select" on public.shared_spaces;
create policy "shared_spaces_select" on public.shared_spaces
  for select to authenticated using (true);

drop policy if exists "shared_spaces_insert" on public.shared_spaces;
create policy "shared_spaces_insert" on public.shared_spaces
  for insert to authenticated with check ((select auth.uid()) = created_by);

drop policy if exists "shared_spaces_update" on public.shared_spaces;
create policy "shared_spaces_update" on public.shared_spaces
  for update to authenticated
  using ((select auth.uid()) = created_by)
  with check ((select auth.uid()) = created_by);

drop policy if exists "shared_spaces_delete" on public.shared_spaces;
create policy "shared_spaces_delete" on public.shared_spaces
  for delete to authenticated using ((select auth.uid()) = created_by);

-- --- shared_space_members ----------------------------------------------------
drop policy if exists "shared_members_select" on public.shared_space_members;
create policy "shared_members_select" on public.shared_space_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.es_miembro_del_espacio(space_id));

-- Unirse es insertarse a UNO MISMO. Nadie puede agregar a otro: el que entra
-- es siempre quien escanea.
drop policy if exists "shared_members_insert" on public.shared_space_members;
create policy "shared_members_insert" on public.shared_space_members
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "shared_members_delete" on public.shared_space_members;
create policy "shared_members_delete" on public.shared_space_members
  for delete to authenticated using (user_id = (select auth.uid()));

-- --- shared_transactions -----------------------------------------------------
drop policy if exists "shared_tx_select" on public.shared_transactions;
create policy "shared_tx_select" on public.shared_transactions
  for select to authenticated using (public.es_miembro_del_espacio(space_id));

drop policy if exists "shared_tx_insert" on public.shared_transactions;
create policy "shared_tx_insert" on public.shared_transactions
  for insert to authenticated
  with check (created_by = (select auth.uid()) and public.es_miembro_del_espacio(space_id));

drop policy if exists "shared_tx_delete" on public.shared_transactions;
create policy "shared_tx_delete" on public.shared_transactions
  for delete to authenticated
  using (created_by = (select auth.uid()) or paid_by = (select auth.uid()));

-- --- shared_splits -----------------------------------------------------------
create or replace function public.puede_ver_el_reparto(p_transaction_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.shared_transactions t
    join public.shared_space_members m on m.space_id = t.space_id
    where t.id = p_transaction_id and m.user_id = auth.uid()
  );
$$;

revoke all on function public.puede_ver_el_reparto(uuid) from public;
grant execute on function public.puede_ver_el_reparto(uuid) to authenticated;

drop policy if exists "shared_splits_select" on public.shared_splits;
create policy "shared_splits_select" on public.shared_splits
  for select to authenticated using (public.puede_ver_el_reparto(transaction_id));

drop policy if exists "shared_splits_insert" on public.shared_splits;
create policy "shared_splits_insert" on public.shared_splits
  for insert to authenticated with check (public.puede_ver_el_reparto(transaction_id));

drop policy if exists "shared_splits_update" on public.shared_splits;
create policy "shared_splits_update" on public.shared_splits
  for update to authenticated
  using (public.puede_ver_el_reparto(transaction_id))
  with check (public.puede_ver_el_reparto(transaction_id));

drop policy if exists "shared_splits_delete" on public.shared_splits;
create policy "shared_splits_delete" on public.shared_splits
  for delete to authenticated using (public.puede_ver_el_reparto(transaction_id));

grant select, insert, update, delete on public.shared_spaces        to authenticated;
grant select, insert, update, delete on public.shared_space_members to authenticated;
grant select, insert, update, delete on public.shared_transactions  to authenticated;
grant select, insert, update, delete on public.shared_splits        to authenticated;


-- -----------------------------------------------------------------------------
-- 4. Verificación
-- -----------------------------------------------------------------------------
select
  exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_profiles'
      and column_name = 'active_modules')                              as columna_modulos,
  to_regclass('public.shared_spaces')        is not null               as tabla_espacios,
  to_regclass('public.shared_space_members') is not null               as tabla_miembros,
  to_regclass('public.shared_transactions')  is not null               as tabla_gastos,
  to_regclass('public.shared_splits')        is not null               as tabla_repartos,
  (select count(*) from pg_policies where schemaname = 'public'
     and tablename like 'shared_%')                                    as politicas_totales,
  exists (select 1 from pg_proc where proname = 'es_miembro_del_espacio') as funcion_miembro,
  exists (select 1 from pg_proc where proname = 'puede_ver_el_reparto')   as funcion_reparto;
