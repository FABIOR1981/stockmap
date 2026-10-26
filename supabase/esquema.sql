-- =====================================================================
-- Esquema Supabase v2: sistema de depósitos (multi-cliente)
-- Destino: /mnt/user-data/outputs/esquema_supabase_v2.sql
-- Ejecutar en: Supabase > SQL Editor. Reemplaza al esquema_supabase.sql
-- Cambios respecto de v1:
--   * un lugar puede tener varios objetos (sin límite de cantidad)
--   * un objeto puede estar en varios lugares
--   * un lugar con subdivisiones no tiene objetos directos
--   * un lugar con objetos no admite subdivisiones
--   * los edificios no tienen objetos directos
--   * sin tamaños de lugares ni de objetos
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Perfiles ----------
create table if not exists perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text,
  es_admin    boolean not null default false,
  creado_en   timestamptz not null default now()
);

create or replace function crear_perfil_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, nombre) values (new.id, new.raw_user_meta_data->>'nombre');
  return new;
end $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function crear_perfil_nuevo();

-- ---------- Establecimientos ----------
create table if not exists establecimientos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  creado_en   timestamptz not null default now()
);

-- ---------- Membresías ----------
create table if not exists membresias (
  usuario_id          uuid not null references auth.users(id) on delete cascade,
  establecimiento_id  uuid not null references establecimientos(id) on delete cascade,
  rol                 text not null check (rol in ('admin', 'editor', 'lector')),
  primary key (usuario_id, establecimiento_id)
);

-- ---------- Lugares (edificios y todo lo que hay dentro) ----------
-- Los niveles viven en cada edificio: se guardan en la tabla niveles_edificio.
create table if not exists lugares (
  id                  uuid primary key default gen_random_uuid(),
  establecimiento_id  uuid not null references establecimientos(id) on delete cascade,
  padre_id            uuid references lugares(id) on delete no action,   -- nulo = edificio
  codigo              text not null,
  nombre              text,
  creado_en           timestamptz not null default now()
);

-- Códigos únicos entre hermanos (sin distinguir mayúsculas)
create unique index if not exists lugares_codigo_hermanos
  on lugares (establecimiento_id,
              coalesce(padre_id, '00000000-0000-0000-0000-000000000000'::uuid),
              lower(codigo));

create index if not exists lugares_padre on lugares (padre_id);

-- ---------- Niveles de cada edificio ----------
-- Cada edificio define sus propios niveles, en orden de profundidad.
-- orden = 1 es el nivel que va justo dentro del edificio.
create table if not exists niveles_edificio (
  id              uuid primary key default gen_random_uuid(),
  edificio_id     uuid not null references lugares(id) on delete cascade,
  orden           int not null check (orden >= 1),
  nombre          text not null,
  formato         text not null check (formato in ('numero', 'letra', 'letra_min')),
  nombre_opcional boolean not null default false,
  unique (edificio_id, orden)
);

-- ---------- Objetos ----------
create sequence if not exists objetos_seq;

create table if not exists objetos (
  id                  uuid primary key default gen_random_uuid(),
  establecimiento_id  uuid not null references establecimientos(id) on delete cascade,
  codigo_interno      text not null unique
                      default 'OBJ-' || lpad(nextval('objetos_seq')::text, 6, '0'),
  codigo_propio       text,
  descripcion         text,
  creado_en           timestamptz not null default now()
);

create index if not exists objetos_establecimiento on objetos (establecimiento_id);
create index if not exists objetos_codigo_propio on objetos (establecimiento_id, lower(codigo_propio));

-- ---------- Asignaciones ----------
-- Un lugar puede tener muchas asignaciones; un objeto puede estar en muchos lugares.
-- Un mismo objeto no se repite en el mismo lugar.
create table if not exists asignaciones (
  id                  uuid primary key default gen_random_uuid(),
  establecimiento_id  uuid not null references establecimientos(id) on delete cascade,
  objeto_id           uuid not null references objetos(id) on delete cascade,
  lugar_id            uuid not null references lugares(id) on delete restrict,
  asignado_en         timestamptz not null default now(),
  unique (objeto_id, lugar_id)
);

create index if not exists asignaciones_lugar on asignaciones (lugar_id);

-- =====================================================================
-- Reglas de negocio (en la base, no solo en la interfaz)
-- =====================================================================

-- Al crear un lugar dentro de otro:
--  * el padre no puede tener objetos asignados (hay que sacarlos antes de subdividir)
--  * el nivel tiene que estar definido en el edificio
create or replace function validar_lugar() returns trigger
language plpgsql as $$
declare
  v_edificio uuid;
  v_profundidad int;
begin
  if new.padre_id is null then
    return new;   -- edificio: no tiene reglas de objetos
  end if;

  if exists (select 1 from asignaciones s where s.lugar_id = new.padre_id) then
    raise exception 'Este lugar tiene objetos. Sacalos antes de subdividirlo.';
  end if;

  -- Subir desde el padre hasta el edificio. El nivel en que queda el edificio
  -- indica la profundidad del nuevo lugar (1 = justo dentro del edificio).
  with recursive ruta as (
    select id, padre_id, 1 as nivel from lugares where id = new.padre_id
    union all
    select l.id, l.padre_id, r.nivel + 1 from lugares l join ruta r on l.id = r.padre_id
  )
  select id, nivel into v_edificio, v_profundidad from ruta where padre_id is null;

  if not exists (
    select 1 from niveles_edificio n where n.edificio_id = v_edificio and n.orden = v_profundidad
  ) then
    raise exception 'El edificio no tiene nivel definido para esta profundidad. Agregalo en sus niveles.';
  end if;

  return new;
end $$;

drop trigger if exists lugares_validar on lugares;
create trigger lugares_validar
  before insert on lugares
  for each row execute function validar_lugar();

-- Al asignar un objeto a un lugar:
--  * el lugar no puede ser un edificio
--  * el lugar no puede tener subdivisiones (los objetos van dentro de ellas)
--  * el objeto y el lugar tienen que ser del mismo establecimiento
create or replace function validar_asignacion() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from lugares l where l.id = new.lugar_id and l.establecimiento_id = new.establecimiento_id) then
    raise exception 'El lugar no pertenece a este establecimiento.';
  end if;
  if not exists (select 1 from objetos o where o.id = new.objeto_id and o.establecimiento_id = new.establecimiento_id) then
    raise exception 'El objeto no pertenece a este establecimiento.';
  end if;
  if exists (select 1 from lugares l where l.id = new.lugar_id and l.padre_id is null) then
    raise exception 'Los edificios no tienen objetos directos. Elegí un lugar dentro.';
  end if;
  if exists (select 1 from lugares h where h.padre_id = new.lugar_id) then
    raise exception 'Este lugar tiene subdivisiones. Los objetos van dentro de ellas.';
  end if;
  return new;
end $$;

drop trigger if exists asignaciones_validar on asignaciones;
create trigger asignaciones_validar
  before insert on asignaciones
  for each row execute function validar_asignacion();

-- =====================================================================
-- Seguridad: funciones de permiso
-- =====================================================================

create or replace function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select es_admin from perfiles where id = auth.uid()), false);
$$;

create or replace function puede_ver(est uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_admin() or exists (
    select 1 from membresias m where m.usuario_id = auth.uid() and m.establecimiento_id = est
  );
$$;

create or replace function puede_editar(est uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_admin() or exists (
    select 1 from membresias m
    where m.usuario_id = auth.uid() and m.establecimiento_id = est and m.rol in ('admin', 'editor')
  );
$$;

-- =====================================================================
-- Row Level Security
-- =====================================================================

alter table perfiles         enable row level security;
alter table establecimientos enable row level security;
alter table membresias       enable row level security;
alter table lugares          enable row level security;
alter table niveles_edificio enable row level security;
alter table objetos          enable row level security;
alter table asignaciones     enable row level security;

create policy perfiles_ver on perfiles for select
  using (id = auth.uid() or es_admin());

create policy establecimientos_ver on establecimientos for select using (puede_ver(id));
create policy establecimientos_crear on establecimientos for insert with check (es_admin());
create policy establecimientos_editar on establecimientos for update using (es_admin()) with check (es_admin());
create policy establecimientos_borrar on establecimientos for delete using (es_admin());

create policy membresias_ver on membresias for select using (usuario_id = auth.uid() or es_admin());
create policy membresias_gestionar on membresias for all using (es_admin()) with check (es_admin());

-- Lugares: el establecimiento viene del edificio raíz
create policy lugares_ver on lugares for select
  using (puede_ver(establecimiento_id));
create policy lugares_editar on lugares for all
  using (puede_editar(establecimiento_id)) with check (puede_editar(establecimiento_id));

-- Niveles: se editan a través del edificio, con el mismo permiso
create policy niveles_ver on niveles_edificio for select
  using (exists (select 1 from lugares l where l.id = edificio_id and puede_ver(l.establecimiento_id)));
create policy niveles_editar on niveles_edificio for all
  using (exists (select 1 from lugares l where l.id = edificio_id and puede_editar(l.establecimiento_id)))
  with check (exists (select 1 from lugares l where l.id = edificio_id and puede_editar(l.establecimiento_id)));

create policy objetos_ver on objetos for select using (puede_ver(establecimiento_id));
create policy objetos_editar on objetos for all
  using (puede_editar(establecimiento_id)) with check (puede_editar(establecimiento_id));

create policy asignaciones_ver on asignaciones for select using (puede_ver(establecimiento_id));
create policy asignaciones_editar on asignaciones for all
  using (puede_editar(establecimiento_id)) with check (puede_editar(establecimiento_id));

-- =====================================================================
-- Puesta en marcha
-- =====================================================================
-- 1) Registrate en la app y copiá tu UUID desde Authentication > Users.
-- 2) update perfiles set es_admin = true where id = 'TU-UUID-AQUI';
-- 3) insert into establecimientos (nombre) values ('Cliente de prueba') returning id;
-- 4) insert into membresias (usuario_id, establecimiento_id, rol)
--    values ('UUID-DEL-USUARIO', 'UUID-DEL-ESTABLECIMIENTO', 'editor');
