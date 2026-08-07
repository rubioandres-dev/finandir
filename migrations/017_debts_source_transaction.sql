-- =============================================================================
-- 017 · Cuentas por cobrar atadas al movimiento que las originó
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Idempotente.
--
-- Todo lo de acá es ADITIVO: una columna nullable y su índice. Ninguna fila
-- existente cambia, y el código sigue funcionando si esta migración no se corrió
-- (ver la nota de compatibilidad al final).
--
-- 1 · QUÉ PROBLEMA RESUELVE
--
-- La Calculadora de Salidas ahora puede generar VARIAS cuentas por cobrar de un
-- solo gasto: si pagaste la cena de cuatro y cargaste los nombres, salen tres
-- filas en `debts`, una por persona. Sin una referencia al movimiento madre esas
-- tres filas son huérfanas entre sí: no hay forma de saber que pertenecen a la
-- misma salida, ni de mostrarlas agrupadas, ni de encontrarlas si el usuario
-- borra el gasto y quiere limpiar lo que quedó colgando.
--
-- 2 · POR QUÉ `on delete set null` Y NO `cascade`
--
-- Es la decisión que importa de esta migración. `cascade` borraría la deuda
-- junto con el movimiento, y eso PIERDE PLATA: que hayas borrado el gasto mal
-- cargado no significa que tus amigos ya no te deban la cena. La deuda es un
-- hecho independiente del asiento contable que la originó.
--
-- Con `set null` la fila sobrevive y sólo se queda sin el vínculo: sigue en la
-- lista de "te deben", el usuario la cobra o la borra a mano. Se pierde la
-- agrupación, que es información de presentación, no dinero.
--
-- 3 · POR QUÉ NO ES UNA TABLA APARTE
--
-- Un `shared_outing` con sus N deudas hijas sería más prolijo en el papel, pero
-- agrega una tabla, sus policies y un join a toda lectura de deudas para
-- resolver algo que es una sola columna. La deuda ya es la entidad correcta; lo
-- único que le faltaba era decir de dónde vino.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. La columna
-- -----------------------------------------------------------------------------
alter table public.debts
  add column if not exists source_transaction_id uuid
    references public.transactions (id) on delete set null;

comment on column public.debts.source_transaction_id is
  'Movimiento que originó la cuenta por cobrar (salida grupal). Null si se cargó a mano o si ese movimiento se borró.';


-- -----------------------------------------------------------------------------
-- 2. Índice para traer las deudas de un movimiento
-- -----------------------------------------------------------------------------
-- Parcial: la enorme mayoría de las deudas se cargan a mano y tienen la columna
-- en null. Indexarlas sería pagar por filas que nunca se buscan por acá.
create index if not exists debts_source_transaction_idx
  on public.debts (source_transaction_id)
  where source_transaction_id is not null;


-- -----------------------------------------------------------------------------
-- Compatibilidad: la app no depende de esta migración
-- -----------------------------------------------------------------------------
-- `registrarSalida` inserta con `source_transaction_id` y, si Postgres responde
-- 42703 (la columna no existe) o PGRST204 (no está en el schema cache), reintenta
-- sin ella. Es el mismo patrón que `guardarTransaccion` usa con las columnas de
-- migrations/004. Consecuencia de no correr esto: las cuentas por cobrar se
-- crean igual, pero sin el vínculo al gasto madre.


-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------
-- Las dos columnas tienen que dar `true`:
--
--   select
--     exists (select 1 from information_schema.columns
--       where table_name = 'debts' and column_name = 'source_transaction_id') as tiene_columna,
--     exists (select 1 from pg_indexes
--       where indexname = 'debts_source_transaction_idx')                     as tiene_indice;
