-- =============================================================================
-- 018 · Almacén cifrado extremo a extremo (estrategia C3)
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Idempotente.
--
-- QUÉ CAMBIA EL MODELO
--
-- Hasta acá la base guardaba filas que el servidor podía leer: importes,
-- descripciones, fechas. Estas dos tablas guardan BLOQUES OPACOS. El servidor
-- no puede abrirlos y no hay política de RLS que lo habilite, porque no existe
-- la clave del lado del servidor: vive en el navegador del usuario, derivada de
-- su contraseña, y nunca viaja.
--
-- Eso significa que acá NO se puede consultar, ordenar, agregar ni reparar
-- nada con SQL. Es el precio del modo, es deliberado, y conviene tenerlo claro
-- antes de aprobar la migración: un "no me aparecen los movimientos de marzo"
-- ya no se diagnostica desde el Dashboard.
--
-- POR QUÉ `text` EN BASE64 Y NO `bytea`
--
-- PostgREST devuelve `bytea` como hex (`\x48656c6c6f`), que duplica el tamaño y
-- obliga a parsear a mano en el cliente. Base64 en una columna `text` cuesta
-- 33% en vez de 100% y entra derecho en el JSON de la API. Con bloques de hasta
-- ~400 kB la diferencia es de centenares de kB, no de megabytes.
--
-- LA CONCURRENCIA VIVE EN `version`
--
-- No hay transacciones entre bloques y no puede haberlas. El único control es
-- el bloqueo optimista: quien escribe declara qué versión cree tener y el
-- UPDATE sólo aplica si coincide. Ver `lib/almacen/libro.ts` para el lazo de
-- reintentos que se apoya en esto.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Los bloques
-- -----------------------------------------------------------------------------
create table if not exists public.almacen_bloques (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  /** `manifiesto`, `cuentas`, `mov-2026`... Ver lib/almacen/documentos.ts. */
  clave       text        not null check (char_length(clave) between 1 and 100),
  /** Ciphertext en base64: `[1 byte version][12 bytes IV][AES-GCM]`. */
  contenido   text        not null,
  /**
   * Se incrementa en cada escritura. Es el token de bloqueo optimista: un
   * UPDATE que no matchea la versión no toca ninguna fila, y eso es el
   * conflicto. Empieza en 1.
   */
  version     bigint      not null default 1,
  actualizado timestamptz not null default now(),
  /**
   * Calculada: permite listar el almacen (diagnostico, migracion, "cuanto
   * ocupa esto") sin bajar centenares de kB de ciphertext para medirlos.
   */
  bytes       int         generated always as (octet_length(contenido)) stored,

  primary key (user_id, clave)
);

comment on table  public.almacen_bloques           is 'Bloques cifrados del usuario. El servidor NO puede leerlos.';
comment on column public.almacen_bloques.contenido is 'Base64 de bytes AES-GCM. Opaco para la base.';
comment on column public.almacen_bloques.version   is 'Bloqueo optimista. Ver lib/almacen/nube.ts.';


-- -----------------------------------------------------------------------------
-- 2. El sobre de claves
-- -----------------------------------------------------------------------------
-- Una fila por usuario. NADA de esto es secreto: son las dos envolturas de la
-- DEK más los parámetros para rehacer cada KEK. Sin la contraseña o el código
-- de recuperación, el sobre no sirve para nada.
--
-- Se guarda como jsonb y no en columnas: el formato lo define
-- `SobreDeClaves` en lib/almacen/cripto.ts y va a cambiar (Argon2id, WebAuthn
-- PRF) sin que la base tenga nada que opinar. Una columna por campo sería una
-- migración por cada cambio de formato criptográfico.
create table if not exists public.almacen_sobres (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  sobre      jsonb       not null,
  creado     timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

comment on table public.almacen_sobres is
  'Envolturas de la DEK de cada usuario. Publicas por diseño: inutiles sin el secreto.';


-- -----------------------------------------------------------------------------
-- 3. Dónde guarda cada usuario
-- -----------------------------------------------------------------------------
-- Tiene que vivir en la base que SIEMPRE existe: hay que saber dónde están los
-- datos antes de poder ir a buscarlos.
--
--   SUPABASE  el esquema relacional de siempre (lo de hoy)
--   NUBE      bloques cifrados en almacen_bloques
--   DRIVE     appDataFolder del usuario
do $$
begin
  if not exists (select 1 from pg_type where typname = 'storage_backend') then
    create type public.storage_backend as enum ('SUPABASE', 'NUBE', 'DRIVE');
  end if;
end
$$;

alter table public.user_profiles
  add column if not exists storage_backend public.storage_backend
    not null default 'SUPABASE';

comment on column public.user_profiles.storage_backend is
  'Donde viven los datos de este usuario. Uno solo activo a la vez.';


-- -----------------------------------------------------------------------------
-- 4. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.almacen_bloques enable row level security;
alter table public.almacen_sobres  enable row level security;
alter table public.almacen_bloques force row level security;
alter table public.almacen_sobres  force row level security;

-- --- bloques ------------------------------------------------------------------
drop policy if exists "almacen_bloques_select_own" on public.almacen_bloques;
create policy "almacen_bloques_select_own" on public.almacen_bloques
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "almacen_bloques_insert_own" on public.almacen_bloques;
create policy "almacen_bloques_insert_own" on public.almacen_bloques
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "almacen_bloques_update_own" on public.almacen_bloques;
create policy "almacen_bloques_update_own" on public.almacen_bloques
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "almacen_bloques_delete_own" on public.almacen_bloques;
create policy "almacen_bloques_delete_own" on public.almacen_bloques
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- --- sobres -------------------------------------------------------------------
drop policy if exists "almacen_sobres_select_own" on public.almacen_sobres;
create policy "almacen_sobres_select_own" on public.almacen_sobres
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "almacen_sobres_insert_own" on public.almacen_sobres;
create policy "almacen_sobres_insert_own" on public.almacen_sobres
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- UPDATE sí (cambio de contraseña, código nuevo). DELETE NO, y es a propósito:
-- borrar el sobre deja los bloques cifrados sin ninguna forma de abrirse. Si
-- alguna vez hace falta, que sea un borrado explícito de las dos cosas juntas.
drop policy if exists "almacen_sobres_update_own" on public.almacen_sobres;
create policy "almacen_sobres_update_own" on public.almacen_sobres
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);


-- -----------------------------------------------------------------------------
-- 5. Escritura con bloqueo optimista
-- -----------------------------------------------------------------------------
-- El cliente podría hacer el UPDATE con `.eq('version', n)` y mirar si volvió
-- alguna fila. Se hace acá adentro por dos razones:
--
--   · el incremento de `version` y la comparación pasan en la misma sentencia,
--     así que dos escrituras simultáneas no pueden leer el mismo número; y
--   · `version_esperada is null` (crear) y el update quedan en un solo viaje,
--     en vez de un insert que falla y un update de rescate.
--
-- Devuelve la versión nueva, o NULL si hubo conflicto. NULL no es un error de
-- la base: es la respuesta esperada cuando otro dispositivo se adelantó.
create or replace function public.almacen_guardar(
  p_clave            text,
  p_contenido        text,
  p_version_esperada bigint
)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_nueva bigint;
begin
  if auth.uid() is null then
    raise exception 'Se requiere un usuario autenticado' using errcode = '42501';
  end if;

  -- Crear: sólo si no existe. `on conflict do nothing` deja v_nueva en null,
  -- que es exactamente el conflicto que hay que informar.
  if p_version_esperada is null then
    insert into public.almacen_bloques (user_id, clave, contenido)
    values (auth.uid(), p_clave, p_contenido)
    on conflict (user_id, clave) do nothing
    returning version into v_nueva;

    return v_nueva;
  end if;

  update public.almacen_bloques
     set contenido   = p_contenido,
         version     = version + 1,
         actualizado = now()
   where user_id = auth.uid()
     and clave   = p_clave
     and version = p_version_esperada
  returning version into v_nueva;

  return v_nueva;
end;
$$;

revoke all on function public.almacen_guardar(text, text, bigint) from public;
grant execute on function public.almacen_guardar(text, text, bigint) to authenticated;


-- -----------------------------------------------------------------------------
-- 6. Permisos de tabla (RLS sigue siendo el filtro real)
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.almacen_bloques to authenticated;
grant select, insert, update          on public.almacen_sobres  to authenticated;
