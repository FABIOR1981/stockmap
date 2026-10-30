-- =====================================================================
-- stockmap: esquema de base de datos (Supabase / PostgreSQL)
-- Ejecutar en Supabase > SQL Editor, de una vez.
--
-- Diseño de seguridad:
--   La web NO habla con la base. Solo lo hace el Worker de Cloudflare,
--   con la clave service_role (secreto del Worker, nunca en el navegador).
--   RLS queda activado y SIN políticas, y se revocan permisos a anon y
--   authenticated: si alguien obtiene la URL o la clave pública, no ve nada.
--   Los permisos por cliente (admin, editor, lector) los aplica el Worker
--   antes de escribir, y las triggers de abajo protegen las reglas del depósito.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Usuarios de la app. Cada cuenta de Supabase Auth tiene un perfil.
-- ---------------------------------------------------------------------
create table if not exists perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null default '',
  es_admin    boolean not null default false,   -- administrador general
  creado_en   timestamptz not null default now()
);

create or replace function crear_perfil_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', new.email, ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function crear_perfil_nuevo();

-- ---------------------------------------------------------------------
-- Clientes y accesos por cliente
-- ---------------------------------------------------------------------
create table if not exists establecimientos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  creado_en   timestamptz not null default now()
);

create table if not exists membresias (
  usuario_id          uuid not null references perfiles(id) on delete cascade,
  establecimiento_id  uuid not null references establecimientos(id) on delete cascade,
  rol                 text not null check (rol in ('admin', 'editor', 'lector')),
  primary key (usuario_id, establecimiento_id)
);

-- ---------------------------------------------------------------------
-- Depósito: lugares en árbol (edificio > ... > lugar)
-- ---------------------------------------------------------------------
create table if not exists lugares (
  id                  uuid primary key default gen_random_uuid(),
  establecimiento_id  uuid not null references establecimientos(id) on delete cascade,
  padre_id            uuid references lugares(id) on delete restrict,   -- null = edificio
  codigo              text not null,
  nombre              text not null default '',
  pos_x               integer,   -- posición libre en el plano (null = sin mover)
  pos_y               integer,
  vista_x             integer,   -- centro en el piso del recorrido 3D, en cm (null = por defecto)
  vista_z             integer,
  vista_giro          smallint,  -- cuartos de vuelta: 0 a 3
  creado_en           timestamptz not null default now()
);

-- Códigos únicos entre hermanos (sin distinguir mayúsculas)
create unique index if not exists lugares_codigo_hermanos
  on lugares (establecimiento_id,
              coalesce(padre_id, '00000000-0000-0000-0000-000000000000'::uuid),
              lower(codigo));
create index if not exists lugares_padre on lugares (padre_id);

-- Niveles que define cada edificio: orden 1 = lo que va justo dentro del edificio
create table if not exists niveles_edificio (
  edificio_id     uuid not null references lugares(id) on delete cascade,
  orden           integer not null check (orden >= 1),
  nombre          text not null,
  formato         text not null check (formato in ('numero', 'letra', 'letra_min')),
  nombre_opcional boolean not null default false,
  primary key (edificio_id, orden)
);

-- ---------------------------------------------------------------------
-- Objetos: unidades (una por una) y productos (hay varias iguales)
-- ---------------------------------------------------------------------
create sequence if not exists objetos_seq;

create table if not exists objetos (
  id                  uuid primary key default gen_random_uuid(),
  establecimiento_id  uuid not null references establecimientos(id) on delete cascade,
  codigo_interno      text not null unique
                      default 'OBJ-' || lpad(nextval('objetos_seq')::text, 6, '0'),
  codigo_propio       text,
  descripcion         text,
  tipo                text not null default 'unidad' check (tipo in ('unidad', 'producto')),
  minimo              integer not null default 0 check (minimo >= 0),   -- alerta de stock (productos)
  creado_en           timestamptz not null default now()
);
create index if not exists objetos_establecimiento on objetos (establecimiento_id);

-- Existencias: cuánto de un objeto hay en un lugar. Una fila por par (lugar, objeto).
create table if not exists existencias (
  id          uuid primary key default gen_random_uuid(),
  lugar_id    uuid not null references lugares(id) on delete cascade,
  objeto_id   uuid not null references objetos(id) on delete cascade,
  cantidad    integer not null check (cantidad > 0),   -- sin existencias negativas ni filas en cero
  unique (lugar_id, objeto_id)
);
create index if not exists existencias_objeto on existencias (objeto_id);

-- ---------------------------------------------------------------------
-- Movimientos: historial de entradas, salidas y transferencias
-- ---------------------------------------------------------------------
create table if not exists movimientos (
  id                  uuid primary key default gen_random_uuid(),
  establecimiento_id  uuid not null references establecimientos(id) on delete cascade,
  objeto_id           uuid references objetos(id) on delete set null,
  tipo                text not null check (tipo in ('entrada', 'salida', 'transferencia')),
  desde_lugar_id      uuid references lugares(id) on delete set null,
  hasta_lugar_id      uuid references lugares(id) on delete set null,
  cantidad            integer not null check (cantidad > 0),
  usuario_id          uuid references perfiles(id) on delete set null,
  nota                text not null default '',
  creado_en           timestamptz not null default now()
);
create index if not exists movimientos_establecimiento
  on movimientos (establecimiento_id, creado_en desc);

-- =====================================================================
-- Reglas del depósito (en la base, no solo en la aplicación)
-- =====================================================================

-- Un lugar nuevo: el padre es del mismo cliente, no tiene stock arriba
-- y el edificio define nivel para esa profundidad.
create or replace function validar_lugar() returns trigger
language plpgsql as $$
declare
  v_orden  integer;
  v_raiz   uuid;
begin
  if new.padre_id is null then
    return new;   -- edificio
  end if;

  if not exists (select 1 from lugares p
                 where p.id = new.padre_id and p.establecimiento_id = new.establecimiento_id) then
    raise exception 'El lugar padre pertenece a otro cliente.';
  end if;

  if exists (
    with recursive anc as (
      select id, padre_id from lugares where id = new.padre_id
      union all
      select l.id, l.padre_id from lugares l join anc a on l.id = a.padre_id
    )
    select 1 from existencias e join anc on e.lugar_id = anc.id
  ) then
    raise exception 'El lugar padre (o uno que lo contiene) tiene objetos. Sacalos antes de subdividirlo.';
  end if;

  -- Ruta hasta el edificio: count = profundidad del hijo nuevo; el edificio es la raíz
  with recursive anc as (
    select id, padre_id from lugares where id = new.padre_id
    union all
    select l.id, l.padre_id from lugares l join anc a on l.id = a.padre_id
  )
  select count(*), max(case when padre_id is null then id::text end)::uuid
    into v_orden, v_raiz
  from anc;

  if not exists (select 1 from niveles_edificio n
                 where n.edificio_id = v_raiz and n.orden = v_orden) then
    raise exception 'El edificio no tiene nivel definido para esta profundidad.';
  end if;

  return new;
end $$;

drop trigger if exists lugares_validar on lugares;
create trigger lugares_validar
  before insert on lugares
  for each row execute function validar_lugar();

-- No se borra un lugar (ni lo que tiene adentro) si algo tiene stock.
create or replace function validar_borrado_lugar() returns trigger
language plpgsql as $$
begin
  if exists (
    with recursive desc_ as (
      select id from lugares where id = old.id
      union all
      select l.id from lugares l join desc_ d on l.padre_id = d.id
    )
    select 1 from existencias e join desc_ on e.lugar_id = desc_.id
  ) then
    raise exception 'Hay objetos dentro. Sacalos antes de borrar.';
  end if;
  return old;
end $$;

drop trigger if exists lugares_validar_borrado on lugares;
create trigger lugares_validar_borrado
  before delete on lugares
  for each row execute function validar_borrado_lugar();

-- Existencias: solo en lugares hoja que no son edificio, del mismo cliente.
-- Una unidad siempre tiene cantidad 1.
create or replace function validar_existencia() returns trigger
language plpgsql as $$
declare
  v_est_lugar  uuid;
  v_padre      uuid;
  v_est_obj    uuid;
  v_tipo       text;
begin
  select establecimiento_id, padre_id into v_est_lugar, v_padre
  from lugares where id = new.lugar_id;

  select establecimiento_id, tipo into v_est_obj, v_tipo
  from objetos where id = new.objeto_id;

  if v_est_lugar is distinct from v_est_obj then
    raise exception 'El objeto y el lugar son de clientes distintos.';
  end if;
  if v_padre is null then
    raise exception 'Los edificios no tienen objetos directos.';
  end if;
  if v_tipo = 'unidad' and new.cantidad <> 1 then
    raise exception 'Una unidad ocupa cantidad 1.';
  end if;
  return new;
end $$;

drop trigger if exists existencias_validar on existencias;
create trigger existencias_validar
  before insert or update on existencias
  for each row execute function validar_existencia();

-- 2) La regla de ocupación se evalúa al confirmar la transacción (diferida), así una sincronización
--    que mueve objetos entre lugares se valida con el resultado final.
create or replace function validar_ocupacion() returns trigger
language plpgsql as $$
begin
  -- Ningún lugar de arriba puede tener objetos.
  if exists (
    with recursive arriba as (
      select padre_id as id from lugares where id = new.lugar_id and padre_id is not null
      union all
      select l.padre_id from lugares l join arriba a on l.id = a.id where l.padre_id is not null
    )
    select 1 from existencias e join arriba a on e.lugar_id = a.id
  ) then
    raise exception 'Un lugar de arriba tiene un objeto puesto. Sacalo antes de usar este lugar.';
  end if;
  -- Ningún lugar de adentro puede tener objetos.
  if exists (
    with recursive adentro as (
      select id from lugares where padre_id = new.lugar_id
      union all
      select l.id from lugares l join adentro a on l.padre_id = a.id
    )
    select 1 from existencias e join adentro a on e.lugar_id = a.id
  ) then
    raise exception 'Hay objetos en lugares de adentro. Sacalos antes de poner algo acá.';
  end if;
  return null;
end $$;

drop trigger if exists existencias_ocupacion on existencias;
create constraint trigger existencias_ocupacion
  after insert or update on existencias
  deferrable initially deferred
  for each row execute function validar_ocupacion();

-- No se borra un objeto que tiene existencias.
create or replace function validar_borrado_objeto() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from existencias where objeto_id = old.id) then
    raise exception 'Ese objeto tiene existencias. Sacalas antes de borrarlo.';
  end if;
  return old;
end $$;

drop trigger if exists objetos_validar_borrado on objetos;
create trigger objetos_validar_borrado
  before delete on objetos
  for each row execute function validar_borrado_objeto();

-- =====================================================================
-- Seguridad: nadie entra con anon ni authenticated.
-- Solo el Worker (service_role, que salta RLS) lee y escribe.
-- =====================================================================
alter table perfiles            enable row level security;
alter table establecimientos    enable row level security;
alter table membresias          enable row level security;
alter table lugares             enable row level security;
alter table niveles_edificio    enable row level security;
alter table objetos             enable row level security;
alter table existencias         enable row level security;
alter table movimientos         enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- =====================================================================
-- Puesta en marcha (después de ejecutar lo anterior)
-- =====================================================================
-- 1) En Supabase > Authentication > Sign In / Providers: desactivar
--    "Allow new users to sign up". Así solo vos creás cuentas.
-- 2) Crear tu usuario en Authentication > Users (email y contraseña).
-- 3) Hacerte administrador general:
--
--    update perfiles set es_admin = true where id = 'TU-UUID-AQUI';
--
-- 4) Crear un cliente de prueba:
--
--    insert into establecimientos (nombre) values ('Cliente de prueba') returning id;
--
-- 5) Dar acceso a un usuario de cliente (rol: admin, editor o lector):
--
--    insert into membresias (usuario_id, establecimiento_id, rol)
--    values ('UUID-DEL-USUARIO', 'UUID-DEL-CLIENTE', 'editor');
