-- =============================================================================
-- 002 · Soporte multi-moneda (ARS / USD)
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Idempotente.
--
-- Las columnas y la tabla ya podrían existir en tu proyecto; lo que casi
-- seguro falta es la sección 3 (policies de exchange_rates) y la 4 (trigger
-- de saldo consciente de la moneda).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Columnas en transactions
-- -----------------------------------------------------------------------------
alter table public.transactions
  add column if not exists currency char(3) not null default 'ARS';

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

comment on column public.transactions.currency   is 'Moneda en la que se registró el movimiento.';
comment on column public.transactions.amount_usd is
  'Equivalente en USD congelado al momento de guardar, con la cotización de ese día. NULL si no había cotización.';


-- -----------------------------------------------------------------------------
-- 2. Histórico de cotizaciones (tabla global, no por usuario)
-- -----------------------------------------------------------------------------
create table if not exists public.exchange_rates (
  date       date        primary key,
  source     text        not null default 'dolarapi:bolsa',
  buy        numeric(12,4),
  sell       numeric(12,4) not null check (sell > 0),
  created_at timestamptz not null default now()
);

comment on table public.exchange_rates is
  'Cotización diaria del dólar MEP. Compartida por todos los usuarios.';


-- -----------------------------------------------------------------------------
-- 3. RLS de exchange_rates
-- -----------------------------------------------------------------------------
-- Cualquier usuario logueado puede leerla y sembrar la del día; nadie puede
-- modificar ni borrar cotizaciones ya registradas.
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
-- 4. Saldo de cuentas consciente de la moneda
-- -----------------------------------------------------------------------------
-- PROBLEMA QUE RESUELVE: el trigger original hacía `balance +/- amount` sin
-- mirar `currency`. Un gasto de USD 50 restaba 50 de un saldo en pesos.

/** Cotización aplicable a una fecha: la del día, o la última anterior. */
create or replace function public.tipo_de_cambio(p_fecha date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select sell from public.exchange_rates where date = p_fecha),
    (select sell from public.exchange_rates where date < p_fecha order by date desc limit 1),
    (select sell from public.exchange_rates order by date asc limit 1)
  );
$$;

/** Convierte un importe entre ARS y USD usando la cotización de la fecha. */
create or replace function public.convertir_monto(
  p_monto numeric,
  p_desde text,
  p_hasta text,
  p_fecha date
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cotizacion numeric;
begin
  if p_desde is null or p_hasta is null or trim(p_desde) = trim(p_hasta) then
    return p_monto;
  end if;

  cotizacion := public.tipo_de_cambio(p_fecha);

  -- Sin cotización no inventamos un número: dejamos el importe como está.
  if cotizacion is null or cotizacion <= 0 then
    return p_monto;
  end if;

  if trim(p_desde) = 'USD' and trim(p_hasta) = 'ARS' then
    return round(p_monto * cotizacion, 2);
  elsif trim(p_desde) = 'ARS' and trim(p_hasta) = 'USD' then
    return round(p_monto / cotizacion, 2);
  end if;

  return p_monto;
end;
$$;

create or replace function public.apply_transaction_to_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  moneda_cuenta text;
  delta_old numeric(16,2) := 0;
  delta_new numeric(16,2) := 0;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select currency into moneda_cuenta from public.accounts where id = old.account_id;
    delta_old := public.convertir_monto(old.amount, old.currency, moneda_cuenta, old.date);
    if old.type <> 'INCOME' then delta_old := -delta_old; end if;
    update public.accounts set balance = balance - delta_old where id = old.account_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select currency into moneda_cuenta from public.accounts where id = new.account_id;
    delta_new := public.convertir_monto(new.amount, new.currency, moneda_cuenta, new.date);
    if new.type <> 'INCOME' then delta_new := -delta_new; end if;
    update public.accounts set balance = balance + delta_new where id = new.account_id;
  end if;

  return coalesce(new, old);
end;
$$;

-- El trigger no cambia de nombre; solo se redefinió la función que ejecuta.
drop trigger if exists transactions_apply_balance on public.transactions;
create trigger transactions_apply_balance
  after insert or update or delete on public.transactions
  for each row execute function public.apply_transaction_to_balance();


-- -----------------------------------------------------------------------------
-- 5. Recalcular los saldos existentes con la lógica nueva
-- -----------------------------------------------------------------------------
update public.accounts a
set balance = coalesce((
  select sum(
    case when t.type = 'INCOME' then 1 else -1 end
    * public.convertir_monto(t.amount, t.currency, a.currency, t.date)
  )
  from public.transactions t
  where t.account_id = a.id
), 0);
