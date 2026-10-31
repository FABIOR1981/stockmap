-- Migración: medidas de cada edificio (ancho, largo y alto, en centímetros).
-- Ejecutar una sola vez en el SQL Editor de Supabase, después de esquema.sql (si la base ya existía).
-- Luego volver a ejecutar supabase/funciones.sql (cambió la función que guarda los lugares).

alter table lugares add column if not exists dim_ancho integer;  -- solo edificios; null = sin medir
alter table lugares add column if not exists dim_largo integer;
alter table lugares add column if not exists dim_alto integer;
