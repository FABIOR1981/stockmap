-- stockmap v2: esquema completo, en este orden.
-- 1) depósitos: un documento por depósito (cliente).
--    estado: estructura, objetos, códigos, ubicaciones y auditoría (js/dominio/depositos.js).
--    version: control de cambios concurrentes. Cada guardado exige la versión que se leyó.
create table if not exists depositos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  estado jsonb not null,
  version integer not null default 1,
  actualizado timestamptz not null default now()
);

alter table depositos enable row level security;
-- Sin políticas: solo el servidor (clave de servicio) lee y escribe.

-- 2) usuarios por depósito (ver migracion_usuarios.sql).
create table if not exists usuarios (
  id uuid primary key default gen_random_uuid(),
  deposito_id uuid not null references depositos(id) on delete cascade,
  nombre text not null,
  rol text not null check (rol in ('administrador', 'supervisor', 'operario')),
  pin_hash text not null,
  creado timestamptz not null default now(),
  unique (deposito_id, nombre)
);

alter table usuarios enable row level security;

-- 3) intentos fallidos de ingreso (ver migracion_intentos.sql).
create table if not exists intentos_ingreso (
  clave text primary key,
  fallos integer not null default 0,
  hasta timestamptz
);

alter table intentos_ingreso enable row level security;
