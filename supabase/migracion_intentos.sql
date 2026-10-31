-- stockmap v2: límite de intentos de PIN por depósito y nombre.
-- Ejecutar DESPUÉS de esquema.sql (o de migracion_usuarios.sql si ya la ejecutaste).
create table if not exists intentos_ingreso (
  clave text primary key,
  fallos integer not null default 0,
  hasta timestamptz
);

alter table intentos_ingreso enable row level security;
-- Sin políticas: solo el servidor (clave de servicio) lee y escribe.
