-- =============================================================================
-- 014 · `bug_reports`: los reportes dejan de vivir en los logs
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Idempotente.
--
-- QUÉ ARREGLA
--
-- El formulario de "Acerca de AUREM" hacía un `console.error('[bug-report]')` y
-- nada más. Eso significa que el reporte vivía lo que viven los logs de runtime
-- de Vercel —una hora en el plan Hobby— y no se podía consultar con SQL. Si
-- nadie miraba los logs esa misma hora, el reporte no existía más. Mientras
-- tanto la app le decía al usuario "lo vamos a revisar".
--
-- QUIÉN PUEDE LEER ESTO
--
-- NADIE desde la app. Hay política de INSERT y no hay política de SELECT, así
-- que con RLS activo PostgREST no devuelve una sola fila a nadie: se leen desde
-- el Dashboard de Supabase, que usa la service role y saltea RLS.
--
-- Es a propósito y no un olvido. Un reporte es una bandeja de soporte, no un
-- dato del usuario: no hay pantalla que lo muestre, y una política de SELECT sin
-- consumidor es superficie de ataque que hay que mantener sin que nadie la use.
-- El día que exista un panel de admin, se agrega la política que ese panel
-- necesite y no antes.
--
-- QUÉ PASA SI EL USUARIO BORRA SU CUENTA
--
-- `on delete set null`: el reporte SOBREVIVE y pierde el vínculo con la cuenta.
-- El resto del esquema usa `cascade`, así que esto es deliberado — un bug
-- reportado sigue siendo un bug aunque quien lo reportó ya no esté.
--
-- OJO CON LA CONTRACARA: `reporter_email` es una copia del mail al momento del
-- reporte y NO se borra sola. Sirve para poder responder, pero significa que dar
-- de baja la cuenta no borra ese dato. Si hace falta borrado real, es un DELETE
-- manual sobre esta tabla.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. La tabla
-- -----------------------------------------------------------------------------
create table if not exists public.bug_reports (
  id             uuid        primary key default gen_random_uuid(),
  -- Nullable a propósito: ver la nota de arriba. También cubre el caso de una
  -- sesión vencida entre que se abrió el modal y se apretó Enviar.
  user_id        uuid        references auth.users (id) on delete set null,
  /** Copia del mail al momento del reporte, para poder responder. */
  reporter_email text,
  /** El texto del usuario. Los límites replican el schema de Zod de la action. */
  message        text        not null check (char_length(message) between 10 and 2000),
  /** Ruta desde donde se reportó. Sin esto, "no anda el botón" no se reproduce. */
  route          text,
  /** Versión de la app. Un bug ya arreglado se descarta mirando esto. */
  app_version    text,
  /** Navegador y sistema: la mitad de los bugs de layout son de un motor solo. */
  user_agent     text,
  /**
   * Estado de la bandeja. Texto con CHECK y no un enum de Postgres: agregar un
   * estado nuevo a un enum requiere un ALTER TYPE que no corre dentro de una
   * transacción, y esta lista va a cambiar más que el resto del esquema.
   */
  status         text        not null default 'nuevo'
                             check (status in ('nuevo', 'en_curso', 'resuelto', 'descartado')),
  /** Notas internas. No las ve el usuario. */
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.bug_reports is
  'Reportes del modal "Acerca de AUREM". Se leen desde el Dashboard de Supabase: no hay política de SELECT a propósito. Ver migrations/014.';
comment on column public.bug_reports.reporter_email is
  'Copia al momento del reporte. NO se borra al dar de baja la cuenta.';

-- La bandeja se lee por fecha y se filtra por estado; ese es el índice que
-- sirve para las dos cosas a la vez.
create index if not exists bug_reports_bandeja_idx
  on public.bug_reports (status, created_at desc);


-- -----------------------------------------------------------------------------
-- 2. RLS
-- -----------------------------------------------------------------------------
alter table public.bug_reports enable row level security;

-- Sólo INSERT, y sólo el propio. Un usuario no puede reportar en nombre de otro.
drop policy if exists "bug_reports_insert" on public.bug_reports;
create policy "bug_reports_insert" on public.bug_reports
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- `(select auth.uid())` envuelto en subselect: Postgres lo evalúa una vez por
-- query en lugar de una por fila. Mismo patrón que la 010, la 011 y la 013.

-- Sin SELECT, UPDATE ni DELETE para `authenticated`: ver el encabezado.
grant insert on public.bug_reports to authenticated;


-- -----------------------------------------------------------------------------
-- 3. `updated_at`
-- -----------------------------------------------------------------------------
-- Se toca al cambiar el estado desde el Dashboard, que es la única forma de
-- editar estas filas. La función existe desde la 007.
drop trigger if exists bug_reports_tocar_updated_at on public.bug_reports;
create trigger bug_reports_tocar_updated_at
  before update on public.bug_reports
  for each row execute function public.tocar_updated_at();


-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------
-- Las tres columnas tienen que dar `true`:
--
--   select
--     exists (select 1 from pg_policies
--       where tablename = 'bug_reports' and cmd = 'INSERT')          as tiene_insert,
--     not exists (select 1 from pg_policies
--       where tablename = 'bug_reports' and cmd = 'SELECT')          as sin_select,
--     (select relrowsecurity from pg_class
--       where oid = 'public.bug_reports'::regclass)                  as rls_activo;
--
-- Y la bandeja se lee así:
--
--   select created_at, reporter_email, route, app_version, status, message
--   from public.bug_reports
--   where status = 'nuevo'
--   order by created_at desc;
