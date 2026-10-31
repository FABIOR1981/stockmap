-- Migración: un lugar puede tener objetos aunque tenga subdivisiones, siempre que estén libres.
-- Regla: un objeto está en un lugar solo si ningún lugar de adentro ni de arriba tiene objetos.
-- Se ejecuta una vez en el SQL Editor de Supabase. Es seguro correrla más de una vez.

-- 1) Se quita la regla vieja de "tiene subdivisiones" de la validación inmediata.
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
