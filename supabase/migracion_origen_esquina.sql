-- Origen en la esquina: las posiciones de las estanterías de edificios con medidas pasan de
-- "centradas en el ancho" a "desde el vértice frontal izquierdo del galpón".
-- Ejecutar UNA SOLA VEZ, después de desplegar el cambio. (Un edificio que recién recibe medidas
-- ya se convierte solo desde la app; este script es para los que ya las tenían.)
update public.lugares r
set vista_x = round(r.vista_x + b.dim_ancho / 2.0)
from public.lugares b
where r.padre_id = b.id
  and b.dim_ancho is not null
  and b.dim_largo is not null
  and r.vista_x is not null;
