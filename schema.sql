-- =============================================================================
-- Finandir — Esquema de base de datos (PostgreSQL / Supabase)
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor, o vía `supabase db push`.
-- El script es idempotente: puede volver a ejecutarse sin errores.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. EXTENSIONES
-- -----------------------------------------------------------------------------
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists "pgcrypto"  with schema extensions;  -- gen_random_uuid(), hashing
create extension if not exists "citext"    with schema extensions;  -- texto case-insensitive


-- -----------------------------------------------------------------------------
-- 2. TIPOS ENUMERADOS
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'category_type') then
    create type public.category_type as enum ('INCOME', 'EXPENSE');
  end if;

  if not exists (select 1 from pg_type where typname = 'transaction_type') then
    create type public.transaction_type as enum ('INCOME', 'EXPENSE', 'TRANSFER');
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 3. TABLA: accounts
-- -----------------------------------------------------------------------------
create table if not exists public.accounts (
  id          uuid          primary key default extensions.uuid_generate_v4(),
  user_id     uuid          not null references auth.users (id) on delete cascade,
  name        text          not null check (char_length(trim(name)) between 1 and 80),
  currency    char(3)       not null default 'ARS' check (currency ~ '^[A-Z]{3}$'),
  balance     numeric(16,2) not null default 0,
  created_at  timestamptz   not null default now(),

  constraint accounts_user_name_unique unique (user_id, name)
);

comment on table  public.accounts             is 'Cuentas / billeteras del usuario (efectivo, banco, tarjeta, etc.)';
comment on column public.accounts.currency    is 'Código ISO 4217 en mayúsculas (ARS, USD, EUR...)';
comment on column public.accounts.balance     is 'Saldo actual, mantenido por los triggers de transactions';

create index if not exists accounts_user_id_idx on public.accounts (user_id);


-- -----------------------------------------------------------------------------
-- 4. TABLA: categories
-- -----------------------------------------------------------------------------
create table if not exists public.categories (
  id             uuid                 primary key default extensions.uuid_generate_v4(),
  user_id        uuid                 not null references auth.users (id) on delete cascade,
  name           citext               not null check (char_length(trim(name::text)) between 1 and 60),
  type           public.category_type not null,
  icon           text                 not null default 'circle',
  color          text                 not null default '#64748B' check (color ~* '^#[0-9A-F]{6}$'),
  -- NULL = sin presupuesto definido. Ver migrations/001_add_monthly_budget.sql
  monthly_budget numeric(16,2)        check (monthly_budget is null or monthly_budget >= 0),

  constraint categories_user_name_type_unique unique (user_id, name, type)
);

comment on table  public.categories       is 'Categorías de ingreso/egreso, propias de cada usuario';
comment on column public.categories.name  is 'citext: "Comida" y "comida" se consideran duplicados';
comment on column public.categories.color is 'Color hexadecimal #RRGGBB';

create index if not exists categories_user_id_idx      on public.categories (user_id);
create index if not exists categories_user_type_idx    on public.categories (user_id, type);


-- -----------------------------------------------------------------------------
-- 5. TABLA: transactions
-- -----------------------------------------------------------------------------
create table if not exists public.transactions (
  id           uuid                    primary key default extensions.uuid_generate_v4(),
  user_id      uuid                    not null references auth.users (id)      on delete cascade,
  account_id   uuid                    not null references public.accounts (id) on delete cascade,
  category_id  uuid                             references public.categories (id) on delete set null,
  amount       numeric(16,2)           not null check (amount > 0),
  -- Multi-moneda: ver migrations/002_multi_moneda.sql
  currency     char(3)                 not null default 'ARS' check (currency in ('ARS','USD')),
  amount_usd   numeric(16,2),
  type         public.transaction_type not null,
  description  text                    check (char_length(description) <= 500),
  date         date                    not null default current_date,
  created_at   timestamptz             not null default now(),

  -- Las transferencias no llevan categoría; ingresos y egresos sí deberían tenerla.
  constraint transactions_transfer_has_no_category
    check (type <> 'TRANSFER' or category_id is null)
);

comment on table  public.transactions        is 'Movimientos de dinero del usuario';
comment on column public.transactions.amount is 'Importe siempre positivo; el signo lo determina "type"';
comment on column public.transactions.date   is 'Fecha contable del movimiento (puede diferir de created_at)';

create index if not exists transactions_user_date_idx    on public.transactions (user_id, date desc);
create index if not exists transactions_account_id_idx   on public.transactions (account_id);
create index if not exists transactions_category_id_idx  on public.transactions (category_id);
create index if not exists transactions_user_type_idx    on public.transactions (user_id, type);


-- -----------------------------------------------------------------------------
-- 6. INTEGRIDAD: la cuenta y la categoría deben pertenecer al mismo usuario
-- -----------------------------------------------------------------------------
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

  if new.category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = new.category_id and c.user_id = new.user_id
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
-- 7. SALDO AUTOMÁTICO DE LAS CUENTAS
-- -----------------------------------------------------------------------------
-- INCOME suma, EXPENSE y TRANSFER restan de la cuenta origen.
create or replace function public.apply_transaction_to_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta_old numeric(16,2) := 0;
  delta_new numeric(16,2) := 0;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    delta_old := case when old.type = 'INCOME' then old.amount else -old.amount end;
    update public.accounts set balance = balance - delta_old where id = old.account_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    delta_new := case when new.type = 'INCOME' then new.amount else -new.amount end;
    update public.accounts set balance = balance + delta_new where id = new.account_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists transactions_apply_balance on public.transactions;
create trigger transactions_apply_balance
  after insert or update or delete on public.transactions
  for each row execute function public.apply_transaction_to_balance();


-- =============================================================================
-- 8. ROW LEVEL SECURITY
-- =============================================================================
alter table public.accounts     enable row level security;
alter table public.categories   enable row level security;
alter table public.transactions enable row level security;

-- Opcional pero recomendado: que ni el dueño de la tabla evada las policies.
alter table public.accounts     force row level security;
alter table public.categories   force row level security;
alter table public.transactions force row level security;

-- --- accounts ----------------------------------------------------------------
drop policy if exists "accounts_select_own" on public.accounts;
create policy "accounts_select_own" on public.accounts
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "accounts_insert_own" on public.accounts;
create policy "accounts_insert_own" on public.accounts
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "accounts_update_own" on public.accounts;
create policy "accounts_update_own" on public.accounts
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "accounts_delete_own" on public.accounts;
create policy "accounts_delete_own" on public.accounts
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- --- categories --------------------------------------------------------------
drop policy if exists "categories_select_own" on public.categories;
create policy "categories_select_own" on public.categories
  for select to authenticated
  using ((select auth.uid()) = user_id);

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

-- --- transactions ------------------------------------------------------------
drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own" on public.transactions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own" on public.transactions
  for delete to authenticated
  using ((select auth.uid()) = user_id);


-- =============================================================================
-- 9. CATEGORÍAS PREDETERMINADAS
-- =============================================================================
-- Función reutilizable: inserta el set por defecto para un usuario dado.
-- SECURITY DEFINER para poder usarse también desde el trigger de auth.users.
create or replace function public.seed_default_categories(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (user_id, name, type, icon, color)
  values
    (p_user_id, 'Comida',     'EXPENSE', 'utensils',    '#F97316'),
    (p_user_id, 'Transporte', 'EXPENSE', 'bus',         '#3B82F6'),
    (p_user_id, 'Servicios',  'EXPENSE', 'plug',        '#8B5CF6'),
    (p_user_id, 'Ocio',       'EXPENSE', 'gamepad-2',   '#EC4899'),
    (p_user_id, 'Educación',  'EXPENSE', 'graduation-cap', '#14B8A6'),
    (p_user_id, 'Salud',      'EXPENSE', 'heart-pulse', '#EF4444'),
    (p_user_id, 'Sueldo',     'INCOME',  'wallet',      '#22C55E')
  on conflict (user_id, name, type) do nothing;
end;
$$;

revoke all on function public.seed_default_categories(uuid) from public;
grant execute on function public.seed_default_categories(uuid) to authenticated, service_role;

-- Wrapper sin argumentos: el usuario logueado siembra sus propias categorías.
-- Uso desde el cliente:  await supabase.rpc('seed_my_default_categories')
create or replace function public.seed_my_default_categories()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Se requiere un usuario autenticado' using errcode = '42501';
  end if;
  perform public.seed_default_categories(auth.uid());
end;
$$;

grant execute on function public.seed_my_default_categories() to authenticated;

-- Alta automática al registrarse un usuario nuevo.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_categories(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: sembrar las categorías para los usuarios ya existentes.
do $$
declare
  u record;
begin
  for u in select id from auth.users loop
    perform public.seed_default_categories(u.id);
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- 10. PERMISOS DE TABLA (RLS sigue siendo el filtro real)
-- -----------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.accounts, public.categories, public.transactions
  to authenticated;
