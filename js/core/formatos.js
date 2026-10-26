// Formatos de código de un nivel y el nivel implícito de los edificios.
// Sin DOM: este archivo se puede probar con Node.

export const FORMATOS = {
  numero:    { txt: 'número (0, 1, 2…)',       ej: '0', norm: c => c,                ok: c => /^\d+$/.test(c) },
  letra:     { txt: 'letra mayúscula (A, B…)', ej: 'A', norm: c => c.toUpperCase(),  ok: c => /^[A-Z]$/.test(c) },
  letra_min: { txt: 'letra minúscula (a, b…)', ej: 'a', norm: c => c.toLowerCase(),  ok: c => /^[a-z]$/.test(c) }
};

// Los edificios son el primer nivel: código numérico y nombre opcional.
export const NIVEL_EDIFICIO = { nombre: 'Edificio', formato: 'numero', nombreOpcional: true };
