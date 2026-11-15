// Prueba de extremo a extremo en Chrome sin ventana, con perfil temporal aparte.
// Simula un celular (390 x 844) con la CPU 4 veces más lenta. Es una aproximación:
// no reemplaza la prueba en un teléfono real. Requiere el sitio en http://127.0.0.1:4173/.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "http://127.0.0.1:4173/";
const CAPTURAS = path.join(RAIZ, "integridad", "capturas");
fs.rmSync(CAPTURAS, { recursive: true, force: true });
fs.mkdirSync(CAPTURAS, { recursive: true });
const bienes = JSON.parse(fs.readFileSync(path.join(RAIZ, "portal", "public", "datos", "bienes.json"), "utf8")).bienes;
const indice = JSON.parse(fs.readFileSync(path.join(RAIZ, "portal", "public", "modelo", "indice_modelo.json"), "utf8"));
const muestra = bienes.filter((b) => b.En_muestra === "Sí");
// v02: lugar de HB015 según los datos publicados (antes, «Armario 1»)
const lugarHB015 = bienes.find((b) => b.Codigo_LH === "LH-EQP-065").Ubicacion_texto.split("(")[0].split(" - ").pop().trim();

const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-prueba-"));
const chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
  "--headless=new", "--remote-debugging-port=9333", `--user-data-dir=${perfil}`, "--no-first-run",
  "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "about:blank",
], { stdio: "ignore" });

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let info;
for (let i = 0; i < 40 && !info; i++) {
  await espera(250);
  info = await fetch("http://127.0.0.1:9333/json/list").then((r) => r.json()).catch(() => null);
}
const ws = new WebSocket(info.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let n = 0;
const pendientes = new Map();
const consola = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pendientes.has(m.id)) {
    pendientes.get(m.id)(m);
    pendientes.delete(m.id);
  } else if (m.method === "Runtime.exceptionThrown") {
    consola.push(`excepción: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    consola.push(`error: ${m.params.args.map((a) => a.value ?? a.description).join(" ")}`);
  } else if (m.method === "Network.loadingFailed" && !m.params.canceled && !sinRed) {
    consola.push(`carga fallida: ${m.params.errorText}`);
  } else if (m.method === "Network.responseReceived" && m.params.response.status >= 400) {
    consola.push(`HTTP ${m.params.response.status}: ${m.params.response.url}`);
  }
};
let sinRed = false;
const cdp = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++n;
    pendientes.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
const evalua = async (expression) => {
  const r = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const ir = async (url, ms = 400) => {
  await cdp("Page.navigate", { url });
  await espera(ms);
};
const hasta = async (expr, ms = 15000) => {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await evalua(expr).catch(() => false)) return true;
    await espera(80);
  }
  return false;
};
const captura = async (nombre) => {
  const { data } = await cdp("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(CAPTURAS, nombre), Buffer.from(data, "base64"));
};
const LISTO = "window.__visor?.ms > 0";
const NARANJA = `(async () => {
  await window.__visor.saltarVuelo();
  const c = document.querySelector('.visor canvas'), g = c.getContext('webgl2');
  const w = g.drawingBufferWidth, h = g.drawingBufferHeight, p = new Uint8Array(w * h * 4);
  g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, p);
  let o = 0;
  // v03: el marcado pasó del naranja al amarillo de señal #E2B532 (226, 181, 50). Se cuenta solo ese tono
  // exacto, que es el del contorno sin luz: el banco hidráulico también es amarillo y no debe contar
  for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - 226) <= 14 && Math.abs(p[i + 1] - 181) <= 14 && Math.abs(p[i + 2] - 50) <= 14 && p[i + 3] > 0) o++;
  return o;
})()`;
const ENCUADRE = `(() => { const p = window.__visor.pantallaDe(), r = document.querySelector('.visor canvas').getBoundingClientRect(); return p.x >= r.x && p.x <= r.right && p.y >= r.y && p.y <= r.bottom; })()`;

const res = [];
const caso = (nombre, ok, detalle = "") => {
  res.push({ nombre, ok: !!ok, detalle });
  console.log(`${ok ? "OK   " : "FALLA"} ${nombre}${detalle ? `  [${detalle}]` : ""}`);
};
const errores = [];
try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Network.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });

  // Buscador
  await ir(BASE);
  await hasta("document.querySelectorAll('.tarjeta').length > 0");
  caso("Inicio lista todos los bienes", (await evalua("document.querySelectorAll('.tarjeta').length")) === bienes.length, `${bienes.length}`);
  caso("Sin desborde horizontal en el inicio", await evalua("document.documentElement.scrollWidth <= innerWidth"));
  await captura("1_inicio.png");
  await evalua(`(() => { const q = document.querySelector('#q'); q.value = 'Bernoulli'; q.dispatchEvent(new Event('input')); })()`);
  const nb = await evalua("document.querySelectorAll('.tarjeta').length");
  caso("Buscar «Bernoulli» encuentra el equipo", nb >= 1 && (await evalua("document.querySelector('.tarjeta').innerText.includes('Bernoulli')")), `${nb}`);
  await evalua(`(() => { const q = document.querySelector('#q'); q.value = ''; q.dispatchEvent(new Event('input')); document.querySelector('[data-tipo="FOR-VDC-09B"]').click(); })()`);
  caso("El filtro de instrumentos funciona", (await evalua("document.querySelectorAll('.tarjeta').length")) === bienes.filter((b) => b.Tipo_ficha === "FOR-VDC-09B").length);
  await evalua(`document.querySelector('[data-tipo=""]').click()`);

  // Fichas: B1 y presentación, en las 81
  let fallas = [];
  let desb = [];
  const tiempos = [];
  for (const b of bienes) {
    const t0 = Date.now();
    await ir(`${BASE}?id=${b.Codigo_LH}`, 20);
    await hasta(`document.querySelector('.codigo')?.textContent === ${JSON.stringify(b.Codigo_LH)}`);
    tiempos.push(Date.now() - t0);
    const txt = await evalua("document.querySelector('.ficha')?.innerText ?? ''");
    const h1 = await evalua("document.querySelector('h1')?.textContent");
    if (h1 !== b.Nombre || !["Dónde está", "Estado metrológico", "Última orden", "Manual de operación"].every((x) => txt.includes(x))) fallas.push(b.Codigo_LH);
    if (!(await evalua("document.documentElement.scrollWidth <= innerWidth"))) desb.push(b.Codigo_LH);
    if (b.Foto && !(await hasta("document.querySelector('.heroe img')?.complete && document.querySelector('.heroe img').naturalWidth > 0", 4000))) fallas.push(`${b.Codigo_LH}:foto`);
  }
  tiempos.sort((a, b) => a - b);
  caso(`B1: las ${bienes.length} direcciones de QR abren su ficha, con foto si la tiene`, !fallas.length, fallas.join(","));
  caso("Ninguna ficha desborda en celular", !desb.length, desb.join(","));
  caso("Tiempo de apertura de ficha, mediana y máximo", true, `${tiempos[40]} ms y ${tiempos.at(-1)} ms (servidor local)`);
  await ir(`${BASE}?id=LH-EQP-065`, 700);
  await captura("2_ficha.png");
  await evalua("window.scrollTo(0, 620)");
  await espera(150);
  await captura("3_ficha_detalle.png");
  await ir(`${BASE}?id=NO-EXISTE`, 400);
  caso("Código inexistente muestra aviso", (await evalua("document.body.innerText")).includes("No encontramos ese código"));
  const manual = bienes.find((b) => b.Manual_fabrica_URL);
  const rm = await fetch(BASE + manual.Manual_fabrica_URL, { method: "HEAD" });
  caso("Manual de fábrica disponible", rm.ok && (rm.headers.get("content-type") ?? "").includes("pdf"), manual.Manual_fabrica_URL);
  caso("Todos los enlaces de manual y foto existen", (await Promise.all(bienes.flatMap((b) => [b.Foto, b.Manual_fabrica_URL]).filter(Boolean).map((u) => fetch(BASE + u, { method: "HEAD" }).then((r) => r.ok)))).every(Boolean));

  // Visor: todos los bienes llegan a su objetivo y este queda en el encuadre
  fallas = [];
  const ms3d = [];
  const tipos = {};
  for (const b of bienes) {
    await ir(`${BASE}?id=${b.Codigo_LH}&ver=3d&prueba=1`, 30);
    if (!(await hasta(LISTO, 30000))) {
      fallas.push(`${b.Codigo_LH}:no cargó`);
      continue;
    }
    ms3d.push(await evalua("window.__visor.ms"));
    const tipo = await evalua("window.__visor.objetivo");
    tipos[tipo] = (tipos[tipo] ?? 0) + 1;
    if (tipo === "ninguno") continue;
    const o = await evalua(NARANJA);
    if (o === 0) fallas.push(`${b.Codigo_LH}:sin marca`);
    if (!(await evalua(ENCUADRE))) fallas.push(`${b.Codigo_LH}:fuera de encuadre`);
    if (muestra.includes(b) && tipo !== "bien") fallas.push(`${b.Codigo_LH}:${tipo}`);
    if (await evalua("document.querySelector('#visor-carga').hidden === false")) fallas.push(`${b.Codigo_LH}:carga visible`);
  }
  ms3d.sort((a, b) => a - b);
  caso(`Los ${bienes.length} bienes abren el 3D; la muestra se marca y queda en el encuadre`, !fallas.length, fallas.slice(0, 12).join(","));
  caso("Cómo se resuelve cada bien en el modelo", true, JSON.stringify(tipos));
  caso("Apertura del 3D, mediana y máximo", true, `${ms3d[Math.floor(ms3d.length / 2)]} ms y ${ms3d.at(-1)} ms`);

  // Familia real
  await ir(`${BASE}?id=LH-EQP-065&ver=3d&prueba=1`, 100);
  await hasta(LISTO, 30000);
  const oh = await evalua(NARANJA);
  caso("HB015 real se marca desde su ficha", oh > 0, `${oh} píxeles`);
  await espera(2500);
  await evalua("window.__visor.saltarVuelo()");
  await captura("4_visor_HB015.png");
  const av = await evalua("document.querySelector('#visor-estado').textContent");
  // v02: con el modelo real no hay aviso de demostración
  if (indice.simulado) caso("El visor declara que el local es esquemático", av.includes("esquemático") && av.includes("familia real"), av);
  else caso("Con el modelo real no hay aviso de demostración", !av.includes("demostración"), av || "sin aviso");
  caso("Sin desborde en el visor", await evalua("document.documentElement.scrollWidth <= innerWidth && document.body.scrollHeight <= innerHeight + 1"));
  const pc = await evalua("window.__visor.pantallaDe()");
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: pc.x, y: pc.y, button: "left", clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: pc.x, y: pc.y, button: "left", clickCount: 1 });
  caso("Tocar el equipo lo identifica", await hasta("window.__visor.seleccion()?.codigo === 'LH-EQP-065'", 4000));
  caso("La hoja muestra el bien, su estado y su ficha", await evalua("(() => { const t = document.querySelector('#visor-hoja').innerText; return t.includes('Bernoulli') && t.includes('Operativo') && t.includes('Ver ficha') && t.includes('Manual'); })()"));
  await captura("5_visor_seleccion.png");
  // Lista de lo que hay en el mueble, desde la hoja del bien
  await evalua(`document.querySelector('[data-hoja="mueble"]').click()`);
  const lm = await evalua("document.querySelectorAll('.hoja-lista a').length");
  const contHB015 = bienes.find((b) => b.Codigo_LH === "LH-EQP-065").Contenedor;
  const enArm = bienes.filter((b) => b.Contenedor === contHB015).length;
  caso("La hoja lista todo lo que hay en el mueble", lm === enArm, `${lm} de ${enArm}`);
  await captura("5b_visor_mueble.png");
  await evalua(`document.querySelector('[data-hoja="cerrar"]').click()`);

  // Aislar: deja solo el equipo y luego restaura todo
  const trisAntes = (await evalua("window.__visor.info()")).tris;
  await evalua("window.__visor.accion('aislar')");
  await espera(1300);
  await evalua("window.__visor.saltarVuelo()");
  const ais = await evalua("window.__visor.info()");
  caso("Aislar deja solo el equipo", ais.aislado && ais.tris < trisAntes, `${trisAntes} a ${ais.tris} triángulos`);
  await captura("5c_visor_aislado.png");
  await evalua("window.__visor.accion('aislar')");
  await espera(1300);
  await evalua("window.__visor.saltarVuelo()");
  const res2 = await evalua("window.__visor.info()");
  caso("Salir de aislar restaura el modelo", !res2.aislado && res2.tris >= trisAntes * 0.9, `${res2.tris} triángulos`);

  // Teclado
  const c0 = (await evalua("window.__visor.info()")).cam;
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
  await espera(300);
  const c1 = (await evalua("window.__visor.info()")).cam;
  caso("Las flechas del teclado giran el modelo", Math.hypot(c0[0] - c1[0], c0[2] - c1[2]) > 0.02);

  for (const a of ["general", "planta", "muros", "foco"]) await evalua(`window.__visor.accion('${a}')`);
  await espera(1400);
  caso("Los controles responden", await evalua("document.querySelector('[data-accion=muros]').getAttribute('aria-pressed') === 'true'"));
  await evalua("window.__visor.accion('muros')");

  // Del 3D a otra ficha y de vuelta, sin recargar
  await evalua(`document.querySelector('.volver-ficha').click()`);
  caso("Volver a la ficha sin recargar", await hasta(`document.querySelector('.codigo')?.textContent === 'LH-EQP-065'`, 3000));
  await ir(`${BASE}?id=LH-EQP-065.02&ver=3d&prueba=1`, 100);
  await hasta(LISTO, 15000);
  caso("Un componente marca su equipo principal y lo aclara", (await evalua("document.querySelector('.visor-pin span').textContent")).startsWith("Con:"), await evalua("document.querySelector('.visor-pin span').textContent"));
  await evalua(`history.pushState(null, '', './?id=LH-EQP-065&prueba=1'); dispatchEvent(new PopStateEvent('popstate'))`);
  await espera(300);
  await evalua(`history.pushState(null, '', './?id=LH-EQP-064&ver=3d&prueba=1'); dispatchEvent(new PopStateEvent('popstate'))`);
  await hasta(`window.__visor?.codigo === 'LH-EQP-064'`, 15000);
  const om = await evalua(NARANJA);
  caso("Cambiar de bien reutiliza el modelo y marca el nuevo", om > 0 && (await evalua("window.__visor.ms")) < 2500, `${await evalua("window.__visor.ms")} ms`);
  await espera(2300);
  await evalua("window.__visor.saltarVuelo()");
  await captura("6_visor_HB016.png");

  // Mapa general y fluidez
  await ir(`${BASE}?ver=mapa&prueba=1`, 100);
  await hasta(LISTO, 30000);
  await evalua("window.__visor.saltarVuelo()");
  await captura("7_mapa.png");
  const inf = await evalua("window.__visor.info()");
  caso("El mapa muestra el modelo", inf.tris > 1000, `${inf.tris} triángulos`);
  const etq = await evalua(`[...document.querySelectorAll('.visor-zona:not([hidden])')].map((e) => { const r = e.getBoundingClientRect(); return [e.textContent, r.left, r.top, r.right, r.bottom]; })`);
  const encimadas = etq.some((a, i) => etq.some((b, j) => j > i && a[1] < b[3] && a[3] > b[1] && a[2] < b[4] && a[4] > b[2]));
  const minimo = indice.simulado ? 2 : 1;
  caso("Las etiquetas del mapa no se enciman", etq.length >= minimo && !encimadas, etq.map((e) => e[0]).join(", "));

  // v02: corte horizontal a 1,8 m sobre el piso
  if (indice.corte) {
    await evalua("window.__visor.accion('corte')");
    await espera(1000);
    await evalua("window.__visor.saltarVuelo()");
    const ic = await evalua("window.__visor.info()");
    await captura("7b_mapa_corte.png");
    caso("El corte deja ver el interior y se puede quitar", ic.corte !== null && ic.tris > 1000, `plano en y = ${ic.corte?.toFixed(3)}; ${ic.tris} triángulos`);
    await evalua("window.__visor.accion('corte')");
    await espera(900);
    caso("Quitar el corte vuelve al modelo completo", (await evalua("window.__visor.info()")).corte === null);
  }

  // Tocar un mueble por arriba: identifica el mueble, no un bien lejano
  await evalua("window.__visor.accion('planta')");
  await espera(1100);
  await evalua("window.__visor.saltarVuelo()");
  const contPrueba = indice.contenedores["ARM-02"] ? "ARM-02" : Object.keys(indice.contenedores)[0];
  const pm = await evalua(`window.__visor.puntoContenedor('${contPrueba}')`);
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: pm.x, y: pm.y, button: "left", clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: pm.x, y: pm.y, button: "left", clickCount: 1 });
  caso("Tocar un mueble lo identifica y lista su contenido", await hasta("window.__visor.seleccion()?.tipo === 'contenedor' && document.querySelectorAll('.hoja-lista a').length > 0", 4000), JSON.stringify(await evalua("window.__visor.seleccion()")));
  await captura("7b_mapa_mueble.png");
  await evalua(`document.querySelector('[data-hoja="cerrar"]')?.click()`);

  // Buscar dentro del mapa
  await evalua(`document.querySelector('#visor-lupa').click()`);
  await evalua(`(() => { const q = document.querySelector('#visor-q'); q.value = 'cavitacion'; q.dispatchEvent(new Event('input')); })()`);
  caso("El buscador del visor encuentra sin acentos", await hasta("document.querySelector('#visor-resultados')?.innerText.includes('cavitación')", 2000));
  await captura("7c_mapa_busqueda.png");
  await evalua(`document.querySelector('#visor-resultados a').click()`);
  caso("Elegir un resultado lleva al bien en el 3D", await hasta(`location.search.includes('LH-EQP-109') && document.querySelector('.visor-titulo h1')?.textContent.includes('cavitación')`, 6000));
  await ir(`${BASE}?ver=mapa&prueba=1`, 100);
  await hasta(LISTO, 30000);
  await evalua("window.__visor.saltarVuelo()");
  const fps = await evalua(`new Promise((r) => { const c = document.querySelector('.visor canvas'); const b = c.getBoundingClientRect(); let n = 0, ang = 0; const t = performance.now(); const f = () => { n++; ang += 8; c.dispatchEvent(new WheelEvent('wheel', { deltaY: (n % 2 ? 40 : -40), clientX: b.x + 50, clientY: b.y + 50, bubbles: true })); performance.now() - t < 3000 ? requestAnimationFrame(f) : r(Math.round(n / 3)); }; requestAnimationFrame(f); })`);
  caso("Fluidez al interactuar, referencia con render por software", fps >= 10, `${fps} cuadros/s`);

  // Teléfono en horizontal
  await cdp("Emulation.setDeviceMetricsOverride", { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await ir(`${BASE}?id=LH-EQP-065&ver=3d&prueba=1`, 100);
  await hasta(LISTO, 30000);
  await evalua("window.__visor.saltarVuelo()");
  await espera(400);
  await captura("14_visor_horizontal.png");
  const hz = await evalua(`(() => { const v = document.querySelector('.visor').getBoundingClientRect(), b = document.querySelector('.visor-barra').getBoundingClientRect(), n = document.querySelector('.nav').getBoundingClientRect(); return { alto: v.height, barra: b.bottom <= v.bottom + 1 && b.top >= v.top, nav: n.bottom <= innerHeight + 1, sc: document.documentElement.scrollWidth <= innerWidth && document.body.scrollHeight <= innerHeight + 1 }; })()`);
  caso("En horizontal el modelo manda y nada se corta", hz.alto >= 250 && hz.barra && hz.nav && hz.sc, JSON.stringify(hz));
  caso("En horizontal el bien sigue en el encuadre", await evalua(ENCUADRE));
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  // Movimiento reducido: llega al bien sin animación larga
  await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "reduce" }] });
  await ir(`${BASE}?id=LH-EQP-064&ver=3d&prueba=1`, 100);
  await hasta(LISTO, 30000);
  await espera(700);
  const mr = await evalua("window.__visor.info()");
  const cf = [(mr.foco[0][0] + mr.foco[1][0]) / 2, (mr.foco[0][1] + mr.foco[1][1]) / 2, (mr.foco[0][2] + mr.foco[1][2]) / 2];
  caso("Con movimiento reducido llega de inmediato", Math.hypot(mr.obj[0] - cf[0], mr.obj[1] - cf[1], mr.obj[2] - cf[2]) < 0.05);
  await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });

  // Sin redibujar en reposo: cuida la batería
  await ir(`${BASE}?id=LH-EQP-065&ver=3d&prueba=1`, 100);
  await hasta(LISTO, 30000);
  await espera(11000);
  const cuadros = await evalua(`new Promise((r) => { const g = document.querySelector('.visor canvas').getContext('webgl2'); const o = g.drawElements.bind(g); const p = g.drawElementsInstanced?.bind(g); let n = 0; g.drawElements = (...a) => { n++; return o(...a); }; if (p) g.drawElementsInstanced = (...a) => { n++; return p(...a); }; setTimeout(() => { g.drawElements = o; if (p) g.drawElementsInstanced = p; r(n); }, 2500); })`);
  caso("En reposo el visor no redibuja", cuadros === 0, `${cuadros} llamadas de dibujo en 2,5 s`);

  // Pérdida de la memoria gráfica
  await evalua("window.__visor.perderContexto()");
  caso("Si se pierde el 3D, lo explica y ofrece recargar", await hasta(`document.querySelector('#visor-carga') && !document.querySelector('#visor-carga').hidden && document.querySelector('#visor-carga').innerText.includes('Volver a cargar')`, 4000));
  await captura("15_visor_perdido.png");

  // Guía de primer uso: aparece una vez y no estorba
  await evalua("localStorage.removeItem('labhid-guia-3d')");
  await ir(`${BASE}?id=LH-EQP-065&ver=3d`, 1500);
  caso("La guía aparece la primera vez", await hasta("!!document.querySelector('.visor-guia')", 4000));
  await captura("17_guia.png");
  caso("La guía no bloquea el modelo", (await evalua("getComputedStyle(document.querySelector('.visor-guia')).pointerEvents")) === "none");
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: 195, y: 400, button: "left", clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: 195, y: 400, button: "left", clickCount: 1 });
  caso("La guía se va al primer toque", await hasta("!document.querySelector('.visor-guia')", 2000));
  await ir(`${BASE}?id=LH-EQP-064&ver=3d`, 1500);
  caso("La guía no se repite", !(await evalua("!!document.querySelector('.visor-guia')")));

  // Sin conexión
  await cdp("Emulation.setCPUThrottlingRate", { rate: 1 });
  await ir(BASE, 800);
  caso("Se registra el modo sin conexión", await hasta("navigator.serviceWorker.getRegistration().then(r => !!r?.active)", 8000));
  await ir(BASE, 800);
  await hasta("!!navigator.serviceWorker.controller", 5000);
  await ir(`${BASE}?id=LH-EQP-065`, 800);
  await ir(`${BASE}?id=LH-EQP-065&ver=3d&prueba=1`, 100);
  await hasta(LISTO, 30000);
  await espera(600);
  sinRed = true;
  await cdp("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await ir(`${BASE}?id=LH-EQP-065`, 900);
  caso("Sin conexión: abre una ficha visitada", await hasta("document.querySelector('.codigo')?.textContent === 'LH-EQP-065'", 6000));
  await ir(`${BASE}?id=LH-EQP-063`, 900);
  caso("Sin conexión: abre otra ficha con los datos guardados", await hasta("document.querySelector('.codigo')?.textContent === 'LH-EQP-063'", 6000));
  await ir(`${BASE}?id=LH-EQP-065&ver=3d&prueba=1`, 100);
  caso("Sin conexión: abre el 3D ya visitado", await hasta(LISTO, 15000));
  await cdp("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await espera(300);
  sinRed = false;

  // Tema oscuro, escritorio y carga lenta
  await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  await ir(BASE, 700);
  await captura("8_inicio_oscuro.png");
  await ir(`${BASE}?id=LH-EQP-065`, 700);
  await captura("9_ficha_oscuro.png");
  await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await ir(BASE, 700);
  await captura("10_inicio_escritorio.png");
  await ir(`${BASE}?id=LH-EQP-065&ver=3d&prueba=1`, 100);
  await hasta(LISTO, 30000);
  await evalua(NARANJA);
  await espera(2300);
  await evalua("window.__visor.saltarVuelo()");
  await captura("11_visor_escritorio.png");
  caso("Sin errores en la consola ni cargas fallidas", consola.length === 0, consola.slice(0, 5).join(" | "));

  // Modelo que no carga: no debe culpar al dispositivo
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp("Network.setBlockedURLs", { urls: ["*modelo.frag*"] });
  await cdp("Network.setCacheDisabled", { cacheDisabled: true });
  const swReg = await evalua("navigator.serviceWorker.getRegistrations().then(async (l) => { for (const r of l) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); return l.length; })");
  await ir(`${BASE}?id=LH-EQP-065&ver=3d`, 2500);
  caso("Si el modelo no carga, lo dice y ofrece reintentar", await hasta(`document.querySelector('#visor-carga')?.innerText.includes('No se pudo cargar el modelo') && document.querySelector('#visor-carga').innerText.includes('Volver a intentar') && document.querySelector('#visor-carga').innerText.includes(${JSON.stringify(lugarHB015)})`, 8000), `sw quitados: ${swReg}`);
  await captura("18_modelo_no_carga.png");
  await cdp("Network.setBlockedURLs", { urls: [] });
  await cdp("Network.setCacheDisabled", { cacheDisabled: false });

  // Dispositivo sin WebGL: la ubicación en texto sigue disponible
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  const inj = await cdp("Page.addScriptToEvaluateOnNewDocument", { source: "HTMLCanvasElement.prototype.getContext = function () { return null; };" });
  await ir(`${BASE}?id=LH-EQP-065&ver=3d`, 2500);
  caso("Sin WebGL muestra la ubicación en texto", await hasta(`document.querySelector('#visor-carga')?.innerText.includes(${JSON.stringify(lugarHB015)})`, 6000), await evalua("document.querySelector('#visor-carga')?.innerText"));
  caso("Sin WebGL se ocultan los controles del 3D", await evalua("getComputedStyle(document.querySelector('.visor-barra')).display === 'none'"));
  await captura("16_sin_webgl.png");
  await cdp("Page.removeScriptToEvaluateOnNewDocument", { identifier: inj.identifier });
  console.log(`Modelo: ${Object.keys(indice.bienes).length} bienes, ${Object.keys(indice.contenedores).length} contenedores`);
} catch (e) {
  errores.push(String(e?.stack ?? e));
  caso("La prueba terminó sin excepción", false, String(e?.message ?? e));
} finally {
  const fal = res.filter((r) => !r.ok);
  const texto = res.map((r) => `${r.ok ? "OK   " : "FALLA"} ${r.nombre}${r.detalle ? `  [${r.detalle}]` : ""}`).join("\n");
  fs.writeFileSync(path.join(RAIZ, "integridad", "resultado_navegador.txt"), `${texto}\n\nTotal: ${res.length} | OK: ${res.length - fal.length} | Fallas: ${fal.length}\n${errores.join("\n")}\n`);
  console.log(`Total: ${res.length} | OK: ${res.length - fal.length} | Fallas: ${fal.length}`);
  chrome.kill();
  await espera(800);
  fs.rmSync(perfil, { recursive: true, force: true, maxRetries: 5 });
  process.exit(fal.length ? 1 : 0);
}
