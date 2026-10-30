// Medidas del galpón (ancho, largo y alto): lectura del formulario y validación. Sin dependencias.

// Texto en metros (se acepta coma o punto) -> centímetros. Vacío = null.
// Devuelve null si los tres campos están vacíos, { error } si están incompletos o no son números,
// o { ancho, largo, alto } en cm.
export function metrosACm(ancho, largo, alto) {
  const campos = [ancho, largo, alto];
  if (campos.every(v => !String(v ?? '').trim())) return null;
  if (campos.some(v => !String(v ?? '').trim())) return { error: 'Para medir el edificio, completá ancho, largo y alto (o dejalos vacíos).' };
  const cm = campos.map(v => Math.round(Number(String(v).trim().replace(',', '.')) * 100));
  if (cm.some(n => !Number.isFinite(n) || n < 1)) return { error: 'Las medidas deben ser números en metros, de 0,01 m o más.' };
  return { ancho: cm[0], largo: cm[1], alto: cm[2] };
}

// Medidas en cm (enteros) -> columnas del lugar. Todas o ninguna.
// Devuelve { error } o { valores: { dim_ancho, dim_largo, dim_alto } }; sin medidas, valores = null.
export function validarMedidas(medidas) {
  if (!medidas) return { valores: null };
  const vals = ['ancho', 'largo', 'alto'].map(k => medidas[k]);
  if (vals.every(v => v == null)) return { valores: null };
  if (vals.some(v => v == null)) return { error: 'Para medir el edificio, indicá ancho, largo y alto.' };
  if (vals.some(v => !Number.isInteger(v) || v < 1 || v > 100000)) return { error: 'Las medidas deben ser de 1 cm o más.' };
  return { valores: { dim_ancho: vals[0], dim_largo: vals[1], dim_alto: vals[2] } };
}

// Origen en la esquina: las posiciones guardadas se miden desde el vértice frontal izquierdo del galpón
// (x crece hacia la derecha, z hacia el fondo). Internamente el recorrido trabaja con x centrado en el ancho.
// anchoCm = 0 (sin medidas) deja la posición como está.
export function aEsquinaCm(xCentroCm, anchoCm) { return Math.round(xCentroCm + (anchoCm || 0) / 2); }
export function desdeEsquinaCm(xEsquinaCm, anchoCm) { return xEsquinaCm - (anchoCm || 0) / 2; }
