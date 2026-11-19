import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as FRAGS from "@thatopen/fragments";

// v03: el equipo se marca en amarillo de señal (guía de estilo); los muros atenuados van en gris uniforme
const SENAL = new THREE.Color("#e2b532");
const GRIS_MURO = new THREE.Color("#c4c8c2");
const RESALTE = {
  color: SENAL,
  renderedFaces: FRAGS.RenderedFaces.TWO,
  opacity: 1,
  transparent: false,
  preserveOriginalMaterial: false,
};
const OPACIDAD = { muros: 0.08, resto: 0.2, contenedor: 0.28 };
// Correcciones del 14/11/2026 (n.° 4): altura de corte por defecto sobre el piso
export const ALTURA_CORTE = 2.2;
const MS_RESALTE = 2200;
const EN_PRUEBA = new URLSearchParams(location.search).has("prueba");
const SIN_MOVIMIENTO = matchMedia("(prefers-reduced-motion: reduce)").matches;
const PR_MAX = Math.min(devicePixelRatio, 2);

// Motor y modelo viven mientras dure la página: volver al 3D desde otra ficha es inmediato
let motor = null;
let modelo = null;
let indice = null;
let inversos = null;
// Un solo renderizador: la geometría subida a la tarjeta gráfica no se puede pasar a otro
let renderer = null;
// v05b: posición de la cámara al cerrar el visor, para pasar de un equipo a otro sin volver a la vista general
let camaraPrevia = null;

async function descargar(url, alProgreso) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No se pudo leer ${url}`);
  const total = Number(r.headers.get("content-length")) || 0;
  if (!r.body || !total) return new Uint8Array(await r.arrayBuffer());
  const lector = r.body.getReader();
  const datos = new Uint8Array(total);
  let n = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    // Con compresión del servidor, el tamaño declarado no coincide: se descarga sin barra
    if (n + value.length > total) return new Uint8Array(await (await fetch(url)).arrayBuffer());
    datos.set(value, n);
    n += value.length;
    alProgreso(n / total);
  }
  return datos.subarray(0, n);
}

async function preparar(alProgreso) {
  if (!indice) {
    const r = await fetch("./modelo/indice_modelo.json");
    if (!r.ok) throw new Error("Falta el índice del modelo");
    indice = await r.json();
    inversos = { bien: new Map(), contenedor: new Map() };
    for (const [c, gs] of Object.entries(indice.bienes)) for (const g of gs) inversos.bien.set(g, c);
    for (const [c, gs] of Object.entries(indice.contenedores)) for (const g of gs) inversos.contenedor.set(g, c);
  }
  if (!motor) motor = new FRAGS.FragmentsModels(new URL("./vendor/worker.mjs", location.href).href);
  if (!modelo) {
    const bytes = await descargar("./modelo/modelo.frag", alProgreso);
    modelo = await motor.load(bytes, { modelId: "labhid" });
  }
}

export function resolverObjetivo(ind, bien, bienesPorCodigo) {
  const propio = ind.bienes[bien.Codigo_LH];
  if (propio?.length) return { guids: propio, tipo: "bien", codigo: bien.Codigo_LH };
  let padre = bien.Equipo_padre;
  for (let i = 0; padre && i < 4; i++) {
    if (ind.bienes[padre]?.length) return { guids: ind.bienes[padre], tipo: "padre", codigo: padre };
    padre = bienesPorCodigo?.get(padre)?.Equipo_padre;
  }
  const cont = ind.contenedores[bien.Contenedor];
  if (cont?.length) return { guids: cont, tipo: "contenedor", codigo: bien.Contenedor };
  return { guids: [], tipo: "ninguno", codigo: null };
}

export async function abrirVisor(caja, bien, bienesPorCodigo, cb) {
  const t0 = performance.now();
  // El 3D chico de una ficha suelta el renderizador
  miniCerrar?.();
  await preparar(cb.alProgreso);
  if (cb.cerrado?.()) return () => {};

  if (!renderer) {
    // Conservar el búfer de dibujo resta fluidez: solo lo usan las pruebas para leer píxeles
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: EN_PRUEBA });
    renderer.setPixelRatio(PR_MAX);
    renderer.domElement.setAttribute("aria-label", "Modelo 3D del laboratorio");
    renderer.domElement.setAttribute("tabindex", "0");
  }
  caja.prepend(renderer.domElement);

  const escena = new THREE.Scene();
  escena.add(new THREE.HemisphereLight(0xffffff, 0xaaa69c, 1.75));
  const sol = new THREE.DirectionalLight(0xffffff, 1.15);
  sol.position.set(12, 30, 18);
  escena.add(sol);
  const relleno = new THREE.DirectionalLight(0xffffff, 0.4);
  relleno.position.set(-14, 10, -20);
  escena.add(relleno);

  const camara = new THREE.PerspectiveCamera(45, 1, 0.03, 800);
  const controles = new OrbitControls(camara, renderer.domElement);
  controles.enableDamping = true;
  controles.dampingFactor = 0.12;
  controles.maxPolarAngle = Math.PI * 0.495;
  controles.screenSpacePanning = false;

  modelo.useCamera(camara);
  escena.add(modelo.object);

  // Dibuja solo cuando algo cambia, para cuidar la batería del celular
  let vivo = true;
  let hastaT = 0;
  let vuelo = null;
  let previo = performance.now();
  let ultimaActividad = performance.now();
  const avisar = (ms = 700) => {
    ultimaActividad = performance.now();
    hastaT = Math.max(hastaT, ultimaActividad + ms);
  };
  const pin = caja.querySelector(".visor-pin");
  const v = new THREE.Vector3();
  let anclaPin = null;
  let moverEtiquetas = null;
  const botonFoco = caja.querySelector('[data-accion="foco"]');

  const moverPin = () => {
    if (!pin) return;
    if (!anclaPin) {
      pin.hidden = true;
      return;
    }
    v.copy(anclaPin).project(camara);
    const { clientWidth: a, clientHeight: h } = caja;
    const x = (v.x * 0.5 + 0.5) * a;
    const y = (-v.y * 0.5 + 0.5) * h;
    pin.hidden = false;
    pin.style.transform = `translate(calc(${Math.min(a - 14, Math.max(14, x))}px - 50%), calc(${Math.min(h - 8, Math.max(46, y))}px - 100%))`;
    const fuera = v.z > 1 || x < 0 || x > a || y < 0 || y > h;
    pin.classList.toggle("fuera", fuera);
    botonFoco?.classList.toggle("atencion", fuera);
  };

  // Calidad adaptable: si un teléfono no llega a unos 25 cuadros/s, baja la resolución al moverse
  // y la recupera apenas la imagen se detiene
  let prMovimiento = PR_MAX;
  let enDescanso = true;
  let tUltimo = 0;
  let sumaT = 0;
  let cuentaT = 0;
  const fijarPR = (pr) => {
    if (renderer.getPixelRatio() !== pr) renderer.setPixelRatio(pr);
  };
  const medirFluidez = (ahora) => {
    if (ahora - tUltimo < 250) {
      sumaT += ahora - tUltimo;
      cuentaT++;
      if (cuentaT >= 24) {
        if (sumaT / cuentaT > 40 && prMovimiento > 0.75) {
          prMovimiento = Math.max(0.75, prMovimiento - 0.5);
          fijarPR(prMovimiento);
          // v03: si el visor pierde fluidez, los paneles dejan el desenfoque y pasan a color sólido
          document.body.classList.add("vidrio-solido");
        }
        sumaT = 0;
        cuentaT = 0;
      }
    }
    tUltimo = ahora;
  };

  // Norte real (v02, prueba): dirección en el visor calculada al integrar el IFC, con el ángulo del modelo de Revit
  const norte = indice.norte?.direccion_visor ? new THREE.Vector3(...indice.norte.direccion_visor).setY(0).normalize() : null;
  const brujula = caja.querySelector(".visor-norte");
  if (brujula) brujula.hidden = !norte;
  const frente = new THREE.Vector3();
  const derecha = new THREE.Vector3();
  const ARRIBA = new THREE.Vector3(0, 1, 0);
  let giroBrujula = null;
  const moverBrujula = () => {
    if (!norte || !brujula) return;
    camara.getWorldDirection(frente);
    // Mirando casi en vertical, el «arriba» de la pantalla lo da el vector up de la cámara
    if (Math.abs(frente.y) > 0.999) frente.copy(camara.up).applyQuaternion(camara.quaternion);
    frente.setY(0).normalize();
    derecha.crossVectors(frente, ARRIBA).normalize();
    const g = Math.round(THREE.MathUtils.radToDeg(Math.atan2(norte.dot(derecha), norte.dot(frente))));
    if (g !== giroBrujula) {
      giroBrujula = g;
      brujula.style.setProperty("--giro", `${g}deg`);
    }
  };

  // v05b: cubo de vistas dentro del anillo de la brújula. Gira con la cámara según los ejes del edificio
  // (no los de la pantalla) y cada cara lleva a su vista
  const cuboCaja = caja.querySelector(".visor-cubo");
  const cubo = cuboCaja?.querySelector(".cubo");
  let ejesCubo = null;
  let giroCubo = "";
  const dirCam = new THREE.Vector3();
  const moverCubo = () => {
    if (!cubo || !ejesCubo) return;
    dirCam.copy(camara.position).sub(controles.target).normalize();
    const th = THREE.MathUtils.radToDeg(Math.atan2(dirCam.dot(ejesCubo.derecha), dirCam.dot(ejesCubo.frente)));
    const ph = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(dirCam.y, -1, 1)));
    const t = `rotateX(${(-ph).toFixed(1)}deg) rotateY(${(-th).toFixed(1)}deg)`;
    if (t !== giroCubo) {
      giroCubo = t;
      cubo.style.transform = t;
    }
  };

  // Menús de la barra (correcciones del 14/11, n.° 3 y 4): «Vista» y «Corte» se abren al pasar el mouse
  // (o al tocar, en celular) y salen pegados al botón, chicos, para no tapar el modelo.
  // Van fuera de la barra porque ella tiene desplazamiento propio y los recortaría
  const menus = { vista: caja.querySelector(".visor-menu-vista"), corte: caja.querySelector(".visor-menu-corte") };
  let menuAbierto = null;
  let cierreMenu = 0;
  const botonDe = (k) => caja.querySelector(`[data-menu="${k}"]`);
  const cerrarMenu = () => {
    clearTimeout(cierreMenu);
    if (!menuAbierto) return;
    menus[menuAbierto].hidden = true;
    botonDe(menuAbierto)?.setAttribute("aria-expanded", "false");
    menuAbierto = null;
  };
  const abrirMenu = (k, enfocar = false) => {
    clearTimeout(cierreMenu);
    const menu = menus[k];
    const boton = botonDe(k);
    if (!menu || !boton) return;
    if (menuAbierto && menuAbierto !== k) cerrarMenu();
    menuAbierto = k;
    menu.hidden = false;
    boton.setAttribute("aria-expanded", "true");
    const rc = caja.getBoundingClientRect();
    const rb = boton.getBoundingClientRect();
    const vertical = rb.left - rc.left > rc.width * 0.6;
    // Barra vertical a la derecha: el menú sale a su izquierda. Barra horizontal abajo: sale encima del botón
    menu.style.left = vertical ? "auto" : `${Math.max(8, Math.min(rb.left - rc.left + rb.width / 2 - menu.offsetWidth / 2, rc.width - menu.offsetWidth - 8))}px`;
    menu.style.right = vertical ? `${rc.right - rb.left + 6}px` : "auto";
    menu.style.top = vertical ? `${Math.max(8, Math.min(rb.top - rc.top + rb.height / 2 - menu.offsetHeight / 2, rc.height - menu.offsetHeight - 8))}px` : "auto";
    menu.style.bottom = vertical ? "auto" : `${rc.bottom - rb.top + 6}px`;
    if (enfocar) menu.querySelector("button, input")?.focus({ preventScroll: true });
  };
  const cerrarLuego = () => {
    clearTimeout(cierreMenu);
    cierreMenu = setTimeout(cerrarMenu, 280);
  };
  const conMouse = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const alEntrar = (e) => {
    if (!conMouse) return;
    const b = e.target.closest?.("[data-menu]");
    if (b) abrirMenu(b.dataset.menu);
    else if (e.target.closest?.(".visor-menu")) clearTimeout(cierreMenu);
  };
  const alSalir = (e) => {
    if (!conMouse) return;
    if (e.target.closest?.("[data-menu], .visor-menu") && !e.relatedTarget?.closest?.("[data-menu], .visor-menu")) cerrarLuego();
  };
  caja.addEventListener("mouseover", alEntrar);
  caja.addEventListener("mouseout", alSalir);

  const dibujar = () => {
    controles.update();
    renderer.render(escena, camara);
    moverPin();
    moverEtiquetas?.();
    moverBrujula();
    moverCubo();
  };
  const bucle = () => {
    if (!vivo) return;
    requestAnimationFrame(bucle);
    const ahora = performance.now();
    const delta = Math.min(0.1, (ahora - previo) / 1000);
    previo = ahora;
    if (vuelo) {
      vuelo.t = Math.min(1, vuelo.t + delta / vuelo.duracion);
      const k = vuelo.t * vuelo.t * (3 - 2 * vuelo.t);
      camara.position.lerpVectors(vuelo.desdePos, vuelo.aPos, k);
      controles.target.lerpVectors(vuelo.desdeObj, vuelo.aObj, k);
      motor.update();
      avisar();
      if (vuelo.t === 1) vuelo = null;
    }
    if (ahora < hastaT) {
      if (enDescanso) {
        enDescanso = false;
        fijarPR(prMovimiento);
      }
      medirFluidez(ahora);
      dibujar();
    } else if (!enDescanso) {
      enDescanso = true;
      fijarPR(PR_MAX);
      dibujar();
    }
  };

  let tocado = false;
  controles.addEventListener("start", () => {
    tocado = true;
    vuelo = null;
  });
  controles.addEventListener("change", () => {
    motor.update();
    avisar();
  });
  // El motor puede terminar de cargar geometría sin que la cámara se mueva, pero solo poco
  // después de un cambio: pasado ese tiempo no se dibuja nada y se cuida la batería
  const refresco = setInterval(() => {
    const ahora = performance.now();
    if (document.visibilityState === "visible" && ahora - ultimaActividad < 8000) hastaT = Math.max(hastaT, ahora + 250);
  }, 1500);

  const redimensionar = () => {
    const { clientWidth: a, clientHeight: h } = caja;
    if (!a || !h) return;
    renderer.setSize(a, h);
    camara.aspect = a / h;
    camara.updateProjectionMatrix();
    motor.update();
    avisar();
  };
  const observador = new ResizeObserver(redimensionar);
  observador.observe(caja);
  redimensionar();

  await modelo.resetHighlight();
  await modelo.resetOpacity(undefined);
  await modelo.resetVisible();

  const ids = async (guids) => (await modelo.getLocalIdsByGuids(guids)).filter((x) => x !== null);
  const idsOcultar = await ids(indice.ocultar ?? []);
  if (idsOcultar.length) await modelo.setVisible(idsOcultar, false);
  const idsEntorno = await ids(indice.entorno ?? []);
  const visibles = await ids([...inversos.bien.keys(), ...inversos.contenedor.keys(), ...(indice.entorno ?? []), ...(indice.piso ?? []), ...(indice.otros ?? [])]);
  // v05: con el modelo v06 (veredas y volado) el encuadre se hace con el edificio; si el índice no lo trae, con todo
  const idsEncuadre = indice.encuadre?.length ? await ids(indice.encuadre) : [];
  const cajaTotal = await modelo.getMergedBox(idsEncuadre.length ? idsEncuadre : visibles);
  const centroTotal = cajaTotal.getCenter(new THREE.Vector3());
  const diagonal = cajaTotal.getSize(new THREE.Vector3()).length();
  controles.maxDistance = diagonal * 2.2;
  controles.minDistance = 0.15;

  // Corte horizontal (v02, prueba): plano a corte.altura_m sobre la cara superior del piso del local
  renderer.clippingPlanes = [];
  let cortado = false;
  let planoCorte = null;
  let yPiso = cajaTotal.min.y;
  if (indice.corte) {
    const idsPiso = await ids(indice.corte.piso_base ?? []);
    if (idsPiso.length) yPiso = (await modelo.getMergedBox(idsPiso)).max.y;
    planoCorte = new THREE.Plane(new THREE.Vector3(0, -1, 0), yPiso + ALTURA_CORTE);
  }
  let estructuraColor = false;

  const lado = Math.max(4, Math.ceil(diagonal * 1.6));
  const suelo = new THREE.GridHelper(lado, lado, 0x9aa5b1, 0xd5dae0);
  suelo.position.set(centroTotal.x, cajaTotal.min.y - 0.02, centroTotal.z);
  suelo.material.transparent = true;
  suelo.material.opacity = 0.35;
  escena.add(suelo);

  const distanciaPara = (b) => {
    const r = Math.max(b.getSize(new THREE.Vector3()).length() / 2, 0.05);
    const vert = THREE.MathUtils.degToRad(camara.fov / 2);
    const horiz = Math.atan(Math.tan(vert) * camara.aspect);
    return r / Math.sin(Math.min(vert, horiz));
  };
  const volar = (centro, dist, dir, duracion = 1.2) => {
    vuelo = {
      t: 0,
      duracion: SIN_MOVIMIENTO ? 0.01 : duracion,
      desdePos: camara.position.clone(),
      aPos: centro.clone().addScaledVector(dir.clone().normalize(), dist),
      desdeObj: controles.target.clone(),
      aObj: centro.clone(),
    };
    avisar();
  };
  const esquinas = (b) => {
    const r = [];
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) r.push(new THREE.Vector3(x, y, z));
    return r;
  };

  // v05b: en el visor el local está girado unos 41° (norte del sitio). La caja alineada a la pantalla salía
  // mucho más grande que el local y el isométrico quedaba lejos. Los ejes propios del edificio salen de las
  // columnas (el rectángulo de menor área que las contiene) y el frente es el lado del muro cortina
  const edificio = await (async () => {
    const cols = await ids(indice.columnas ?? []);
    const centros = [];
    for (const id of cols) centros.push((await modelo.getMergedBox([id])).getCenter(new THREE.Vector3()));
    let A = new THREE.Vector3(1, 0, 0);
    let B = new THREE.Vector3(0, 0, 1);
    let lim = null;
    if (centros.length >= 3) {
      for (let g = 0; g < 90; g += 0.25) {
        const a = THREE.MathUtils.degToRad(g);
        const ea = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const eb = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
        const l = [Infinity, -Infinity, Infinity, -Infinity];
        for (const p of centros) {
          const u = p.dot(ea);
          const w = p.dot(eb);
          l[0] = Math.min(l[0], u);
          l[1] = Math.max(l[1], u);
          l[2] = Math.min(l[2], w);
          l[3] = Math.max(l[3], w);
        }
        const area = (l[1] - l[0]) * (l[3] - l[2]);
        if (!lim || area < lim.area - 1e-6) lim = { area, l, ea, eb };
      }
      A = lim.ea;
      B = lim.eb;
    }
    // Sin columnas, el rectángulo es la caja del edificio alineada a la pantalla
    const l = lim ? lim.l : [cajaTotal.min.x, cajaTotal.max.x, cajaTotal.min.z, cajaTotal.max.z];
    const borde = lim ? 0.3 : 0; // media columna y el espesor del muro por fuera del eje
    const hA = (l[1] - l[0]) / 2 + borde;
    const hB = (l[3] - l[2]) / 2 + borde;
    const centro = A.clone().multiplyScalar((l[0] + l[1]) / 2).addScaledVector(B, (l[2] + l[3]) / 2).setY((cajaTotal.min.y + cajaTotal.max.y) / 2);
    const puntos = [];
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) for (const y of [cajaTotal.min.y, cajaTotal.max.y]) puntos.push(centro.clone().addScaledVector(A, sa * hA).addScaledVector(B, sb * hB).setY(y));
    let frente = B.clone();
    const idsFachada = await ids(indice.fachada ?? []);
    if (idsFachada.length) {
      const f = (await modelo.getMergedBox(idsFachada)).getCenter(new THREE.Vector3()).sub(centro).setY(0);
      const ua = f.dot(A) / hA;
      const ub = f.dot(B) / hB;
      frente = Math.abs(ua) > Math.abs(ub) ? A.clone().multiplyScalar(Math.sign(ua)) : B.clone().multiplyScalar(Math.sign(ub));
    }
    // Derecha de quien mira la fachada frontal desde afuera
    const derecha = new THREE.Vector3().crossVectors(frente.clone().negate(), ARRIBA).normalize();
    return { centro, puntos, frente, derecha, largo: 2 * hA, ancho: 2 * hB, conColumnas: !!lim };
  })();

  // v05b: parte del visor que no tapan los paneles (zonas, cabecera, barra y hoja), en coordenadas de pantalla
  // de -1 a 1. Antes el encuadre usaba márgenes fijos y el edificio quedaba chico y descentrado
  const zonaLibre = () => {
    const rc = caja.getBoundingClientRect();
    if (!rc.width || !rc.height) return { x0: -0.96, x1: 0.96, y0: -0.72, y1: 0.9 };
    let [izq, der, arr, aba] = [rc.left + 10, rc.right - 10, rc.top + 10, rc.bottom - 10];
    const ve = (el) => el && !el.hidden && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0;
    const zonas = document.getElementById("visor-zonas");
    if (ve(zonas)) {
      const r = zonas.getBoundingClientRect();
      if (r.right < rc.left + rc.width * 0.45) izq = Math.max(izq, r.right + 10);
    }
    const cabeza = document.querySelector(".visor-cabeza");
    if (ve(cabeza)) {
      const r = cabeza.getBoundingClientRect();
      if (r.width > rc.width * 0.5) arr = Math.max(arr, r.bottom + 10);
    }
    const barra = caja.querySelector(".visor-barra");
    if (ve(barra)) {
      const r = barra.getBoundingClientRect();
      if (r.width > r.height) aba = Math.min(aba, r.top - 10);
      else der = Math.min(der, r.left - 10);
    }
    const hojaEq = document.getElementById("visor-hoja");
    if (ve(hojaEq)) {
      const r = hojaEq.getBoundingClientRect();
      if (r.width > rc.width * 0.6 && r.top > rc.top + rc.height * 0.4) aba = Math.min(aba, r.top - 10);
    }
    // Si los paneles dejan muy poco, se usa todo el visor
    if (der - izq < rc.width * 0.35) [izq, der] = [rc.left + 10, rc.right - 10];
    if (aba - arr < rc.height * 0.35) [arr, aba] = [rc.top + 10, rc.bottom - 10];
    const nx = (px) => ((px - rc.left) / rc.width) * 2 - 1;
    const ny = (py) => -(((py - rc.top) / rc.height) * 2 - 1);
    return { x0: nx(izq), x1: nx(der), y0: ny(aba), y1: ny(arr) };
  };

  // Distancia y punto de mira para que los puntos llenen la zona libre, centrados en ella
  const ajustar = (centro, puntos, dir, margen = 1.05) => {
    const z = zonaLibre();
    const d = dir.clone().normalize();
    const aux = camara.clone();
    const q = new THREE.Vector3();
    const medir = (m) => {
      aux.position.copy(centro).addScaledVector(d, m);
      aux.lookAt(centro);
      aux.updateMatrixWorld();
      const a = [Infinity, -Infinity, Infinity, -Infinity];
      let detras = false;
      for (const p of puntos) {
        q.copy(p).project(aux);
        if (q.z > 1) detras = true;
        a[0] = Math.min(a[0], q.x);
        a[1] = Math.max(a[1], q.x);
        a[2] = Math.min(a[2], q.y);
        a[3] = Math.max(a[3], q.y);
      }
      return { a, detras };
    };
    const radio = Math.max(0.05, ...puntos.map((p) => p.distanceTo(centro)));
    let lo = radio * 0.2;
    let hi = radio * 40;
    for (let i = 0; i < 22; i++) {
      const m = (lo + hi) / 2;
      const { a, detras } = medir(m);
      if (!detras && a[1] - a[0] <= z.x1 - z.x0 && a[3] - a[2] <= z.y1 - z.y0) hi = m;
      else lo = m;
    }
    const dist = hi * margen;
    const { a } = medir(dist);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camara.fov / 2));
    const sx = (a[0] + a[1]) / 2 - (z.x0 + z.x1) / 2;
    const sy = (a[2] + a[3]) / 2 - (z.y0 + z.y1) / 2;
    const objetivo = centro.clone()
      .addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(aux.quaternion), sx * dist * tanV * camara.aspect)
      .addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(aux.quaternion), sy * dist * tanV);
    return { objetivo, dist };
  };
  const volarA = (centro, puntos, dir, dur, margen) => {
    const r = ajustar(centro, puntos, dir, margen);
    volar(r.objetivo, r.dist, dir, dur);
  };
  const volarEdificio = (dir, dur) => volarA(edificio.centro, edificio.puntos, dir, dur);
  ejesCubo = edificio;
  if (cuboCaja) cuboCaja.hidden = false;

  // v02: la vista general mira hacia los equipos desde el interior del local, para que los muros no los tapen
  const guidsBienes = Object.values(indice.bienes).flat();
  const cajaBienes = guidsBienes.length ? await modelo.getMergedBox(await ids(guidsBienes)) : null;
  const haciaDentro = cajaBienes ? edificio.centro.clone().sub(cajaBienes.getCenter(new THREE.Vector3())).setY(0) : null;
  // Correcciones del 14/11 (n.° 2): «General» y «Ver mapa 3D» abren un isométrico cercano desde afuera, desde la esquina
  // del edificio que mira hacia los equipos (el techo va oculto, así se ve el interior)
  const dirGeneral = (() => {
    const ref = haciaDentro && haciaDentro.length() > 0.5 && !indice.simulado ? haciaDentro.clone().normalize() : edificio.frente.clone().add(edificio.derecha);
    let mejor = null;
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
      const h = edificio.frente.clone().multiplyScalar(sa).add(edificio.derecha.clone().multiplyScalar(sb)).normalize();
      if (!mejor || h.dot(ref) > mejor.dot(ref)) mejor = h;
    }
    return mejor.setY(0.72);
  })();
  const vistaGeneral = (dur) => volarEdificio(dirGeneral, dur);

  // v05b: vistas del edificio (pedido de Diego del 15/11): frontal, posterior, laterales, isométrico y planta
  const ELEVACION = 0.14; // unos 8°: mirar casi horizontal sin que el control de órbita lo impida
  const dirVista = (nombre) => {
    const { frente, derecha } = edificio;
    const h = {
      frontal: frente,
      posterior: frente.clone().negate(),
      izquierda: derecha.clone().negate(),
      derecha,
      isometrico: frente.clone().add(derecha).normalize(),
    }[nombre];
    if (!h) return null;
    // El isométrico mira desde unos 35° de altura, como en Revit
    return h.clone().setY(nombre === "isometrico" ? 0.72 : ELEVACION);
  };

  // v05b: si se llega desde otro equipo del mismo visor, la cámara sigue desde donde estaba
  const sigue = camaraPrevia && performance.now() - camaraPrevia.t < 5000;
  if (sigue) {
    camara.position.copy(camaraPrevia.pos);
    controles.target.copy(camaraPrevia.obj);
  } else {
    const r0 = ajustar(edificio.centro, edificio.puntos, dirGeneral);
    camara.position.copy(r0.objetivo).addScaledVector(dirGeneral.clone().normalize(), r0.dist);
    controles.target.copy(r0.objetivo);
  }
  camaraPrevia = null;
  controles.update();
  await motor.update(true);
  avisar(1500);
  bucle();

  // Marca del bien
  const objetivo = bien ? resolverObjetivo(indice, bien, bienesPorCodigo) : { guids: [], tipo: "mapa", codigo: null };
  let cajaFoco = null;
  let contexto = null;
  let mostrarMuros = true;
  let idsFoco = [];
  let idsCont = [];
  let halo = null;
  let marco = null;
  let marcoOscuro = null;
  let aislado = false;
  let seleccionActual = null;

  // v03: un muro con capas, al transparentarse, dejaba ver el ladrillo y se veía rosado.
  // Se atenúa con un solo material gris; el modelo no cambia
  const atenuarMuros = async (op) => {
    if (!idsEntorno.length) return;
    await modelo.highlight(idsEntorno, { color: GRIS_MURO, renderedFaces: FRAGS.RenderedFaces.TWO, opacity: op, transparent: true, preserveOriginalMaterial: false });
  };
  const aplicarAtenuado = async () => {
    if (objetivo.tipo === "mapa" || objetivo.tipo === "ninguno") {
      await modelo.resetOpacity(visibles);
      if (estructuraColor) await modelo.resetHighlight(idsEntorno);
      else await atenuarMuros(indice.simulado ? 0.28 : 0.18);
      return;
    }
    await modelo.setOpacity(visibles, OPACIDAD.resto);
    if (estructuraColor) {
      // La estructura con sus materiales; el equipo buscado sigue marcado y lo demás, atenuado
      await modelo.resetHighlight(idsEntorno);
      await modelo.resetOpacity(idsEntorno);
    } else await atenuarMuros(OPACIDAD.muros);
    if (idsCont.length) await modelo.setOpacity(idsCont, OPACIDAD.contenedor);
    await modelo.resetOpacity(idsFoco);
  };

  let cajasBienes = null;
  const cargarCajas = async () => {
    if (!cajasBienes) {
      cajasBienes = [];
      for (const [codigo, gs] of Object.entries(indice.bienes)) cajasBienes.push({ codigo, caja: await modelo.getMergedBox(await ids(gs)) });
    }
    return cajasBienes;
  };

  // Elige el ángulo desde el que ningún otro bien tapa al buscado, mirando desde el interior del local
  const mejorDireccion = async (c, dist) => {
    const cajas = await cargarCajas();
    const alCentro = centroTotal.clone().sub(c).setY(0).normalize();
    const rayoLibre = new THREE.Ray();
    let mejor = null;
    let puntaje = -Infinity;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), 0.7, Math.sin(a)).normalize();
      const pos = c.clone().addScaledVector(dir, dist);
      rayoLibre.set(c, dir);
      let tapan = 0;
      for (const x of cajas) {
        if (x.codigo === objetivo.codigo || x.caja.containsPoint(c)) continue;
        const p = rayoLibre.intersectBox(x.caja, new THREE.Vector3());
        if (p && p.distanceTo(c) < dist) tapan++;
      }
      // Con el modelo real (girado al norte), la caja del modelo no sirve para saber si la cámara queda dentro:
      // se prioriza mirar desde el centro del local, para que los muros no tapen el equipo
      const dentro = !indice.simulado ? 0 : cajaTotal.containsPoint(pos.clone().setY(cajaTotal.min.y + 0.01)) ? 0.6 : 0;
      const pesoCentro = indice.simulado ? 1 : 2.5;
      const valor = dentro + pesoCentro * dir.clone().setY(0).normalize().dot(alCentro) - tapan * 3;
      if (valor > puntaje) {
        puntaje = valor;
        mejor = dir;
      }
    }
    return mejor;
  };

  const irAlFoco = async (dur) => {
    if (!cajaFoco) return vistaGeneral(dur);
    const c = cajaFoco.getCenter(new THREE.Vector3());
    const lejosInicial = Math.min(Math.max(distanciaPara(cajaFoco) * 1.9, 1.3), Math.max(distanciaPara(contexto) * 1.05, distanciaPara(cajaFoco) * 1.9));
    const dir = await mejorDireccion(c, lejosInicial);
    const lejos = distanciaPara(cajaFoco) * 1.9;
    volar(c, Math.min(Math.max(lejos, 1.3), Math.max(distanciaPara(contexto) * 1.05, lejos)), dir, dur);
  };

  if (objetivo.tipo === "mapa" || objetivo.tipo === "ninguno") {
    await aplicarAtenuado();
  } else {
    idsFoco = await ids(objetivo.guids);
    const contBien = objetivo.tipo === "contenedor" ? null : bienesPorCodigo?.get(objetivo.codigo)?.Contenedor;
    idsCont = contBien && indice.contenedores[contBien] && contBien !== "SALA-NAVE" ? await ids(indice.contenedores[contBien]) : [];
    await aplicarAtenuado();
    await modelo.highlight(idsFoco, RESALTE);
    cajaFoco = await modelo.getMergedBox(idsFoco);
    contexto = cajaFoco.clone();
    if (idsCont.length) contexto.union(await modelo.getMergedBox(idsCont));
    else contexto.expandByScalar(Math.max(0.4, diagonal * 0.03));
    marco = new THREE.Box3Helper(cajaFoco.clone().expandByScalar(0.012), SENAL);
    marco.material.depthTest = false;
    marco.material.transparent = true;
    marco.renderOrder = 10;
    escena.add(marco);
    // v03: el amarillo sobre el gris del visor contrasta poco (1,2:1); una línea oscura por fuera lo separa
    marcoOscuro = new THREE.Box3Helper(cajaFoco.clone().expandByScalar(0.024), 0x2b2205);
    marcoOscuro.material.depthTest = false;
    marcoOscuro.material.transparent = true;
    marcoOscuro.renderOrder = 10;
    escena.add(marcoOscuro);
    const tamFoco = cajaFoco.getSize(new THREE.Vector3()).addScalar(0.03);
    halo = new THREE.Mesh(
      new THREE.BoxGeometry(tamFoco.x, tamFoco.y, tamFoco.z),
      new THREE.MeshBasicMaterial({ color: SENAL, transparent: true, opacity: 0.16, depthWrite: false, depthTest: false }),
    );
    halo.position.copy(cajaFoco.getCenter(new THREE.Vector3()));
    halo.renderOrder = 9;
    escena.add(halo);
    anclaPin = cajaFoco.getCenter(new THREE.Vector3()).setY(cajaFoco.max.y);
    await motor.update(true);
    // Primero se ve el local entero y luego se llega al bien: así se entiende dónde está
    await cargarCajas();
    // Si se llegó desde otro equipo, se vuela directo sin la pausa en la vista general
    // Si la persona ya movió la cámara o eligió una vista, no se le quita el control
    setTimeout(() => vivo && !aislado && !tocado && irAlFoco(sigue ? 1 : 1.5), SIN_MOVIMIENTO || sigue ? 0 : 350);
    // Pasado el resalte, el equipo recupera sus colores y el marco lo sigue indicando
    setTimeout(async () => {
      if (!vivo || aislado) return;
      await modelo.resetHighlight(idsFoco);
      await motor.update(true);
      avisar();
    }, MS_RESALTE);
  }
  avisar(1200);

  // Etiquetas deducidas de la ubicación de los bienes: sirven igual con el modelo real
  const etiquetas = [];
  const crearEtiqueta = (texto, punto, clase) => {
    const el = document.createElement("span");
    el.className = clase;
    el.textContent = texto;
    el.hidden = true;
    caja.append(el);
    etiquetas.push({ el, punto, a: 0 });
  };
  if (bienesPorCodigo) {
    const nombres = new Map();
    for (const x of bienesPorCodigo.values()) {
      if (x.Contenedor && x.Contenedor !== "Pendiente" && !nombres.has(x.Contenedor)) {
        nombres.set(x.Contenedor, (x.Ubicacion_texto ?? "").split("(")[0].split(" - ").pop().trim());
      }
    }
    if (objetivo.tipo === "mapa") {
      const grupos = new Map();
      for (const { codigo, caja: cb2 } of await cargarCajas()) {
        const nombre = (bienesPorCodigo.get(codigo)?.Ubicacion_texto ?? "").split(" - ")[0].split("(")[0].trim();
        if (!nombre || nombre === "Pendiente") continue;
        if (!grupos.has(nombre)) grupos.set(nombre, new THREE.Box3());
        grupos.get(nombre).union(cb2);
      }
      for (const [nombre, b] of grupos) crearEtiqueta(nombre, b.getCenter(new THREE.Vector3()).setY(b.max.y + 0.5), "visor-zona");
    }
    for (const [cod, gs] of Object.entries(indice.contenedores)) {
      if (cod.startsWith("SALA") || !nombres.has(cod)) continue;
      const b = await modelo.getMergedBox(await ids(gs));
      crearEtiqueta(nombres.get(cod), b.getCenter(new THREE.Vector3()).setY(b.max.y + 0.08), "visor-zona mueble");
    }
    // Se muestran por orden de importancia y se oculta la que se encime con otra
    moverEtiquetas = () => {
      const { clientWidth: a, clientHeight: h } = caja;
      const ocupado = [];
      if (pin && !pin.hidden) {
        const r = pin.getBoundingClientRect();
        const rc = caja.getBoundingClientRect();
        ocupado.push([r.left - rc.left, r.top - rc.top, r.right - rc.left, r.bottom - rc.top]);
      }
      for (const t of etiquetas) {
        v.copy(t.punto).project(camara);
        const x = (v.x * 0.5 + 0.5) * a;
        const y = (-v.y * 0.5 + 0.5) * h;
        if (t.el.hidden) t.el.hidden = false;
        t.a = t.el.offsetWidth || t.a;
        const q = [x - t.a / 2 - 3, y - 13, x + t.a / 2 + 3, y + 13];
        const choca = v.z > 1 || q[0] < 0 || q[2] > a || q[1] < 0 || q[3] > h - 70 || ocupado.some((o) => q[0] < o[2] && q[2] > o[0] && q[1] < o[3] && q[3] > o[1]);
        t.el.hidden = choca;
        if (!choca) {
          ocupado.push(q);
          t.el.style.transform = `translate(calc(${x}px - 50%), calc(${y}px - 50%))`;
        }
      }
    };
    avisar();
  }

  // Corte a una altura sobre el piso (null lo quita). Correcciones del 14/11 (n.° 4)
  const fijarCorte = async (h) => {
    if (!planoCorte) return;
    cortado = h != null;
    if (cortado) planoCorte.constant = yPiso + h;
    renderer.clippingPlanes = cortado ? [planoCorte] : [];
    botonDe("corte")?.setAttribute("aria-pressed", String(cortado));
    const quitar = menus.corte?.querySelector('[data-corte="quitar"]');
    if (quitar) quitar.hidden = !cortado;
    const estado = menus.corte?.querySelector(".menu-estado");
    if (estado) estado.textContent = cortado ? `Cortado a ${h.toLocaleString("es-PE")} m del piso` : "Sin corte";
    // Al cortar, la cámara baja para ver lo que queda sobre las mesadas; sin corte, vuelve a la vista de siempre
    if (!aislado) {
      if (cajaFoco) irAlFoco(0.8);
      else if (cortado) {
        // Se encuadran los equipos y muebles con código, mirando desde el centro del local
        const b = (cajaBienes ?? cajaTotal).clone();
        for (const gs of Object.values(indice.contenedores)) {
          if (gs.length) b.union(await modelo.getMergedBox(await ids(gs)));
        }
        b.expandByScalar(0.6);
        b.max.y = Math.min(b.max.y, planoCorte.constant);
        const dir = dirGeneral.clone().setY(0).normalize().multiplyScalar(0.85).add(new THREE.Vector3(0, 0.8, 0));
        volarA(b.getCenter(new THREE.Vector3()), esquinas(b), dir, 0.8);
      } else vistaGeneral(0.8);
    }
    await motor.update(true);
    avisar(1200);
  };

  // Controles en pantalla
  const acciones = {
    foco: () => irAlFoco(0.9),
    general: () => vistaGeneral(0.9),
    planta: () => {
      const c = cajaFoco ? cajaFoco.getCenter(new THREE.Vector3()) : edificio.centro;
      // v05b: como en los planos de Revit, la planta va alineada al edificio con la fachada frontal abajo
      // (la cámara queda apenas hacia el frente); la brújula sigue marcando el norte real
      const arriba = new THREE.Vector3(0, 1, 0).addScaledVector(edificio.frente, 0.002);
      if (cajaFoco) volar(c, Math.max(distanciaPara(contexto) * 1.6, 5), arriba, 0.9);
      else volarEdificio(arriba, 0.9);
    },
    vista: (nombre) => {
      tocado = true;
      cerrarMenu();
      if (nombre === "general") return vistaGeneral(0.9);
      if (nombre === "planta") return acciones.planta();
      const dir = dirVista(nombre);
      if (dir) volarEdificio(dir, 0.9);
    },
    muros: async (boton) => {
      mostrarMuros = !mostrarMuros;
      if (idsEntorno.length && !aislado) await modelo.setVisible(idsEntorno, mostrarMuros);
      boton?.setAttribute("aria-pressed", String(!mostrarMuros));
      await motor.update(true);
      avisar();
    },
    // Para las pruebas y el teclado: alterna el corte a la altura por defecto
    corte: () => fijarCorte(cortado ? null : ALTURA_CORTE),
    // Correcciones del 14/11 (n.° 5): estructura con sus colores reales o transparente
    colores: async (boton) => {
      estructuraColor = !estructuraColor;
      boton?.setAttribute("aria-checked", String(estructuraColor));
      await aplicarAtenuado();
      await motor.update(true);
      avisar(900);
    },
    aislar: async (boton) => {
      const guids = seleccionActual ?? objetivo.guids;
      if (!guids?.length) return;
      aislado = !aislado;
      const sel = await ids(guids);
      boton?.setAttribute("aria-pressed", String(aislado));
      if (aislado) {
        await modelo.setVisible(visibles, false);
        await modelo.setVisible(sel, true);
        await modelo.resetOpacity(sel);
        await modelo.resetHighlight(sel);
        if (marco) marco.visible = false;
        if (marcoOscuro) marcoOscuro.visible = false;
        if (halo) halo.visible = false;
        seleccion.visible = false;
        suelo.visible = false;
        const b = await modelo.getMergedBox(sel);
        const dir = camara.position.clone().sub(controles.target);
        volarA(b.getCenter(new THREE.Vector3()), esquinas(b), dir, 0.7, 1.15);
      } else {
        await modelo.setVisible(visibles, true);
        if (idsOcultar.length) await modelo.setVisible(idsOcultar, false);
        if (!mostrarMuros && idsEntorno.length) await modelo.setVisible(idsEntorno, false);
        await aplicarAtenuado();
        if (marco) marco.visible = true;
        if (marcoOscuro) marcoOscuro.visible = true;
        if (halo) halo.visible = true;
        suelo.visible = true;
        if (cajaFoco) irAlFoco(0.7);
        else vistaGeneral(0.7);
      }
      await motor.update(true);
      avisar(1200);
    },
    pantalla: async () => {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await caja.requestFullscreen?.().catch(() => {});
    },
  };
  const alBoton = (e) => {
    const v = e.target.closest("[data-vista]");
    if (v) return acciones.vista(v.dataset.vista);
    const m = e.target.closest("[data-menu]");
    // Tocar el botón solo abre o cierra su menú: no aplica nada
    if (m) return menuAbierto === m.dataset.menu ? cerrarMenu() : abrirMenu(m.dataset.menu, !conMouse);
    const c = e.target.closest("[data-corte]");
    if (c) {
      const t = c.dataset.corte;
      const campo = menus.corte?.querySelector("input");
      if (t === "defecto") {
        if (campo) campo.value = String(ALTURA_CORTE);
        fijarCorte(ALTURA_CORTE);
      } else if (t === "quitar") fijarCorte(null);
      else {
        const h = Number(String(campo?.value ?? "").replace(",", "."));
        if (!Number.isFinite(h) || h < 0.3 || h > 8) {
          campo?.setCustomValidity("Escribe una altura entre 0,3 y 8 m");
          campo?.reportValidity();
          return;
        }
        campo.setCustomValidity("");
        fijarCorte(h);
      }
      return cerrarMenu();
    }
    if (e.target.closest(".visor-menu")) return;
    const b = e.target.closest("[data-accion]");
    if (b) acciones[b.dataset.accion]?.(b);
    else cerrarMenu();
  };
  caja.addEventListener("click", alBoton);
  const alTeclaMenu = (e) => {
    if (e.key === "Enter" && e.target.matches?.(".visor-menu-corte input")) {
      e.preventDefault();
      menus.corte.querySelector('[data-corte="aplicar"]')?.click();
    }
  };
  caja.addEventListener("keydown", alTeclaMenu);

  // Tocar un elemento: se identifica por el mismo índice que une modelo y datos
  let abajo = null;
  let ultimoToque = 0;
  const seleccion = new THREE.Box3Helper(new THREE.Box3(), 0x2457c5);
  seleccion.visible = false;
  seleccion.material.depthTest = false;
  seleccion.material.transparent = true;
  escena.add(seleccion);

  const rayo = new THREE.Raycaster();
  const bienEnRayo = async (e) => {
    const cajas = await cargarCajas();
    const r = renderer.domElement.getBoundingClientRect();
    rayo.setFromCamera(new THREE.Vector2(((e.clientX - r.x) / r.width) * 2 - 1, -((e.clientY - r.y) / r.height) * 2 + 1), camara);
    let mejor = null;
    let dist = Infinity;
    let dObjetivo = Infinity;
    for (const c of cajas) {
      const punto = rayo.ray.intersectBox(c.caja, new THREE.Vector3());
      if (!punto) continue;
      const d = punto.distanceTo(camara.position);
      if (c.codigo === objetivo.codigo) dObjetivo = d;
      if (d < dist) {
        dist = d;
        mejor = c.codigo;
      }
    }
    // Correcciones del 14/11 (n.° 1): antes el bien buscado ganaba siempre que el rayo cruzara su caja, aunque
    // estuviera detrás, y no se podía elegir el equipo de al lado. Ahora gana el más cercano; el buscado solo
    // conserva prioridad si está casi a la misma distancia (lo atenuado delante no lo tapa)
    if (dObjetivo < Infinity && dObjetivo - dist < 0.25) return { codigo: objetivo.codigo, d: dObjetivo };
    return mejor ? { codigo: mejor, d: dist } : null;
  };

  const quitarSeleccion = () => {
    seleccion.visible = false;
    seleccionActual = null;
    actualizarAislar();
    cb.alTocar(null);
    avisar();
  };
  const actualizarAislar = () => {
    const b = caja.querySelector('[data-accion="aislar"]');
    if (b) b.disabled = !aislado && !(seleccionActual ?? objetivo.guids)?.length;
  };
  actualizarAislar();

  const alBajar = (e) => {
    abajo = { x: e.clientX, y: e.clientY };
  };
  const alSubir = async (e) => {
    if (!abajo || Math.hypot(e.clientX - abajo.x, e.clientY - abajo.y) > 7 || aislado) return;
    const doble = performance.now() - ultimoToque < 320;
    ultimoToque = performance.now();
    const r = await modelo.raycast({ camera: camara, mouse: new THREE.Vector2(e.clientX, e.clientY), dom: renderer.domElement });
    if (doble && r) {
      const c = r.point.clone();
      volar(c, Math.max(camara.position.distanceTo(c) * 0.55, 0.6), camara.position.clone().sub(c), 0.6);
      return;
    }
    const [guid] = r ? await modelo.getGuidsByLocalIds([r.localId]) : [null];
    const cont = inversos.contenedor.get(guid);
    const enRayo = await bienEnRayo(e);
    // Si se tocó un mueble, solo gana un bien que esté justo ahí, no uno lejano en la misma línea
    const codigo = (enRayo && (!cont || enRayo.d - r.distance < 0.35) ? enRayo.codigo : null) ?? inversos.bien.get(guid);
    // v05b: tocar un espacio vacío ya no suelta el equipo; se cierra con la X de la hoja o con Esc
    if (!codigo && !cont) return;
    const lista = codigo ? indice.bienes[codigo] : indice.contenedores[cont];
    seleccion.box.copy(await modelo.getMergedBox(await ids(lista))).expandByScalar(0.01);
    seleccion.visible = true;
    seleccionActual = lista;
    actualizarAislar();
    ultimaSeleccion = codigo ? { tipo: "bien", codigo } : { tipo: "contenedor", codigo: cont };
    cb.alTocar(ultimaSeleccion);
    avisar();
  };
  let ultimaSeleccion = null;

  // Teclado en computadora: flechas para girar, + y - para acercar, Esc para soltar la selección
  const alTecla = (e) => {
    if (e.target.matches?.("input, textarea")) return;
    const giro = { ArrowLeft: -0.14, ArrowRight: 0.14 }[e.key];
    const alto = { ArrowUp: -0.1, ArrowDown: 0.1 }[e.key];
    const zoom = { "+": 0.85, "=": 0.85, "-": 1.18 }[e.key];
    if (e.key === "Escape") {
      if (menuAbierto) return cerrarMenu();
      return quitarSeleccion();
    }
    if (giro === undefined && alto === undefined && zoom === undefined) return;
    e.preventDefault();
    vuelo = null;
    const o = camara.position.clone().sub(controles.target);
    if (giro) o.applyAxisAngle(new THREE.Vector3(0, 1, 0), giro);
    if (alto) {
      const q = new THREE.Spherical().setFromVector3(o);
      q.phi = THREE.MathUtils.clamp(q.phi + alto, 0.05, controles.maxPolarAngle);
      o.setFromSpherical(q);
    }
    if (zoom) o.multiplyScalar(zoom);
    camara.position.copy(controles.target).add(o);
    motor.update();
    avisar();
  };
  document.addEventListener("keydown", alTecla);

  // Si el teléfono retira la memoria gráfica, se explica y se ofrece volver a cargar
  const alPerderContexto = (e) => {
    e.preventDefault();
    cb.alFallo?.();
  };
  renderer.domElement.addEventListener("webglcontextlost", alPerderContexto);

  renderer.domElement.addEventListener("pointerdown", alBajar);
  renderer.domElement.addEventListener("pointerup", alSubir);

  const real = bien && indice.geometria_real?.includes(objetivo.codigo);
  cb.alListo({ tipo: objetivo.tipo, codigo: objetivo.codigo, simulado: indice.simulado, geometriaReal: !indice.simulado || !!real, conModelo: Object.keys(indice.bienes) });

  if (EN_PRUEBA) {
    window.__visor = {
      ms: Math.round(performance.now() - t0),
      objetivo: objetivo.tipo,
      codigo: objetivo.codigo,
      async saltarVuelo() {
        await new Promise((r) => setTimeout(r, 400));
        if (vuelo) {
          camara.position.copy(vuelo.aPos);
          controles.target.copy(vuelo.aObj);
          vuelo = null;
        }
        controles.update();
        camara.updateMatrixWorld();
        for (let i = 0; i < 3; i++) {
          await motor.update(true);
          dibujar();
          await new Promise((res) => setTimeout(res, 120));
        }
      },
      accion: (a) => acciones[a]?.(caja.querySelector(`[data-accion="${a}"]`)),
      vista: (n) => acciones.vista(n),
      alturas: async () => {
        const piso = await ids(indice.corte?.piso_base ?? []);
        return { cajaMin: cajaTotal.min.y, cajaMax: cajaTotal.max.y, piso: piso.length ? (await modelo.getMergedBox(piso)).max.y : null };
      },
      edificio: () => ({ largo: +edificio.largo.toFixed(2), ancho: +edificio.ancho.toFixed(2), conColumnas: edificio.conColumnas, frente: edificio.frente.toArray(), derecha: edificio.derecha.toArray(), centro: edificio.centro.toArray() }),
      cubo: () => cubo?.style.transform ?? null,
      corteA: () => (cortado ? +(planoCorte.constant - yPiso).toFixed(2) : null),
      colores: () => estructuraColor,
      distancia: () => camara.position.distanceTo(controles.target),
      // Fracción de la zona libre que ocupa el edificio (1 = la llena en ancho o en alto)
      ocupacion: () => {
        const z = zonaLibre();
        const a = [Infinity, -Infinity, Infinity, -Infinity];
        for (const p of edificio.puntos) {
          v.copy(p).project(camara);
          a[0] = Math.min(a[0], v.x);
          a[1] = Math.max(a[1], v.x);
          a[2] = Math.min(a[2], v.y);
          a[3] = Math.max(a[3], v.y);
        }
        return +Math.max((a[1] - a[0]) / (z.x1 - z.x0), (a[3] - a[2]) / (z.y1 - z.y0)).toFixed(2);
      },
      pantallaDe: () => {
        v.copy(cajaFoco ? cajaFoco.getCenter(new THREE.Vector3()) : centroTotal).project(camara);
        const r = renderer.domElement.getBoundingClientRect();
        return { x: r.x + (v.x * 0.5 + 0.5) * r.width, y: r.y + (-v.y * 0.5 + 0.5) * r.height };
      },
      seleccion: () => ultimaSeleccion,
      pantallaDeBien: async (cod) => {
        const c = (await cargarCajas()).find((x) => x.codigo === cod);
        if (!c) return null;
        v.copy(c.caja.getCenter(new THREE.Vector3())).project(camara);
        const r = renderer.domElement.getBoundingClientRect();
        return { x: r.x + (v.x * 0.5 + 0.5) * r.width, y: r.y + (-v.y * 0.5 + 0.5) * r.height };
      },
      puntoContenedor: async (cod) => {
        const b = await modelo.getMergedBox(await ids(indice.contenedores[cod]));
        v.copy(b.getCenter(new THREE.Vector3()).setY(b.max.y)).project(camara);
        const r = renderer.domElement.getBoundingClientRect();
        return { x: r.x + (v.x * 0.5 + 0.5) * r.width, y: r.y + (-v.y * 0.5 + 0.5) * r.height };
      },
      perderContexto: () => renderer.getContext().getExtension("WEBGL_lose_context")?.loseContext(),
      info: () => ({ corte: cortado ? planoCorte.constant : null, pr: renderer.getPixelRatio(), prMovimiento, aislado, tris: renderer.info.render.triangles, llamadas: renderer.info.render.calls, cam: camara.position.toArray(), obj: controles.target.toArray(), foco: cajaFoco ? [cajaFoco.min.toArray(), cajaFoco.max.toArray()] : null }),
    };
  }

  const cerrar = () => {
    vivo = false;
    camaraPrevia = { pos: camara.position.clone(), obj: controles.target.clone(), t: performance.now() };
    cerrarMenu();
    renderer.clippingPlanes = [];
    clearInterval(refresco);
    caja.querySelectorAll(".visor-zona").forEach((e) => e.remove());
    document.removeEventListener("keydown", alTecla);
    renderer.domElement.removeEventListener("webglcontextlost", alPerderContexto);
    if (aislado) modelo.setVisible(visibles, true);
    observador.disconnect();
    controles.dispose();
    caja.removeEventListener("click", alBoton);
    caja.removeEventListener("keydown", alTeclaMenu);
    caja.removeEventListener("mouseover", alEntrar);
    caja.removeEventListener("mouseout", alSalir);
    renderer.domElement.removeEventListener("pointerdown", alBajar);
    renderer.domElement.removeEventListener("pointerup", alSubir);
    escena.remove(modelo.object);
    renderer.domElement.remove();
    delete window.__visor;
  };
  // La hoja del equipo (fuera del visor) suelta la selección con su X
  cerrar.quitarSeleccion = quitarSeleccion;
  return cerrar;
}

// ---------- Correcciones del 14/11 (n.° 8): el equipo en 3D dentro de su ficha, para girarlo y moverlo.
// Usa el mismo motor, modelo y renderizador que el Mapa 3D (nunca están en pantalla a la vez) y deja ver solo el equipo.
let miniCerrar = null;
export function tieneModelo(codigo) {
  return fetch("./modelo/indice_modelo.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((ind) => !!ind?.bienes?.[codigo]?.length)
    .catch(() => false);
}
export async function abrirMini(caja, codigo) {
  miniCerrar?.();
  await preparar(() => {});
  if (!caja.isConnected) return () => {};
  const guids = indice.bienes[codigo];
  if (!guids?.length) return () => {};
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: EN_PRUEBA });
    renderer.setPixelRatio(PR_MAX);
    renderer.domElement.setAttribute("tabindex", "0");
  }
  renderer.domElement.setAttribute("aria-label", "Modelo 3D del equipo: arrastra para girarlo");
  renderer.clippingPlanes = [];
  caja.prepend(renderer.domElement);
  const escena = new THREE.Scene();
  escena.add(new THREE.HemisphereLight(0xffffff, 0xaaa69c, 1.9));
  const sol = new THREE.DirectionalLight(0xffffff, 1.2);
  sol.position.set(10, 20, 14);
  escena.add(sol);
  const camara = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
  const controles = new OrbitControls(camara, renderer.domElement);
  controles.enableDamping = true;
  controles.dampingFactor = 0.12;
  modelo.useCamera(camara);
  escena.add(modelo.object);

  const todos = [...Object.values(indice.bienes).flat(), ...Object.values(indice.contenedores).flat(), ...(indice.entorno ?? []), ...(indice.piso ?? []), ...(indice.otros ?? []), ...(indice.ocultar ?? [])];
  const idsTodos = (await modelo.getLocalIdsByGuids(todos)).filter((x) => x !== null);
  const idsBien = (await modelo.getLocalIdsByGuids(guids)).filter((x) => x !== null);
  await modelo.resetHighlight();
  await modelo.resetOpacity(undefined);
  await modelo.setVisible(idsTodos, false);
  await modelo.setVisible(idsBien, true);
  const b = await modelo.getMergedBox(idsBien);
  const c = b.getCenter(new THREE.Vector3());
  const r = Math.max(b.getSize(new THREE.Vector3()).length() / 2, 0.05);
  controles.target.copy(c);
  controles.minDistance = r * 0.6;
  controles.maxDistance = r * 8;

  let vivo = true;
  let hasta = 0;
  const avisar = (ms = 700) => (hasta = Math.max(hasta, performance.now() + ms));
  const encuadrar = () => {
    const { clientWidth: a, clientHeight: h } = caja;
    if (!a || !h) return;
    renderer.setSize(a, h);
    camara.aspect = a / h;
    camara.updateProjectionMatrix();
    const vert = THREE.MathUtils.degToRad(camara.fov / 2);
    const d = (r / Math.sin(Math.min(vert, Math.atan(Math.tan(vert) * camara.aspect)))) * 1.05;
    // Isométrico: desde una esquina, a unos 30° de altura
    camara.position.copy(c).add(new THREE.Vector3(1, 0.82, 1).normalize().multiplyScalar(d));
    controles.update();
    motor.update(true);
    avisar(1200);
  };
  const obs = new ResizeObserver(encuadrar);
  obs.observe(caja);
  encuadrar();
  controles.addEventListener("change", () => {
    motor.update();
    avisar();
  });
  const bucle = () => {
    if (!vivo) return;
    // Si la ficha cambió y la caja ya no está, se libera todo
    if (!caja.isConnected) return cerrar();
    requestAnimationFrame(bucle);
    if (performance.now() < hasta) {
      controles.update();
      renderer.render(escena, camara);
    }
  };
  const refresco = setInterval(() => vivo && avisar(250), 1500);
  bucle();
  caja.classList.add("listo");
  function cerrar() {
    if (!vivo) return;
    vivo = false;
    clearInterval(refresco);
    obs.disconnect();
    controles.dispose();
    escena.remove(modelo.object);
    if (renderer.domElement.parentElement === caja) renderer.domElement.remove();
    if (miniCerrar === cerrar) miniCerrar = null;
  }
  miniCerrar = cerrar;
  if (EN_PRUEBA) window.__mini = { codigo, visibles: idsBien.length, info: () => ({ tris: renderer.info.render.triangles, vivo }) };
  return cerrar;
}
