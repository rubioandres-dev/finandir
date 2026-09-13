-- =============================================================================
-- 020 · Llaves de grupo: los gastos compartidos dejan de estar en claro
-- =============================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor. Idempotente.
-- Requiere: 015, 018 y 019 aplicadas.
--
-- QUÉ FALTABA
--
-- Los gastos compartidos eran el ÚLTIMO dato legible que nos quedaba. Un
-- espacio necesita filas que varias personas puedan leer, y la DEK de uno
-- —derivada de su contraseña— no le sirve a nadie más.
--
-- LA CADENA
--
--   contraseña -> KEK -> DEK          (personal, ver lib/almacen/cripto.ts)
--   DEK -> clave privada del usuario  (envuelta, viaja en su sobre)
--   pública de cada miembro -> GEK    (un sobre por miembro)
--   GEK -> los gastos del grupo
--
-- NO HAY DIRECTORIO GLOBAL DE CLAVES PÚBLICAS, Y ES A PROPÓSITO
--
-- La tentación es una tabla `claves_publicas` legible por todos: es lo más
-- simple de escribir. Pero eso deja que cualquier usuario autenticado enumere a
-- todos los demás, que es un dato que hoy nadie puede sacar de esta base.
--
-- En vez de eso, la clave pública viaja PEGADA A LA MEMBRESÍA: la escribe el
-- propio miembro en su fila de `shared_space_members`, y sólo la ven quienes
-- comparten ese espacio. Para envolverle la llave a alguien hay que tenerlo
-- adentro del grupo, que es exactamente la condición que uno querría.
--
-- "ADMIN" DEJA DE SER DECLARATIVO
--
-- Sólo quien PUEDE ABRIR la GEK puede envolvérsela a otro. Marcarse admin en la
-- base sin tener la llave no habilita nada: no hay forma de fabricar el sobre.
-- El rol acá es un espejo de una capacidad criptográfica real, no la fuente de
-- la verdad.
--
-- UN MIEMBRO SIN SOBRE ES UN MIEMBRO PENDIENTE
--
-- Entrar por QR sigue siendo un insert en `shared_space_members`. Lo que ese
-- insert YA NO da es acceso a los datos: hasta que un admin le envuelva la GEK,
-- el recién llegado ve el grupo y no sus gastos. No hace falta una tabla de
-- solicitudes: el estado "pidió entrar" es "está y todavía no tiene sobre".
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. La clave pública, pegada a la membresía
-- -----------------------------------------------------------------------------
alter table public.shared_space_members
  add column if not exists clave_publica jsonb;

comment on column public.shared_space_members.clave_publica is
  'JWK RSA-OAEP del miembro. Publica por diseno. La escribe el propio miembro.';

-- Un invitado sin cuenta (`user_id` nulo, ver la 015) NO tiene clave y no la
-- necesita: es un dato adentro del grupo, no alguien que lee.


-- -----------------------------------------------------------------------------
-- 2. Los sobres: la GEK envuelta para cada miembro
-- -----------------------------------------------------------------------------
create table if not exists public.shared_space_claves (
  space_id   uuid        not null references public.shared_spaces(id) on delete cascade,
  member_id  uuid        not null references public.shared_space_members(id) on delete cascade,
  /**
   * Sube en cada rotacion. Convive con la anterior durante una rotacion a medio
   * hacer: un gasto dice con que generacion se escribio, asi que se puede leer
   * lo viejo y lo nuevo sin adivinar.
   */
  generacion int         not null default 1 check (generacion > 0),
  /** La GEK envuelta con la publica del miembro: `v1.<datos>`. RSA no lleva IV. */
  clave_envuelta text    not null,
  creada     timestamptz not null default now(),

  primary key (space_id, member_id, generacion)
);

comment on table public.shared_space_claves is
  'Clave del grupo envuelta por miembro. El servidor no puede abrir ninguna.';

create index if not exists shared_claves_space_gen_idx
  on public.shared_space_claves (space_id, generacion desc);


-- -----------------------------------------------------------------------------
-- 3. La generación vigente del espacio
-- -----------------------------------------------------------------------------
alter table public.shared_spaces
  add column if not exists generacion int not null default 1 check (generacion > 0);

comment on column public.shared_spaces.generacion is
  'Generacion de clave vigente. Sube al expulsar a alguien o al sospechar una filtracion.';


-- -----------------------------------------------------------------------------
-- 4. El gasto, cifrado
-- -----------------------------------------------------------------------------
-- Las columnas en claro se conservan NULLABLE durante la transicion: hay grupos
-- con datos cargados y no se pueden cifrar desde el servidor —justamente porque
-- el servidor no tiene la llave—. Las re-escribe el cliente de cada miembro la
-- primera vez que abre el grupo, y recien cuando no quede ninguna con dato se
-- pueden dropear.
alter table public.shared_transactions
  add column if not exists payload_cifrado text,
  add column if not exists generacion      int;

alter table public.shared_goals
  add column if not exists payload_cifrado text,
  add column if not exists generacion      int;

comment on column public.shared_transactions.payload_cifrado is
  'AES-GCM con la clave del grupo: `v1.<iv>.<datos>`. Lleva monto, descripcion y categoria.';

-- `amount`, `date` y `space_id` siguen en claro y no es un descuido:
--   · `space_id` es el filtro de la RLS y no puede estar cifrado;
--   · `date` ordena y pagina del lado del servidor;
--   · `amount` se deja por ahora porque los saldos se muestran sin abrir cada
--     gasto. Cifrarlo tambien es posible y es el paso siguiente; cuando se haga,
--     `calcularBalances` corre entero en el cliente, que ya es una funcion pura.


-- -----------------------------------------------------------------------------
-- 5. Roles: creador y varios administradores
-- -----------------------------------------------------------------------------
-- `role` (ADMIN | MEMBER) ya existe desde la 011 y admite varios admins sin
-- tocar nada. Lo que faltaba es que el CREADOR sea distinguible y no se pueda
-- quedar el grupo sin nadie que pueda repartir llaves.
--
-- El creador sale de `shared_spaces.created_by`, que ya esta. Lo que se agrega
-- es la garantia de que su fila de miembro sea ADMIN.
update public.shared_space_members m
   set role = 'ADMIN'
  from public.shared_spaces s
 where s.id = m.space_id
   and s.created_by = m.user_id
   and m.role <> 'ADMIN';

/**
 * Impide quedarse sin administradores.
 *
 * Un espacio sin admin es un espacio donde nadie puede volver a repartir la
 * llave: ni sumar gente, ni rotar al expulsar. Es un estado del que no se sale,
 * asi que se bloquea antes de entrar.
 */
create or replace function public.impedir_espacio_sin_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.shared_space_members
     where space_id = coalesce(old.space_id, new.space_id)
       and role = 'ADMIN'
       and id <> old.id
  ) then
    raise exception 'El espacio quedaria sin administradores.' using errcode = '23514';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists shared_members_guardar_admin on public.shared_space_members;
create trigger shared_members_guardar_admin
  before delete or update of role on public.shared_space_members
  for each row
  when (old.role = 'ADMIN')
  execute function public.impedir_espacio_sin_admin();


-- -----------------------------------------------------------------------------
-- 6. Row Level Security de los sobres
-- -----------------------------------------------------------------------------
alter table public.shared_space_claves enable row level security;
alter table public.shared_space_claves force row level security;

/** Miembro del espacio con cuenta. Se usa en las politicas de abajo. */
create or replace function public.es_miembro_del_espacio(p_space uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.shared_space_members
     where space_id = p_space and user_id = auth.uid()
  );
$$;

create or replace function public.es_admin_del_espacio(p_space uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.shared_space_members
     where space_id = p_space and user_id = auth.uid() and role = 'ADMIN'
  );
$$;

grant execute on function public.es_miembro_del_espacio(uuid) to authenticated;
grant execute on function public.es_admin_del_espacio(uuid)  to authenticated;

-- Leer: cualquier miembro ve los sobres del espacio. No es una filtracion —un
-- sobre ajeno esta cifrado con la publica de otro y es inabrible— y simplifica
-- que un admin sepa a quien le falta llave.
drop policy if exists "shared_claves_select" on public.shared_space_claves;
create policy "shared_claves_select" on public.shared_space_claves
  for select to authenticated
  using (public.es_miembro_del_espacio(space_id));

-- Escribir: solo los admin. Aunque alguien se saltee esto, sin la GEK no puede
-- fabricar un sobre que sirva: la politica acompana a la criptografia, no la
-- reemplaza.
drop policy if exists "shared_claves_insert" on public.shared_space_claves;
create policy "shared_claves_insert" on public.shared_space_claves
  for insert to authenticated
  with check (public.es_admin_del_espacio(space_id));

drop policy if exists "shared_claves_delete" on public.shared_space_claves;
create policy "shared_claves_delete" on public.shared_space_claves
  for delete to authenticated
  using (public.es_admin_del_espacio(space_id));

grant select, insert, delete on public.shared_space_claves to authenticated;
