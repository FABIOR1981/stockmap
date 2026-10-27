-- Migración: posición libre de cada lugar en el plano.
-- Ejecutar una sola vez en el SQL Editor de Supabase, después de esquema.sql (si la base ya existía).
-- Luego volver a ejecutar supabase/funciones.sql (cambió la función que guarda los lugares).

alter table lugares add column if not exists pos_x integer;   -- null = sin mover
alter table lugares add column if not exists pos_y integer;
