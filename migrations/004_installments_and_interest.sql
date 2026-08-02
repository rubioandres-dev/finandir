-- =============================================================================
-- 004 · Intereses en planes de cuotas
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Idempotente.
--
-- MODELO: `amount` sigue siendo el importe imputado de CADA cuota, así que los
-- saldos y los totales por categoría no cambian de significado. Las columnas
-- nuevas son metadatos del PLAN, y se repiten en todas las cuotas del plan para
-- poder mostrar el desglose desde cualquiera de ellas sin un join a la madre.
--
--   cash_price             lo que costaba pagando al contado
--   total_financed_amount  lo que vas a terminar pagando (cuota × N)
--   installment_amount     valor nominal de cada cuota, como lo publica el comercio
--   has_interest           si total_financed > cash_price
--
-- El recargo es total_financed_amount - cash_price.
-- =============================================================================

alter table public.transactions
  add column if not exists has_interest boolean not null default false;

alter table public.transactions
  add column if not exists cash_price numeric(16,2)
    check (cash_price is null or cash_price >= 0);

alter table public.transactions
  add column if not exists total_financed_amount numeric(16,2)
    check (total_financed_amount is null or total_financed_amount >= 0);

alter table public.transactions
  add column if not exists installment_amount numeric(16,2)
    check (installment_amount is null or installment_amount >= 0);

-- Un plan con interés necesita saber cuánto se financia; si no, el recargo
-- no se puede calcular y la UI mostraría un desglose vacío.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_interes_coherente'
  ) then
    alter table public.transactions
      add constraint transactions_interes_coherente check (
        has_interest = false or total_financed_amount is not null
      );
  end if;
end
$$;

comment on column public.transactions.has_interest is
  'True si el plan tiene recargo: total_financed_amount > cash_price.';
comment on column public.transactions.cash_price is
  'Precio de contado del plan completo. NULL si no se informó.';
comment on column public.transactions.total_financed_amount is
  'Total a pagar sumando todas las cuotas. Es la base del reparto cuando hay interés.';
comment on column public.transactions.installment_amount is
  'Valor nominal de cada cuota tal como lo publica el comercio.';

-- Índice para la vista de saldo comprometido: filtra cuotas futuras por fecha.
create index if not exists transactions_cuotas_futuras_idx
  on public.transactions (user_id, date)
  where installment_total is not null;
