-- Vencimientos (módulo opcional por cliente). Ejecutar UNA vez en Supabase, antes de publicar el código nuevo.
-- Un producto puede tener días de vida útil; el cliente puede tener el módulo activado.

alter table objetos add column if not exists vence_dias integer
  check (vence_dias is null or vence_dias > 0);

alter table establecimientos add column if not exists vencimientos boolean not null default false;
