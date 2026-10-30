// Vista aérea del recorrido 3D: el galpón visto desde arriba, con las estanterías para arrastrar y girar.
// Recibe el estado de la pantalla (R), la disposición del edificio y cómo desmontar la vista anterior.

import { S, ctx, aviso } from '../estado.js';
import { LARGO, FONDO, huella } from './disposicion.js';
import { limitesDentroDelGalpon, dentroDe } from './ruta.js';
import { materiales, etiqueta } from './escena.js';

// Guarda la posición y el giro de todas las estanterías del edificio.
function guardarDisposicion(disp) {
  for (const [id, d] of disp) {
    const err = ctx.dep.posicionarVista(id, Math.round(d.x * 100), Math.round(d.z * 100), d.giro);
    if (err) return aviso('recorrido', err);
  }
}

// Vista aérea del edificio: las estanterías se arrastran sobre el piso y se giran de a 90°.
export function montarAerea(cont, edificio, { R, disp, desmontar }) {
  S.rec.irA = false;
  const ancho = cont.clientWidth || 800, alto = 520;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(ancho, alto);
  cont.innerHTML = '';
  cont.appendChild(renderer.domElement);

  const escena = new THREE.Scene();
  escena.background = new THREE.Color(0x1e293b);
  const M = materiales();
  escena.add(new THREE.AmbientLight(0xffffff, 0.7));
  const sol = new THREE.DirectionalLight(0xffffff, 0.7);
  sol.position.set(2, 10, 3);
  escena.add(sol);
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x3f4a5c, roughness: 0.95 }));
  piso.rotation.x = -Math.PI / 2;
  escena.add(piso);

  // Galpón con medidas: se dibuja su piso y su contorno, y las estanterías no pueden salirse de él.
  // Origen: centro del frente (x = 0, z = 0); el galpón va hacia el fondo (z negativo). Medidas en metros.
  const g = edificio.dim_ancho && edificio.dim_largo ? { A: edificio.dim_ancho / 100, L: edificio.dim_largo / 100 } : null;
  if (g) {
    // Las que todavía están en la distribución por defecto se acomodan dentro del galpón (no se guarda hasta moverlas).
    for (const d of disp.values()) {
      const lim = limitesDentroDelGalpon(g.A, g.L, huella(d.giro));
      d.x = dentroDe(d.x, lim.x0, lim.x1); d.z = dentroDe(d.z, lim.z0, lim.z1);
    }
    const suelo = new THREE.Mesh(new THREE.PlaneGeometry(g.A, g.L), new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.9 }));
    suelo.rotation.x = -Math.PI / 2; suelo.position.set(0, 0.01, -g.L / 2);
    escena.add(suelo);
    const contorno = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(g.A, g.L)), new THREE.LineBasicMaterial({ color: 0xfacc15 }));
    contorno.rotation.x = -Math.PI / 2; contorno.position.set(0, 0.03, -g.L / 2);
    escena.add(contorno);
  }

  // Encuadre: desde arriba, a una altura que deje ver todo el edificio (y el galpón, si tiene medidas).
  const xs = [...disp.values()].map(d => d.x), zs = [...disp.values()].map(d => d.z);
  if (g) xs.push(-g.A / 2, g.A / 2), zs.push(-g.L, 0);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const extension = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 4) + 4;
  const camara = new THREE.PerspectiveCamera(45, ancho / alto, 0.1, 400);
  camara.position.set(cx, extension / (2 * Math.tan(Math.PI / 8)), cz + 0.001);
  camara.lookAt(cx, 0, cz);

  const grupo = new THREE.Group();
  escena.add(grupo);
  const mallas = new Map(), hits = [];
  for (const [id, d] of disp) {
    const l = ctx.dep.porId(id);
    const elegida = id === S.rec.aereaSel;
    const malla = new THREE.Mesh(new THREE.BoxGeometry(FONDO, 0.25, LARGO),
      new THREE.MeshStandardMaterial({ color: elegida ? 0x2563eb : 0x9aa4b5, roughness: 0.7 }));
    malla.position.set(d.x, 0.125, d.z);
    malla.rotation.y = d.giro * Math.PI / 2;
    malla.userData.rack = id;
    grupo.add(malla);
    mallas.set(id, malla);
    hits.push(malla);
    if (l) {
      const rot = etiqueta(l.codigo);
      rot.scale.multiplyScalar(0.6);
      rot.position.set(d.x, 1.2, d.z);
      grupo.add(rot);
    }
  }

  // Arrastrar una estantería la mueve sobre el piso (ajustada a una grilla de 25 cm).
  const rayo = new THREE.Raycaster();
  const piso0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const enRejilla = e => {
    const r = renderer.domElement.getBoundingClientRect();
    rayo.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camara);
    const p = new THREE.Vector3();
    return rayo.ray.intersectPlane(piso0, p) ? p : null;
  };
  const ajustar = v => Math.round(v / 0.25) * 0.25;
  let arrastre = null;
  const onDown = e => {
    const r = renderer.domElement.getBoundingClientRect();
    rayo.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camara);
    const golpe = rayo.intersectObjects(hits, false)[0];
    if (!golpe) return;
    const id = golpe.object.userData.rack;
    S.rec.aereaSel = id;
    const p = enRejilla(e), d = disp.get(id);
    if (p) arrastre = { id, dx: p.x - d.x, dz: p.z - d.z, movido: false };
  };
  const onMove = e => {
    if (!arrastre) return;
    const p = enRejilla(e); if (!p) return;
    const d = disp.get(arrastre.id);
    let nx = ajustar(p.x - arrastre.dx), nz = ajustar(p.z - arrastre.dz);
    if (g) {   // que la estantería quede dentro del galpón
      const lim = limitesDentroDelGalpon(g.A, g.L, huella(d.giro));
      nx = dentroDe(nx, lim.x0, lim.x1); nz = dentroDe(nz, lim.z0, lim.z1);
    }
    if (nx === d.x && nz === d.z) return;
    d.x = nx; d.z = nz; arrastre.movido = true;
    const malla = mallas.get(arrastre.id);
    malla.position.x = nx; malla.position.z = nz;
  };
  const onUp = () => {
    if (!arrastre) return;
    const { movido } = arrastre;
    arrastre = null;
    if (movido) {
      guardarDisposicion(disp);
      ctx.sincronizar?.();   // el arrastre no pasa por un botón: hay que mandar el cambio al servidor
    }
    ctx.render();   // redibuja (también marca la estantería elegida)
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  R.mot = { renderer, camara, cont, aerea: true, clave: `${edificio.id}|aerea`, raf: 0, w: ancho, h: alto, yaw: 0, pitch: 0,
    limpiar: () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); } };
  const frame = () => {
    if (!cont.isConnected) return desmontar();
    const w = cont.clientWidth, h = cont.clientHeight;
    if (w && h && (w !== R.mot.w || h !== R.mot.h)) {
      R.mot.w = w; R.mot.h = h;
      renderer.setSize(w, h);
      camara.aspect = w / h;
      camara.updateProjectionMatrix();
    }
    renderer.render(escena, camara);
    R.mot.raf = requestAnimationFrame(frame);
  };
  R.mot.raf = requestAnimationFrame(frame);
}
