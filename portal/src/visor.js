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

  const dibujar = () => {
    controles.update();
    renderer.render(escena, camara);
    moverPin();
    moverEtiquetas?.();
    moverBrujula();
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
  const cajaTotal = await modelo.getMergedBox(visibles);
  const centroTotal = cajaTotal.getCenter(new THREE.Vector3());
  const diagonal = cajaTotal.getSize(new THREE.Vector3()).length();
  controles.maxDistance = diagonal * 2.2;
  controles.minDistance = 0.15;

  // Corte horizontal (v02, prueba): plano a corte.altura_m sobre la cara superior del piso del local
  renderer.clippingPlanes = [];
  let cortado = false;
  let planoCorte = null;
  if (indice.corte) {
    const idsPiso = await ids(indice.corte.piso_base ?? []);
    const yPiso = idsPiso.length ? (await modelo.getMergedBox(idsPiso)).max.y : cajaTotal.min.y;
    planoCorte = new THREE.Plane(new THREE.Vector3(0, -1, 0), yPiso + (indice.corte.altura_m ?? 1.8));
  }

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
  // Distancia mínima a la que los 8 vértices de la caja entran en pantalla, dejando sitio a los controles
  const distanciaExacta = (b, dir, margen = 1.08) => {
    const centro = b.getCenter(new THREE.Vector3());
    const d = dir.clone().normalize();
    const aux = camara.clone();
    let lo = 0.05;
    let hi = distanciaPara(b) * 2;
    const q = new THREE.Vector3();
    for (let i = 0; i < 14; i++) {
      const m = (lo + hi) / 2;
      aux.position.copy(centro).addScaledVector(d, m);
      aux.lookAt(centro);
      aux.updateMatrixWorld();
      let dentro = true;
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
        q.set(x, y, z).project(aux);
        if (Math.abs(q.x) > 0.96 || q.y > 0.9 || q.y < -0.72 || q.z > 1) dentro = false;
      }
      if (dentro) hi = m;
      else lo = m;
    }
    return hi * margen;
  };
  // v02: la vista general mira hacia los equipos desde el interior del local, para que los muros no los tapen
  const guidsBienes = Object.values(indice.bienes).flat();
  const cajaBienes = guidsBienes.length ? await modelo.getMergedBox(await ids(guidsBienes)) : null;
  const haciaDentro = cajaBienes ? centroTotal.clone().sub(cajaBienes.getCenter(new THREE.Vector3())).setY(0) : null;
  const dirGeneral = haciaDentro && haciaDentro.length() > 0.5 && !indice.simulado
    ? haciaDentro.normalize().multiplyScalar(0.78).add(new THREE.Vector3(0, 1.05, 0))
    : new THREE.Vector3(0.3, 1.05, 0.72);
  const vistaGeneral = (dur) => volar(centroTotal, distanciaExacta(cajaTotal, dirGeneral), dirGeneral, dur);

  camara.position.copy(centroTotal).addScaledVector(dirGeneral.clone().normalize(), distanciaExacta(cajaTotal, dirGeneral));
  controles.target.copy(centroTotal);
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
      await atenuarMuros(indice.simulado ? 0.28 : 0.18);
      return;
    }
    await modelo.setOpacity(visibles, OPACIDAD.resto);
    await atenuarMuros(OPACIDAD.muros);
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
    setTimeout(() => vivo && !aislado && irAlFoco(1.5), SIN_MOVIMIENTO ? 0 : 350);
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

  // Controles en pantalla
  const acciones = {
    foco: () => irAlFoco(0.9),
    general: () => vistaGeneral(0.9),
    planta: () => {
      const c = cajaFoco ? cajaFoco.getCenter(new THREE.Vector3()) : centroTotal;
      // Con norte conocido, la planta se ve con el norte hacia arriba (la cámara queda apenas al sur)
      const arriba = norte ? new THREE.Vector3(0, 1, 0).addScaledVector(norte, -0.002) : new THREE.Vector3(0, 1, 0.002);
      volar(c, cajaFoco ? Math.max(distanciaPara(contexto) * 1.6, 5) : distanciaExacta(cajaTotal, arriba), arriba, 0.9);
    },
    muros: async (boton) => {
      mostrarMuros = !mostrarMuros;
      if (idsEntorno.length && !aislado) await modelo.setVisible(idsEntorno, mostrarMuros);
      boton?.setAttribute("aria-pressed", String(!mostrarMuros));
      await motor.update(true);
      avisar();
    },
    corte: async (boton) => {
      if (!planoCorte) return;
      cortado = !cortado;
      renderer.clippingPlanes = cortado ? [planoCorte] : [];
      boton?.setAttribute("aria-pressed", String(cortado));
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
          volar(b.getCenter(new THREE.Vector3()), distanciaExacta(b, dir), dir, 0.8);
        } else vistaGeneral(0.8);
      }
      await motor.update(true);
      avisar(1200);
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
        volar(b.getCenter(new THREE.Vector3()), distanciaExacta(b, dir, 1.15), dir, 0.7);
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
    const b = e.target.closest("[data-accion]");
    if (b) acciones[b.dataset.accion]?.(b);
  };
  caja.addEventListener("click", alBoton);

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
    for (const c of cajas) {
      const punto = rayo.ray.intersectBox(c.caja, new THREE.Vector3());
      if (!punto) continue;
      const d = punto.distanceTo(camara.position);
      // El bien buscado tiene prioridad sobre lo que está atenuado delante
      if (c.codigo === objetivo.codigo) return { codigo: c.codigo, d: 0 };
      if (d < dist) {
        dist = d;
        mejor = c.codigo;
      }
    }
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
    if (!codigo && !cont) return quitarSeleccion();
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
    if (e.key === "Escape") return quitarSeleccion();
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
  cb.alListo({ tipo: objetivo.tipo, codigo: objetivo.codigo, simulado: indice.simulado, geometriaReal: !indice.simulado || !!real });

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
      pantallaDe: () => {
        v.copy(cajaFoco ? cajaFoco.getCenter(new THREE.Vector3()) : centroTotal).project(camara);
        const r = renderer.domElement.getBoundingClientRect();
        return { x: r.x + (v.x * 0.5 + 0.5) * r.width, y: r.y + (-v.y * 0.5 + 0.5) * r.height };
      },
      seleccion: () => ultimaSeleccion,
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

  return () => {
    vivo = false;
    renderer.clippingPlanes = [];
    clearInterval(refresco);
    caja.querySelectorAll(".visor-zona").forEach((e) => e.remove());
    document.removeEventListener("keydown", alTecla);
    renderer.domElement.removeEventListener("webglcontextlost", alPerderContexto);
    if (aislado) modelo.setVisible(visibles, true);
    observador.disconnect();
    controles.dispose();
    caja.removeEventListener("click", alBoton);
    renderer.domElement.removeEventListener("pointerdown", alBajar);
    renderer.domElement.removeEventListener("pointerup", alSubir);
    escena.remove(modelo.object);
    renderer.domElement.remove();
    delete window.__visor;
  };
}
