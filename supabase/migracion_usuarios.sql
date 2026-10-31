-- stockmap v2: usuarios por depósito con PIN (guardado como hash, nunca en claro).
-- Ejecutar DESPUÉS de esquema.sql.
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
-- Sin políticas: solo el servidor (clave de servicio) lee y escribe.
