-- stockmap v2: un documento por depósito (cliente).
-- estado: estructura, objetos, códigos, ubicaciones y auditoría (ver js/dominio/depositos.js).
-- version: control de cambios concurrentes. Cada guardado exige la versión que se leyó.
create table if not exists depositos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  estado jsonb not null,
  version integer not null default 1,
  actualizado timestamptz not null default now()
);

alter table depositos enable row level security;
-- Sin políticas: solo el servidor (clave de servicio) lee y escribe.
