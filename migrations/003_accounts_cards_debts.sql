-- =============================================================================
-- 003 · Cuentas, tarjetas de crédito, cuotas y deudas
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Idempotente.
--
-- NOTA: verificado contra la base el 2026-08-02, este módulo YA ESTÁ APLICADO
-- (existen accounts.type, accounts.is_liquid, credit_card_details, debts y las
-- columnas de cuotas). Este archivo queda como definición reproducible para
-- instalaciones nuevas; correrlo de nuevo no cambia nada.
--
-- MODELO DE TARJETAS: la tarjeta es una cuenta más, con type = 'CREDIT_CARD' e
-- is_liquid = false. Una compra con tarjeta se registra CONTRA LA TARJETA, así
-- que nunca toca el saldo del banco: su `balance` se vuelve negativo y ese
-- negativo es la deuda.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Tipos de cuenta
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'account_type') then
    create type public.account_type as enum
      ('BANK', 'WALLET', 'CASH', 'INVESTMENT', 'CREDIT_CARD');
  end if;
end
$$;

alter table public.accounts
  add column if not exists type public.account_type not null default 'BANK';

-- Qué cuenta cuenta como disponible. Las tarjetas y las inversiones no.
alter table public.accounts
  add column if not exists is_liquid boolean not null default true;

comment on column public.accounts.is_liquid is
  'Si el saldo cuenta como líquido. Falso en tarjetas (pasivo) e inversiones.';


-- -----------------------------------------------------------------------------
-- 2. Datos propios de la tarjeta de crédito
-- -----------------------------------------------------------------------------
-- account_id es la PK: la relación con accounts es 1 a 1.
create table if not exists public.credit_card_details (
  account_id       uuid    primary key references public.accounts (id) on delete cascade,
  closing_day      smallint not null check (closing_day between 1 and 31),
  due_day          smallint not null check (due_day between 1 and 31),
  credit_limit     numeric(16,2) check (credit_limit is null or credit_limit >= 0),
  bank_name        text,
  last_four_digits char(4) check (last_four_digits is null or last_four_digits ~ '^[0-9]{4}$')
);

alter table public.credit_card_details enable row level security;

-- La tarjeta no tiene user_id propio: la pertenencia se hereda de su cuenta.
drop policy if exists "credit_card_details_todo" on public.credit_card_details;
create policy "credit_card_details_todo" on public.credit_card_details
  for all to authenticated
  using (
    exists (select 1 from public.accounts a
            where a.id = credit_card_details.account_id and a.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.accounts a
            where a.id = credit_card_details.account_id and a.user_id = auth.uid())
  );

grant select, insert, update, delete on public.credit_card_details to authenticated;


-- -----------------------------------------------------------------------------
-- 3. Deudas y préstamos entre personas
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'debt_type') then
    create type public.debt_type as enum ('OWED_BY_ME', 'OWED_TO_ME');
  end if;
end
$$;

create table if not exists public.debts (
  id                uuid            primary key default extensions.uuid_generate_v4(),
  user_id           uuid            not null references auth.users (id) on delete cascade,
  counterparty_name text            not null check (char_length(trim(counterparty_name)) between 1 and 80),
  total_amount      numeric(16,2)   not null check (total_amount > 0),
  remaining_amount  numeric(16,2)   not null check (remaining_amount >= 0),
  currency          char(3)         not null default 'ARS' check (currency in ('ARS', 'USD')),
  type              public.debt_type not null,
  due_date          date,
  is_settled        boolean         not null default false,
  description       text,
  created_at        timestamptz     not null default now(),

  constraint debts_remaining_no_supera_total check (remaining_amount <= total_amount)
);

create index if not exists debts_user_idx on public.debts (user_id, is_settled);

alter table public.debts enable row level security;

drop policy if exists "debts_todo" on public.debts;
create policy "debts_todo" on public.debts
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.debts to authenticated;


-- -----------------------------------------------------------------------------
-- 4. Cuotas
-- -----------------------------------------------------------------------------
-- Cada cuota es una fila propia con su fecha real de imputación. La primera es
-- la "madre" y las demás la referencian, así se puede borrar el plan completo.
alter table public.transactions
  add column if not exists installment_current smallint check (installment_current >= 1);

alter table public.transactions
  add column if not exists installment_total smallint check (installment_total >= 1);

alter table public.transactions
  add column if not exists parent_transaction_id uuid
    references public.transactions (id) on delete cascade;

create index if not exists transactions_parent_idx
  on public.transactions (parent_transaction_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_cuota_coherente') then
    alter table public.transactions
      add constraint transactions_cuota_coherente check (
        (installment_current is null and installment_total is null)
        or (installment_current is not null and installment_total is not null
            and installment_current <= installment_total)
      );
  end if;
end
$$;

comment on column public.transactions.installment_current is 'Número de cuota (1..installment_total).';
comment on column public.transactions.parent_transaction_id is 'Primera cuota del plan; null en la primera.';


-- -----------------------------------------------------------------------------
-- 5. Las cuentas existentes quedan como banco líquido
-- -----------------------------------------------------------------------------
update public.accounts set type = 'BANK', is_liquid = true
where type is null;
