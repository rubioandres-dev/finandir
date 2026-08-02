-- =============================================================================
-- 001 · Presupuesto mensual por categoría
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor.
-- Idempotente: se puede correr más de una vez sin romper nada.
--
-- NULL  = la categoría no tiene presupuesto definido (no se muestra barra).
-- 0     = presupuesto explícito en cero.
-- =============================================================================

alter table public.categories
  add column if not exists monthly_budget numeric(16,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'categories_monthly_budget_no_negativo'
  ) then
    alter table public.categories
      add constraint categories_monthly_budget_no_negativo
      check (monthly_budget is null or monthly_budget >= 0);
  end if;
end
$$;

comment on column public.categories.monthly_budget is
  'Límite de gasto mensual para la categoría. NULL = sin presupuesto definido.';

-- Las policies de RLS de `categories` ya cubren esta columna: son a nivel de
-- fila, así que el UPDATE del presupuesto queda restringido al dueño.
