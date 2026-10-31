-- Migración: posición de cada estantería en la vista aérea del recorrido 3D.
-- Ejecutar una sola vez en el SQL Editor de Supabase, después de esquema.sql (si la base ya existía).
-- Luego volver a ejecutar supabase/funciones.sql (cambió la función que guarda los lugares).

alter table lugares add column if not exists vista_x integer;      -- centro en el piso, en centímetros (null = por defecto)
alter table lugares add column if not exists vista_z integer;
alter table lugares add column if not exists vista_giro smallint;  -- cuartos de vuelta: 0, 1, 2 o 3
