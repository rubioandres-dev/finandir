-- =============================================================================
-- 002 · Multi-moneda por segregación (ARS / USD)
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Idempotente.
--
-- MODELO: ARS y USD son dos libros paralelos, no una moneda convertida a otra.
--   · Cada cuenta tiene su moneda y su propio saldo. No se suman entre sí.
--   · Cada movimiento vive en la cuenta de SU moneda; nunca se convierte.
--   · Cada categoría puede tener un presupuesto por moneda.
--
-- La conversión existe solo como referencia aproximada para mostrar (amount_usd
-- y exchange_rates), nunca como dato contable.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Moneda del movimiento
-- -----------------------------------------------------------------------------
alter table public.transactions
  add column if not exists currency char(3) not null default 'ARS';

-- Equivalente aproximado en USD al momento de guardar. Es informativo:
-- ningún total contable se calcula con esta columna.
alter table public.transactions
  add column if not exists amount_usd numeric(16,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_currency_valida') then
    alter table public.transactions
      add constraint transactions_currency_valida check (currency in ('ARS', 'USD'));
  end if;
end
$$;

comment on column public.transactions.currency   is 'Moneda del movimiento. Debe coincidir con la de su cuenta.';
comment on column public.transactions.amount_usd is 'Equivalente aproximado en USD, solo para mostrar. No es contable.';


-- -----------------------------------------------------------------------------
-- 2. Saldos por moneda
-- -----------------------------------------------------------------------------
-- Con un saldo por moneda, el saldo total en una sola cifra deja de existir:
-- sumar pesos con dólares no significa nada.
--
-- NO se restringe a una cuenta por moneda: un usuario puede tener banco,
-- billetera y tarjeta, todas en pesos (ver migrations/003). La unicidad que
-- aplica es (user_id, name), que ya viene de schema.sql.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'accounts_user_currency_unique') then
    alter table public.accounts drop constraint accounts_user_currency_unique;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 3. Presupuestos por categoría y moneda
-- -----------------------------------------------------------------------------
create table if not exists public.budgets (
  id          uuid          primary key default extensions.uuid_generate_v4(),
  user_id     uuid          not null references auth.users (id) on delete cascade,
  category_id uuid          not null references public.categories (id) on delete cascade,
  currency    char(3)       not null check (currency in ('ARS', 'USD')),
  amount      numeric(16,2) not null check (amount >= 0),
  created_at  timestamptz   not null default now(),

  constraint budgets_categoria_moneda_unique unique (category_id, currency)
);

create index if not exists budgets_user_idx on public.budgets (user_id);

alter table public.budgets enable row level security;

drop policy if exists "budgets_todo" on public.budgets;
create policy "budgets_todo" on public.budgets
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.budgets to authenticated;

-- Migra los presupuestos que ya existían: eran todos en pesos.
insert into public.budgets (user_id, category_id, currency, amount)
select c.user_id, c.id, 'ARS', c.monthly_budget
from public.categories c
where c.monthly_budget is not null
on conflict (category_id, currency) do nothing;

comment on table public.budgets is
  'Límite de gasto mensual por categoría y moneda. Cada moneda se compara solo contra los gastos de esa misma moneda.';


-- -----------------------------------------------------------------------------
-- 4. Cotizaciones (solo referencia, nunca contable)
-- -----------------------------------------------------------------------------
create table if not exists public.exchange_rates (
  date       date          primary key,
  source     text          not null default 'dolarapi:bolsa',
  buy        numeric(12,4),
  sell       numeric(12,4) not null check (sell > 0),
  created_at timestamptz   not null default now()
);

alter table public.exchange_rates enable row level security;

drop policy if exists "exchange_rates_select" on public.exchange_rates;
create policy "exchange_rates_select" on public.exchange_rates
  for select to authenticated, anon
  using (true);

drop policy if exists "exchange_rates_insert" on public.exchange_rates;
create policy "exchange_rates_insert" on public.exchange_rates
  for insert to authenticated
  with check (true);

grant select on public.exchange_rates to anon, authenticated;
grant insert on public.exchange_rates to authenticated;


-- -----------------------------------------------------------------------------
-- 5. Saldo: sin conversión, con guarda de coherencia
-- -----------------------------------------------------------------------------
-- Como cada movimiento va a la cuenta de su moneda, el saldo vuelve a ser una
-- suma directa. La guarda impide el caso que rompía todo: un movimiento en USD
-- restando de un saldo en pesos.
create or replace function public.verificar_moneda_del_movimiento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  moneda_cuenta char(3);
begin
  select currency into moneda_cuenta from public.accounts where id = new.account_id;

  if moneda_cuenta is not null and trim(new.currency) <> trim(moneda_cuenta) then
    raise exception
      'El movimiento está en % pero la cuenta destino es en %. Cada moneda usa su propia cuenta.',
      new.currency, moneda_cuenta
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_verificar_moneda on public.transactions;
create trigger transactions_verificar_moneda
  before insert or update on public.transactions
  for each row execute function public.verificar_moneda_del_movimiento();

-- Recalcula los saldos con la lógica simple (todo movimiento comparte la
-- moneda de su cuenta, así que es una suma directa).
update public.accounts a
set balance = coalesce((
  select sum(case when t.type = 'INCOME' then t.amount else -t.amount end)
  from public.transactions t
  where t.account_id = a.id
), 0);
