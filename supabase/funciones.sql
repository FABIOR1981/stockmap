-- =====================================================================
-- stockmap: función que aplica todos los cambios de un envío en UNA sola llamada.
-- Ejecutar en Supabase > SQL Editor, después de supabase/esquema.sql.
--
-- Todo el envío corre en una transacción: si algo falla, no queda nada a medias.
-- La API (Cloudflare) ya validó permisos antes de llamarla.
-- =====================================================================

create or replace function guardar_fila(t text, f jsonb) returns void
language plpgsql as $$
begin
  case t
  when 'establecimientos' then
    insert into establecimientos (id, nombre)
    values ((f->>'id')::uuid, f->>'nombre')
    on conflict (id) do update set nombre = excluded.nombre;

  when 'membresias' then
    insert into membresias (usuario_id, establecimiento_id, rol)
    values ((f->>'usuario_id')::uuid, (f->>'establecimiento_id')::uuid, f->>'rol')
    on conflict (usuario_id, establecimiento_id) do update set rol = excluded.rol;

  when 'lugares' then
    insert into lugares (id, establecimiento_id, padre_id, codigo, nombre, pos_x, pos_y, vista_x, vista_z, vista_giro,
                         dim_ancho, dim_largo, dim_alto)
    values ((f->>'id')::uuid, (f->>'establecimiento_id')::uuid, nullif(f->>'padre_id', '')::uuid,
            f->>'codigo', coalesce(f->>'nombre', ''),
            nullif(f->>'pos_x', '')::integer, nullif(f->>'pos_y', '')::integer,
            nullif(f->>'vista_x', '')::integer, nullif(f->>'vista_z', '')::integer, nullif(f->>'vista_giro', '')::smallint,
            nullif(f->>'dim_ancho', '')::integer, nullif(f->>'dim_largo', '')::integer, nullif(f->>'dim_alto', '')::integer)
    on conflict (id) do update set establecimiento_id = excluded.establecimiento_id,
      padre_id = excluded.padre_id, codigo = excluded.codigo, nombre = excluded.nombre,
      dim_ancho = coalesce(excluded.dim_ancho, lugares.dim_ancho), dim_largo = coalesce(excluded.dim_largo, lugares.dim_largo),
      dim_alto = coalesce(excluded.dim_alto, lugares.dim_alto),
      pos_x = coalesce(excluded.pos_x, lugares.pos_x), pos_y = coalesce(excluded.pos_y, lugares.pos_y),
      vista_x = coalesce(excluded.vista_x, lugares.vista_x), vista_z = coalesce(excluded.vista_z, lugares.vista_z),
      vista_giro = coalesce(excluded.vista_giro, lugares.vista_giro);

  when 'niveles_edificio' then
    insert into niveles_edificio (edificio_id, orden, nombre, formato, nombre_opcional)
    values ((f->>'edificio_id')::uuid, (f->>'orden')::int, f->>'nombre', f->>'formato',
            coalesce((f->>'nombre_opcional')::boolean, false))
    on conflict (edificio_id, orden) do update set nombre = excluded.nombre,
      formato = excluded.formato, nombre_opcional = excluded.nombre_opcional;

  when 'objetos' then
    insert into objetos (id, establecimiento_id, codigo_interno, codigo_propio, descripcion, tipo, minimo)
    values ((f->>'id')::uuid, (f->>'establecimiento_id')::uuid, f->>'codigo_interno', f->>'codigo_propio',
            f->>'descripcion', coalesce(f->>'tipo', 'unidad'), coalesce((f->>'minimo')::int, 0))
    on conflict (id) do update set establecimiento_id = excluded.establecimiento_id,
      codigo_interno = excluded.codigo_interno, codigo_propio = excluded.codigo_propio,
      descripcion = excluded.descripcion, tipo = excluded.tipo, minimo = excluded.minimo;

  when 'existencias' then
    insert into existencias (id, objeto_id, lugar_id, cantidad)
    values ((f->>'id')::uuid, (f->>'objeto_id')::uuid, (f->>'lugar_id')::uuid, (f->>'cantidad')::int)
    on conflict (id) do update set objeto_id = excluded.objeto_id,
      lugar_id = excluded.lugar_id, cantidad = excluded.cantidad;

  when 'movimientos' then
    insert into movimientos (id, establecimiento_id, objeto_id, tipo, desde_lugar_id, hasta_lugar_id,
                             cantidad, usuario_id, nota, creado_en)
    values ((f->>'id')::uuid, (f->>'establecimiento_id')::uuid, nullif(f->>'objeto_id', '')::uuid,
            f->>'tipo', nullif(f->>'desde_lugar_id', '')::uuid, nullif(f->>'hasta_lugar_id', '')::uuid,
            (f->>'cantidad')::int, nullif(f->>'usuario_id', '')::uuid, coalesce(f->>'nota', ''),
            coalesce((f->>'creado_en')::timestamptz, now()))
    on conflict (id) do update set establecimiento_id = excluded.establecimiento_id,
      objeto_id = excluded.objeto_id, tipo = excluded.tipo, desde_lugar_id = excluded.desde_lugar_id,
      hasta_lugar_id = excluded.hasta_lugar_id, cantidad = excluded.cantidad,
      usuario_id = excluded.usuario_id, nota = excluded.nota, creado_en = excluded.creado_en;

  else
    raise exception 'Tabla no permitida: %', t;
  end case;
end $$;

create or replace function borrar_fila(t text, c jsonb) returns void
language plpgsql as $$
begin
  case t
  when 'establecimientos' then delete from establecimientos where id = (c->>'id')::uuid;
  when 'membresias' then delete from membresias
    where usuario_id = (c->>'usuario_id')::uuid and establecimiento_id = (c->>'establecimiento_id')::uuid;
  when 'lugares' then delete from lugares where id = (c->>'id')::uuid;
  when 'niveles_edificio' then delete from niveles_edificio
    where edificio_id = (c->>'edificio_id')::uuid and orden = (c->>'orden')::int;
  when 'objetos' then delete from objetos where id = (c->>'id')::uuid;
  when 'existencias' then delete from existencias where id = (c->>'id')::uuid;
  when 'movimientos' then delete from movimientos where id = (c->>'id')::uuid;
  else
    raise exception 'Tabla no permitida: %', t;
  end case;
end $$;

-- Punto de entrada: recibe la lista de cambios y devuelve cuántos aplicó.
create or replace function aplicar_cambios(ops jsonb) returns integer
language plpgsql as $$
declare
  op jsonb;
  n integer := 0;
begin
  for op in select value from jsonb_array_elements(ops) loop
    if op->>'op' = 'delete' then
      perform borrar_fila(op->>'tabla', op->'clave');
    elsif op->>'op' = 'upsert' then
      perform guardar_fila(op->>'tabla', op->'fila');
    else
      raise exception 'Operación inválida';
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Solo el servidor (service_role) puede ejecutarlas.
revoke execute on function aplicar_cambios(jsonb) from public, anon, authenticated;
revoke execute on function guardar_fila(text, jsonb) from public, anon, authenticated;
revoke execute on function borrar_fila(text, jsonb) from public, anon, authenticated;
