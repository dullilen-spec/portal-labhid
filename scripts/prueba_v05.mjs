// v05: pruebas del panel de mantenimiento, Novedades, el reporte desde la ficha, la hoja de campo y el modelo v06.
// Chrome sin ventana, perfil temporal, celular de 390 x 844. Requiere el sitio en http://127.0.0.1:4173/.
// GitHub nunca se toca: el panel usa una red simulada (window.__fetchPanel) y actualizaciones.json se
// reemplaza en el navegador con el dominio Fetch de Chrome.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validarArchivo } from "../portal/src/esquema.js";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "http://127.0.0.1:4173/";
const CAPTURAS = path.join(RAIZ, "integridad", "capturas_v05");
fs.mkdirSync(CAPTURAS, { recursive: true });
const bienes = JSON.parse(fs.readFileSync(path.join(RAIZ, "portal", "public", "datos", "bienes.json"), "utf8")).bienes;
const hoja = fs.readFileSync(path.join(RAIZ, "campo", "hoja_campo_v06.json"), "utf8");
const codigos = new Set(bienes.map((b) => b.Codigo_LH));
const contenedores = new Set(bienes.map((b) => b.Contenedor).filter((c) => c && c !== "Pendiente"));

const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-v05-"));
const chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
  "--headless=new", "--remote-debugging-port=9334", `--user-data-dir=${perfil}`, "--no-first-run",
  "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "about:blank",
], { stdio: "ignore" });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let info;
for (let i = 0; i < 40 && !info; i++) {
  await espera(250);
  info = await fetch("http://127.0.0.1:9334/json/list").then((r) => r.json()).catch(() => null);
}
const ws = new WebSocket(info.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let n = 0;
const pendientes = new Map();
const consola = [];
let actualizacionesSimuladas = null;
ws.onmessage = async (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pendientes.has(m.id)) {
    pendientes.get(m.id)(m);
    pendientes.delete(m.id);
  } else if (m.method === "Fetch.requestPaused") {
    const cuerpo = actualizacionesSimuladas ?? { version: 1, cambios: [] };
    cdp("Fetch.fulfillRequest", {
      requestId: m.params.requestId, responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify(cuerpo)).toString("base64"),
    });
  } else if (m.method === "Runtime.exceptionThrown") {
    consola.push(`excepción: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    consola.push(`error: ${m.params.args.map((a) => a.value ?? a.description).join(" ")}`);
  } else if (m.method === "Network.responseReceived" && m.params.response.status >= 400) {
    consola.push(`HTTP ${m.params.response.status}: ${m.params.response.url}`);
  }
};
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
const ir = async (url, ms = 500) => {
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
const res = [];
const caso = (nombre, ok, detalle = "") => {
  res.push({ nombre, ok: !!ok, detalle });
  console.log(`${ok ? "OK   " : "FALLA"} ${nombre}${detalle ? `  [${detalle}]` : ""}`);
};
// Red simulada de GitHub para el panel: guarda en memoria lo que se "sube"
const RED_SIMULADA = (hojaTexto) => `(() => {
  window.__subido = {}; window.__llamadas = [];
  const hoja = ${JSON.stringify(hojaTexto)};
  const archivos = { "portal/public/datos/actualizaciones.json": { json: { version: 1, cambios: [] }, sha: "s0" } };
  const b64 = (t) => btoa(unescape(encodeURIComponent(t)));
  const de64 = (t) => decodeURIComponent(escape(atob(t)));
  window.__sinRed = false;
  window.__fetchPanel = async (url, op = {}) => {
    if (window.__sinRed) throw new TypeError("Failed to fetch");
    const m = op.method || "GET";
    window.__llamadas.push(m + " " + url);
    const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
    if (url.endsWith("/repos/dullilen-spec/portal-labhid")) return json({ permissions: { push: true } });
    const ruta = decodeURIComponent((url.split("/contents/")[1] || "").split("?")[0]);
    if (ruta === "campo/hoja_campo_v06.json") return json({ content: b64(hoja), sha: "h" });
    if (m === "GET") return archivos[ruta] ? json({ content: b64(JSON.stringify(archivos[ruta].json)), sha: archivos[ruta].sha }) : json({ message: "Not Found" }, 404);
    const cuerpo = JSON.parse(op.body);
    if (archivos[ruta] && cuerpo.sha !== archivos[ruta].sha) return json({ message: "conflict" }, 409);
    const texto = ruta.endsWith(".json") ? de64(cuerpo.content) : null;
    archivos[ruta] = { json: texto ? JSON.parse(texto) : null, sha: "s" + Math.random() };
    window.__subido[ruta] = texto ? JSON.parse(texto) : "binario";
    return json({ content: { sha: archivos[ruta].sha } });
  };
})()`;

try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Network.enable");
  await cdp("Fetch.enable", { patterns: [{ urlPattern: "*datos/actualizaciones.json*" }] });
  await cdp("Network.setCacheDisabled", { cacheDisabled: true });
  // El service worker pediría actualizaciones.json por su cuenta y la simulación no lo vería
  await cdp("Network.setBypassServiceWorker", { bypass: true });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  // Navegación
  await ir(BASE, 800);
  await hasta("document.querySelectorAll('.tarjeta').length > 0");
  const pest = await evalua("[...document.querySelectorAll('#nav a span')].map((s) => s.textContent).join(',')");
  caso("El menú tiene Buscar, Mapa 3D, Novedades y Acerca", pest === "Buscar,Mapa 3D,Novedades,Acerca", pest);
  caso("El panel no aparece en el menú", !(await evalua("!!document.querySelector('#nav a[href*=panel]')")));

  // Novedades vacías
  await ir(`${BASE}?ver=novedades`, 600);
  caso("Novedades sin cambios lo dice", await hasta("document.body.innerText.includes('Todavía no hay novedades')", 4000));

  // Ficha: reporte
  await ir(`${BASE}?id=LH-EQP-065`, 600);
  await hasta("document.querySelector('.codigo')?.textContent === 'LH-EQP-065'");
  const rep = await evalua("document.querySelector('.reportar a')?.href ?? ''");
  caso("La ficha tiene «Reportar un dato o una falla» con el código", rep.includes("issues/new") && rep.includes("LH-EQP-065") && rep.includes("template=reporte.yml"), rep.slice(0, 120));
  caso("Sin cambios, la ficha no dice «Actualizado el»", !(await evalua("!!document.querySelector('.ficha-actualizada')")));

  // Panel sin sesión
  await ir(`${BASE}?panel&id=LH-EQP-065`, 1200);
  await hasta("!!document.querySelector('#p-form')");
  caso("El panel abre con el equipo del enlace", await evalua("document.querySelector('.p-bien h2')?.textContent === 'Aparato del teorema de Bernoulli'"));
  caso("Sin sesión no se puede guardar", await evalua("document.querySelector('#p-form [type=submit]').disabled === true"));
  caso("El panel no desborda en celular", await evalua("document.documentElement.scrollWidth <= innerWidth"));
  await captura("1_panel_sin_sesion.png");

  // Entrar con la red simulada
  await evalua(RED_SIMULADA(hoja));
  await evalua(`(() => { document.querySelector('#p-token').value = 'github_pat_PRUEBA'; document.querySelector('#p-autor').value = 'rc'; document.querySelector('#p-entrar').requestSubmit(); })()`);
  caso("Con un token válido se abre la sesión", await hasta("document.body.innerText.includes('Sesión abierta') && document.querySelector('#p-form [type=submit]').disabled === false", 4000));
  // Cambio inválido: sin motivo
  await evalua(`(() => { const f = document.querySelector('#p-form'); f.querySelector('#f-eo').value = 'Inoperativo'; f.querySelector('#f-eo').dispatchEvent(new Event('change')); f.requestSubmit(); })()`);
  await espera(300);
  caso("Sin motivo no guarda y lo explica", (await evalua("document.querySelector('#p-aviso').innerText")).includes("motivo") && !(await evalua("!!window.__subido['portal/public/datos/actualizaciones.json']")));
  // Fecha imposible en la bitácora
  await evalua(`(() => { const f = document.querySelector('#p-form'); f.querySelector('#f-motivo').value = 'Prueba'; f.querySelector('#f-ht').value = 'Falla'; f.querySelector('#f-hr').value = 'No enciende'; f.querySelector('#f-hf').value = ''; f.requestSubmit(); })()`);
  await espera(300);
  caso("Un evento sin fecha no se guarda", (await evalua("document.querySelector('#p-aviso').innerText")).includes("fecha"));
  // Cambio válido
  await evalua(`(() => { const f = document.querySelector('#p-form'); f.querySelector('#f-hf').value = '2026-11-15'; f.requestSubmit(); })()`);
  caso("Un cambio válido se guarda", await hasta("document.querySelector('#p-aviso').innerText.startsWith('Guardado')", 5000), await evalua("document.querySelector('#p-aviso').innerText"));
  const subido = await evalua("window.__subido['portal/public/datos/actualizaciones.json']");
  const errs = validarArchivo(subido, codigos, contenedores);
  caso("El archivo subido pasa la misma revisión que la publicación", subido && !errs.length && subido.cambios.length === 3, errs.join("; ") || `${subido?.cambios.length} cambios`);
  caso("Cada cambio lleva autor, fecha, motivo y valor anterior", subido?.cambios.every((x) => x.autor === "RC" && x.motivo === "Prueba" && "antes" in x && !Number.isNaN(Date.parse(x.fecha))));
  caso("Ningún dato del panel lleva el token", !JSON.stringify(subido).includes("github_pat"));
  // Mueble: cambia también el texto de ubicación
  await evalua(`(() => { const f = document.querySelector('#p-form'); f.querySelector('#f-cont').value = 'ARM-01'; f.querySelector('#f-motivo').value = 'Traslado al armario'; f.requestSubmit(); })()`);
  await hasta("document.querySelector('#p-aviso').innerText.startsWith('Guardado')", 5000);
  const subido2 = await evalua("window.__subido['portal/public/datos/actualizaciones.json']");
  const ub = subido2.cambios.filter((x) => x.campo === "Ubicacion_texto" || x.campo === "Contenedor").map((x) => x.valor);
  caso("Cambiar el mueble actualiza contenedor y ubicación", ub.includes("ARM-01") && ub.some((v) => String(v).includes("Armario 1")), ub.join(" | "));
  caso("El segundo guardado agrega, no reemplaza", subido2.cambios.length === 5, `${subido2.cambios.length} cambios`);
  await captura("2_panel_guardado.png");
  // v05b: alta de un bien nuevo (pedido del 15/11)
  await evalua("document.querySelector('#p-nuevo').click()");
  await espera(200);
  caso("El alta propone el número siguiente", (await evalua("document.querySelector('#a-codigo').textContent")).endsWith("LH-EQP-142"), await evalua("document.querySelector('#a-codigo').textContent"));
  await evalua(`(() => { const s = document.querySelector('#a-pref'); s.value = 'MED'; s.dispatchEvent(new Event('change')); })()`);
  caso("El prefijo cambia el código propuesto", (await evalua("document.querySelector('#a-codigo').textContent")).endsWith("LH-MED-142"));
  await evalua(`(() => { const f = document.querySelector('#p-form'); f.querySelector('#f-motivo').value = 'Llegó al laboratorio'; f.requestSubmit(); })()`);
  await espera(300);
  caso("Un alta sin nombre no se guarda", (await evalua("document.querySelector('#p-aviso').innerText")).includes("nombre"));
  await evalua(`(() => { const f = document.querySelector('#p-form'); f.querySelector('#a-nombre').value = 'Rotámetro de prueba'; f.querySelector('#a-ficha').value = 'FOR-VDC-09B'; f.querySelector('#a-marca').value = 'Prueba RT-10'; f.querySelector('#a-cont').value = 'ARM-01'; f.querySelector('#a-eo').value = 'Operativo'; f.requestSubmit(); })()`);
  caso("Un alta válida se guarda con su código", await hasta("document.querySelector('#p-aviso').innerText.startsWith('Agregado: LH-MED-142')", 5000), await evalua("document.querySelector('#p-aviso').innerText"));
  const subido3 = await evalua("window.__subido['portal/public/datos/actualizaciones.json']");
  const errs3 = validarArchivo(subido3, codigos, contenedores);
  const alta = subido3.cambios.find((x) => x.campo === "Alta");
  caso("El alta pasa la misma revisión que la publicación", !errs3.length && alta?.codigo === "LH-MED-142" && alta.valor.Contenedor === "ARM-01" && alta.valor.Ubicacion_texto.includes("Armario 1"), errs3.join("; ") || JSON.stringify(alta?.valor));
  caso("Después del alta, el panel abre el bien nuevo para seguir editándolo", await evalua("document.querySelector('.p-bien .t-codigo')?.textContent === 'LH-MED-142'"));
  await captura("2b_panel_alta.png");
  // Cerrar sesión borra el token
  await evalua("document.querySelector('#p-salir').click()");
  caso("Cerrar sesión borra el token del navegador", (await evalua("localStorage.getItem('labhid-panel')")) === null);

  // El sitio aplica las actualizaciones
  actualizacionesSimuladas = subido3;
  await ir(`${BASE}?id=LH-EQP-065`, 800);
  await hasta("document.querySelector('.codigo')?.textContent === 'LH-EQP-065'");
  const ficha = await evalua("document.querySelector('.ficha').innerText");
  caso("La ficha muestra el cambio y la fecha de actualización", ficha.includes("Inoperativo") && ficha.includes("Actualizado el") && ficha.includes("Armario 1") && ficha.includes("No enciende"));
  caso("El evento nuevo va primero en la bitácora", (await evalua("document.querySelector('.hist li strong')?.textContent")) === "Falla");
  await captura("3_ficha_actualizada.png");
  await ir(`${BASE}?ver=novedades`, 700);
  const nov = await evalua("document.querySelectorAll('.nov-lista li').length");
  // Estado, bitácora y ubicación; la fuente del estado y el código del mueble van con su cambio
  caso("Novedades lista los cambios publicados, con el bien nuevo", nov === 4 && (await evalua("document.body.innerText.includes('Rotámetro de prueba, agregado al inventario')")), `${nov} entradas`);
  caso("Novedades no desborda en celular", await evalua("document.documentElement.scrollWidth <= innerWidth"));
  await captura("4_novedades.png");
  await ir(`${BASE}?ver=novedades&id=LH-EQP-065`, 600);
  caso("Novedades se filtra por equipo", (await evalua("document.querySelectorAll('.nov-lista li').length")) === 3 && (await evalua("document.body.innerText.includes('Ver todas')")));
  await ir(`${BASE}?id=LH-MED-142`, 800);
  const fichaNueva = await hasta("document.querySelector('.codigo')?.textContent === 'LH-MED-142'", 5000);
  caso("El bien nuevo tiene ficha propia (para su QR)", fichaNueva && (await evalua("document.querySelector('.ficha').innerText.includes('Rotámetro de prueba') && document.querySelector('.ficha').innerText.includes('Armario 1')")));
  await captura("3b_ficha_bien_nuevo.png");
  // Un archivo dañado no rompe el sitio
  actualizacionesSimuladas = "{ esto no es json";
  await ir(`${BASE}?id=LH-EQP-065`, 800);
  caso("Si actualizaciones.json está dañado, el portal sigue con el Excel", await hasta("document.querySelector('.codigo')?.textContent === 'LH-EQP-065'", 5000));
  actualizacionesSimuladas = null;

  // Hoja de campo
  await ir(`${BASE}?panel`, 1200);
  await hasta("!!document.querySelector('#t-campo')");
  await evalua(RED_SIMULADA(hoja));
  await evalua("localStorage.removeItem('labhid-campo-hoja'); localStorage.removeItem('labhid-campo-cola')");
  await evalua(`(() => { document.querySelector('#p-token').value = 'github_pat_PRUEBA'; document.querySelector('#p-autor').value = 'RC'; document.querySelector('#p-entrar').requestSubmit(); })()`);
  await hasta("document.body.innerText.includes('Sesión abierta')", 4000);
  await evalua("document.querySelector('#t-campo').click()");
  caso("La hoja de campo carga los 55 ítems", await hasta("document.querySelectorAll('.p-item').length === 55", 5000));
  await evalua(`(() => { const it = document.querySelector('.p-item[data-n="7"]'); it.open = true; const f = it.querySelector('.p-medir'); f.elements.valor.value = '28'; f.requestSubmit(); })()`);
  caso("Una medida dentro de la tolerancia queda OK", await hasta(`document.querySelector('.p-item[data-n="7"] .chip')?.textContent === 'OK'`, 4000));
  await evalua(`(() => { const it = document.querySelector('.p-item[data-n="2"]'); it.open = true; const f = it.querySelector('.p-medir'); f.elements.valor.value = '1100'; f.requestSubmit(); })()`);
  caso("Una medida fuera de la tolerancia queda CORREGIR", await hasta(`document.querySelector('.p-item[data-n="2"] .chip')?.textContent === 'CORREGIR'`, 4000));
  const med = await evalua("window.__subido['campo/mediciones_v06.json']");
  caso("Las medidas se suben al archivo de campo", med?.mediciones?.length === 2, JSON.stringify(med?.mediciones?.map((m) => [m.n, m.valor])));
  // Sin señal en obra
  await evalua("window.__sinRed = true");
  await evalua(`(() => { const it = document.querySelector('.p-item[data-n="45"]'); it.open = true; const f = it.querySelector('.p-medir'); f.elements.valor.value = '25'; f.requestSubmit(); })()`);
  caso("Sin señal, la medida queda en el celular", await hasta("JSON.parse(localStorage.getItem('labhid-campo-cola') || '[]').length === 1 && document.body.innerText.includes('1 sin enviar')", 4000));
  await evalua("window.__sinRed = false");
  await evalua("document.querySelector('#c-enviar').click()");
  caso("Al volver la señal se envía lo pendiente", await hasta("(window.__subido['campo/mediciones_v06.json']?.mediciones?.length ?? 0) === 3 && !localStorage.getItem('labhid-campo-cola')", 5000));
  await captura("5_hoja_campo.png");
  // La hoja quedó guardada para usarla sin señal
  await ir(`${BASE}?panel`, 1200);
  await hasta("!!document.querySelector('#t-campo')");
  await evalua("window.__fetchPanel = async () => { throw new TypeError('Failed to fetch'); }");
  await evalua("document.querySelector('#t-campo').click()");
  caso("Sin señal, la hoja se abre desde el celular", await hasta("document.querySelectorAll('.p-item').length === 55 && document.querySelector('#p-aviso').innerText.includes('hoja guardada')", 5000));
  await evalua("localStorage.clear()");

  // Acerca y modelo v06
  await ir(`${BASE}?ver=acerca`, 800);
  caso("Acerca informa el modelo 3D y su ajuste a la nube", await hasta("document.querySelector('.acerca')?.innerText.includes('LabHid_v06') && document.querySelector('.acerca').innerText.includes('Cortasoles')", 4000));
  await ir(`${BASE}?ver=mapa&prueba=1`, 300);
  caso("El mapa 3D carga el modelo v06", await hasta("window.__visor?.ms > 0", 30000));
  await evalua("window.__visor.saltarVuelo()");
  const inf = await evalua("window.__visor.info()");
  const dist = Math.hypot(inf.cam[0] - inf.obj[0], inf.cam[1] - inf.obj[1], inf.cam[2] - inf.obj[2]);
  // En celular vertical el ancho limita el encuadre; con todo el modelo (veredas y volado) la cámara quedaba más lejos (68 m ya en escritorio)
  caso("El mapa encuadra el edificio, no las veredas ni el volado", inf.tris > 10000 && dist < 85, `${inf.tris} triángulos; cámara a ${dist.toFixed(1)} m`);
  await captura("6_mapa_v06.png");
  await ir(`${BASE}?id=LH-EQP-065&ver=3d&prueba=1`, 300);
  await hasta("window.__visor?.ms > 0", 30000);
  caso("HB015 se marca en el modelo v06", (await evalua("window.__visor.objetivo")) === "bien");
  await evalua("window.__visor.saltarVuelo()");
  await espera(2400);
  await captura("7_HB015_v06.png");

  // v05b y correcciones del 14/11/2026: vistas, cubo, encuadre, corte, colores, cambio de equipo
  const ed = await evalua("window.__visor.edificio()");
  caso("Los ejes del edificio salen de las columnas", ed.conColumnas && ed.largo > 8 && ed.ancho > 8, `${ed.largo} x ${ed.ancho} m`);
  caso("El cubo de vistas se ve en el celular", await evalua("(() => { const c = document.querySelector('.visor-cubo'); const r = c?.getBoundingClientRect(); return !!c && !c.hidden && r.width > 50 && r.right <= innerWidth; })()"));
  const barra = await evalua("[...document.querySelectorAll('.visor-barra button span')].map((s) => s.textContent).join(',')");
  caso("La barra tiene General y «Vista» (antes «Planta»)", barra.includes("General") && barra.includes("Vista") && !barra.includes("Planta"), barra);
  // n.° 3: «Vista» abre un menú chico con cinco opciones
  const opciones = await evalua("[...document.querySelectorAll('.visor-menu-vista [data-vista]')].map((b) => b.textContent).join(',')");
  caso("«Vista» ofrece Planta, Derecha, Izquierda, Atrás y Frontal", opciones === "Planta,Derecha,Izquierda,Atrás,Frontal", opciones);
  await evalua("document.querySelector('[data-menu=vista]').click()");
  await espera(300);
  const mv = await evalua("(() => { const m = document.querySelector('.visor-menu-vista'); const r = m.getBoundingClientRect(); const v = document.querySelector('#visor').getBoundingClientRect(); return { abierto: !m.hidden, dentro: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, parte: (r.width * r.height) / (v.width * v.height) }; })()");
  caso("El menú «Vista» sale chico, junto al botón, sin tapar el modelo", mv.abierto && mv.dentro && mv.parte < 0.08, `ocupa ${(mv.parte * 100).toFixed(1)} % del visor`);
  await captura("8_menu_vista_celular.png");
  await evalua("document.querySelector('.visor-menu-vista [data-vista=planta]').click()");
  caso("Elegir una vista cierra el menú", await evalua("document.querySelector('.visor-menu-vista').hidden"));
  await evalua("window.__visor.saltarVuelo()");
  const ocPlanta = await evalua("window.__visor.ocupacion()");
  caso("La planta sale cerca y alineada al edificio", ocPlanta >= 0.85 && ocPlanta <= 1.15, `ocupa ${Math.round(ocPlanta * 100)} %`);
  // n.° 2: General cercano
  await evalua("document.querySelector('[data-accion=general]').click()");
  await evalua("window.__visor.saltarVuelo()");
  const ocCel = await evalua("window.__visor.ocupacion()");
  caso("«General» en celular llena la zona libre", ocCel >= 0.85 && ocCel <= 1.15, `ocupa ${Math.round(ocCel * 100)} % a ${(await evalua("window.__visor.distancia()")).toFixed(1)} m`);
  await espera(400);
  await captura("9_general_celular.png");
  const caras = {};
  for (const vista of ["frontal", "derecha", "posterior", "izquierda"]) {
    await evalua(`window.__visor.vista('${vista}')`);
    await evalua("window.__visor.saltarVuelo()");
    caras[vista] = await evalua("window.__visor.cubo()");
  }
  caso("El cubo gira con cada vista", caras.frontal.includes("rotateY(0deg)") && caras.derecha.includes("rotateY(-90deg)") && /rotateY\(-?180deg\)/.test(caras.posterior) && caras.izquierda.includes("rotateY(90deg)"), JSON.stringify(caras));
  await evalua("document.querySelector('.cara.frente').click()");
  await evalua("window.__visor.saltarVuelo()");
  caso("Tocar una cara del cubo lleva a esa vista", (await evalua("window.__visor.cubo()")).includes("rotateY(0deg)"));
  // n.° 4: Corte
  await evalua("document.querySelector('[data-menu=corte]').click()");
  await espera(300);
  caso("Tocar «Corte» solo abre su menú, sin cortar", (await evalua("!document.querySelector('.visor-menu-corte').hidden")) && (await evalua("window.__visor.corteA()")) === null);
  await captura("8b_menu_corte_celular.png");
  await evalua("document.querySelector('[data-corte=defecto]').click()");
  await espera(400);
  caso("«Por defecto» corta a 2,2 m del piso", (await evalua("window.__visor.corteA()")) === 2.2, String(await evalua("window.__visor.corteA()")));
  await evalua("document.querySelector('[data-menu=corte]').click()");
  await evalua(`(() => { const i = document.querySelector('.visor-menu-corte input'); i.value = '1.5'; document.querySelector('[data-corte=aplicar]').click(); })()`);
  await espera(400);
  caso("Se puede cortar a la altura que se escriba", (await evalua("window.__visor.corteA()")) === 1.5, String(await evalua("window.__visor.corteA()")));
  await evalua("document.querySelector('[data-menu=corte]').click()");
  await evalua(`(() => { const i = document.querySelector('.visor-menu-corte input'); i.value = '40'; document.querySelector('[data-corte=aplicar]').click(); })()`);
  caso("Una altura imposible no se aplica", (await evalua("window.__visor.corteA()")) === 1.5);
  await evalua("document.querySelector('[data-corte=quitar]').click()");
  await espera(400);
  caso("«Quitar el corte» vuelve al modelo completo", (await evalua("window.__visor.corteA()")) === null);
  // n.° 5: interruptor de colores
  caso("El interruptor de la estructura se ve y empieza en transparente", await evalua("(() => { const b = document.querySelector('.visor-interruptor'); const r = b.getBoundingClientRect(); return b.getAttribute('aria-checked') === 'false' && r.width > 40 && r.right <= innerWidth; })()"));
  await evalua("document.querySelector('.visor-interruptor').click()");
  await espera(600);
  caso("El interruptor pone la estructura en colores", (await evalua("window.__visor.colores()")) === true && (await evalua("document.querySelector('.visor-interruptor').getAttribute('aria-checked')")) === "true");
  await captura("9b_colores_celular.png");
  await evalua("document.querySelector('.visor-interruptor').click()");
  await espera(400);
  caso("Y la vuelve a dejar transparente", (await evalua("window.__visor.colores()")) === false);
  // Volver al equipo, seleccionarlo y tocar un espacio vacío: la selección se mantiene
  await evalua("window.__visor.accion('foco')");
  await evalua("window.__visor.saltarVuelo()");
  const toque = async (x, y) => {
    // Toque real de Chrome (un PointerEvent armado a mano no tiene puntero activo y el control de órbita falla)
    for (const type of ["mousePressed", "mouseReleased"]) await cdp("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
    await espera(600);
  };
  const pf = await evalua("window.__visor.pantallaDe()");
  await toque(pf.x, pf.y);
  const sel1 = await evalua("window.__visor.seleccion()");
  await toque(30, 160);
  const sel2 = await evalua("window.__visor.seleccion()");
  caso("Tocar un espacio vacío no suelta el equipo", sel1?.codigo === "LH-EQP-065" && sel2?.codigo === "LH-EQP-065", `${JSON.stringify(sel1)} → ${JSON.stringify(sel2)}`);
  const nav = await evalua("document.querySelector('.hoja-nav span')?.textContent");
  caso("La hoja muestra la posición entre los equipos con modelo 3D", /^\d de 4 equipos con modelo 3D$/.test(nav ?? ""), nav);
  const sig = await evalua("document.querySelector('.hoja-nav .siguiente').getAttribute('href')");
  await evalua("document.querySelector('.hoja-nav .siguiente').click()");
  await hasta(`location.search.includes('${new URL(sig, BASE).searchParams.get("id")}') && window.__visor?.ms > 0`, 20000);
  await evalua("window.__visor.saltarVuelo()");
  const cod2 = await evalua("window.__visor.codigo");
  caso("La flecha pasa al siguiente equipo y queda marcado", cod2 !== "LH-EQP-065" && (await evalua("window.__visor.objetivo")) === "bien", cod2);
  await espera(2400);
  await captura("10_siguiente_equipo.png");

  // Escritorio
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await ir(`${BASE}?id=LH-EQP-065&ver=3d&prueba=1`, 300);
  await hasta("window.__visor?.ms > 0", 30000);
  // Primero termina el vuelo inicial al equipo; si no, llegaría después y taparía la vista elegida
  await evalua("window.__visor.saltarVuelo()");
  await espera(800);
  await evalua("window.__visor.saltarVuelo()");
  // n.° 1: tocar otro equipo cambia la selección, la cabecera y lleva al equipo
  // Primero se aleja la cámara (planta del entorno del equipo), como haría una persona, para ver el equipo de al lado
  await evalua("window.__visor.accion('planta')");
  await evalua("window.__visor.saltarVuelo()");
  const otro = await evalua("window.__visor.pantallaDeBien('LH-EQP-064')");
  const bajo = await evalua(`(() => { const e = document.elementFromPoint(${otro.x}, ${otro.y}); return e ? e.tagName + '.' + e.className : 'nada'; })()`);
  await toque(otro.x, otro.y);
  const selOtro = await evalua("JSON.stringify(window.__visor?.seleccion?.() ?? null)");
  const cambio = await hasta("location.search.includes('LH-EQP-064') && window.__visor?.codigo === 'LH-EQP-064'", 20000);
  if (!cambio) console.log("diagnóstico tocar otro:", JSON.stringify(otro), bajo, selOtro);
  await evalua("window.__visor.saltarVuelo()");
  const cabeza = await evalua("document.querySelector('.visor-titulo h1')?.textContent");
  caso("Tocar otro equipo lo selecciona: cambia la cabecera y la marca", cambio && cabeza === bienes.find((b) => b.Codigo_LH === "LH-EQP-064").Nombre, cabeza);
  await espera(1500);
  await captura("10b_tocar_otro_equipo_escritorio.png");
  await evalua("window.__visor.vista('general')");
  await evalua("window.__visor.saltarVuelo()");
  const dGen = await evalua("window.__visor.distancia()");
  const ocEsc = await evalua("window.__visor.ocupacion()");
  caso("«General» en escritorio queda cerca y llena la zona libre (antes, 68 m)", dGen < 40 && ocEsc >= 0.85 && ocEsc <= 1.15, `${dGen.toFixed(1)} m; ocupa ${Math.round(ocEsc * 100)} %`);
  caso("En escritorio el cubo no queda bajo el panel del equipo", await evalua("(() => { const a = document.querySelector('.visor-cubo').getBoundingClientRect(); const b = document.querySelector('#visor-hoja').getBoundingClientRect(); return a.top >= b.bottom || a.bottom <= b.top || a.left >= b.right || a.right <= b.left; })()"));
  await espera(500);
  await captura("11_general_escritorio.png");
  await evalua("window.__visor.vista('planta')");
  await evalua("window.__visor.saltarVuelo()");
  await espera(500);
  await captura("12_planta_escritorio.png");
  // Con el mouse, «Vista» se abre solo al pasar por encima
  const bv = await evalua("(() => { const r = document.querySelector('[data-menu=vista]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()");
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: bv.x, y: bv.y });
  await espera(300);
  caso("En escritorio «Vista» se abre al pasar el mouse", await evalua("!document.querySelector('.visor-menu-vista').hidden"));
  caso("El menú sale encima del botón, dentro del visor", await evalua("(() => { const m = document.querySelector('.visor-menu-vista').getBoundingClientRect(); const b = document.querySelector('[data-menu=vista]').getBoundingClientRect(); const v = document.querySelector('#visor').getBoundingClientRect(); return m.bottom <= b.top && m.left >= v.left && m.right <= v.right && m.top >= v.top; })()"));
  await captura("13_menu_vista_escritorio.png");
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: 683, y: 300 });
  await espera(600);
  caso("Y se cierra al salir", await evalua("document.querySelector('.visor-menu-vista').hidden"));
  const bc = await evalua("(() => { const r = document.querySelector('[data-menu=corte]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()");
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: bc.x, y: bc.y });
  await espera(300);
  caso("En escritorio «Corte» se abre al pasar el mouse", await evalua("!document.querySelector('.visor-menu-corte').hidden"));
  await captura("13b_menu_corte_escritorio.png");
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: 683, y: 300 });
  await espera(600);

  // n.° 6: buscador de la barra superior dentro del Mapa 3D
  await ir(`${BASE}?ver=mapa&prueba=1`, 300);
  await hasta("window.__visor?.ms > 0", 30000);
  await evalua(`(() => { const q = document.querySelector('#q-barra'); q.focus(); q.value = 'cavitacion'; q.dispatchEvent(new Event('input')); })()`);
  await espera(200);
  const rb = await evalua("(() => { const l = document.querySelector('#barra-resultados'); return { ver: !l.hidden, texto: l.innerText, href: l.querySelector('a')?.getAttribute('href') }; })()");
  caso("En el Mapa 3D, el buscador de arriba muestra resultados ahí mismo", rb.ver && rb.texto.includes("cavitación") && rb.href?.includes("ver=3d"), rb.href);
  await captura("14_buscador_mapa.png");
  await evalua("document.querySelector('#barra-resultados a').click()");
  caso("Elegir un resultado lleva directo al equipo en el 3D", await hasta("location.search.includes('LH-EQP-109') && location.search.includes('ver=3d') && window.__visor?.codigo === 'LH-EQP-109'", 20000));

  // n.° 7: filtro Mobiliario
  await ir(BASE, 900);
  await hasta("!!document.querySelector('[data-tipo=MOB]')", 5000);
  await evalua("document.querySelector('[data-tipo=MOB]').click()");
  await espera(300);
  const nMob = bienes.filter((b) => b.Codigo_LH.startsWith("LH-MOB-")).length;
  const conteoMob = await evalua("document.querySelector('#conteo').textContent");
  caso("El filtro «Mobiliario» lista los muebles", conteoMob === `${nMob} bienes`, `${conteoMob} (esperado ${nMob})`);
  await captura("15_mobiliario.png");
  await evalua("document.querySelector('[data-tipo=\"\"]').click()");

  // n.° 8: el equipo en 3D junto a su foto
  await ir(`${BASE}?id=LH-EQP-065&prueba=1`, 900);
  caso("La ficha muestra el equipo en 3D junto a la foto", await hasta("window.__mini?.codigo === 'LH-EQP-065' && !document.querySelector('.heroe-3d').hidden && window.__mini.info().tris > 0", 20000), JSON.stringify(await evalua("window.__mini?.info?.()")));
  await espera(800);
  await captura("16_ficha_3d_escritorio.png");
  await ir(`${BASE}?id=LH-EQP-087&prueba=1`, 900);
  await hasta("document.querySelector('.codigo')?.textContent === 'LH-EQP-087'", 5000);
  await espera(800);
  caso("Un equipo sin modelo propio no muestra el 3D", await evalua("document.querySelector('.heroe-3d')?.hidden === true"));
  // n.° 9: Inspection Tag
  caso("Un equipo ESSOM sin foto de la placa dice «Inspection Tag pendiente»", await evalua("document.querySelector('.placa-acciones').innerText.includes('Inspection Tag pendiente')"));
  actualizacionesSimuladas = { version: 1, cambios: [{ id: "20261119T1200-tag1", codigo: "LH-EQP-087", campo: "Inspection_tag", antes: "", valor: "fotos/LH-EQP-087.webp", fecha: "2026-11-19T12:00:00.000Z", autor: "DU", motivo: "Prueba" }] };
  await ir(`${BASE}?id=LH-EQP-087&prueba=1`, 900);
  await hasta("!!document.querySelector('[data-tag]')", 5000);
  await evalua("document.querySelector('[data-tag]').click()");
  await espera(400);
  caso("«Abrir Inspection Tag» muestra la foto de la placa", await evalua("(() => { const d = document.querySelector('.tag-dialogo'); return !!d?.open && d.querySelector('img').getAttribute('src').endsWith('LH-EQP-087.webp'); })()"));
  await captura("17_inspection_tag.png");
  await evalua("document.querySelector('.tag-dialogo [data-cerrar]').click()");
  actualizacionesSimuladas = null;
  // Celular: el 3D de la ficha espera un toque
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await ir(`${BASE}?id=LH-EQP-065&prueba=1`, 900);
  caso("En celular el 3D de la ficha se carga al tocar (cuida los datos)", await hasta("!!document.querySelector('.heroe-3d-boton')", 8000));
  await evalua("document.querySelector('.heroe-3d-boton').click()");
  caso("Y al tocarlo aparece el equipo", await hasta("window.__mini?.codigo === 'LH-EQP-065' && window.__mini.info().tris > 0", 20000));
  await espera(800);
  await captura("18_ficha_3d_celular.png");
  caso("Sin errores en la consola", consola.length === 0, consola.slice(0, 5).join(" | "));
} catch (e) {
  caso("La prueba terminó sin excepción", false, String(e?.message ?? e));
} finally {
  const fal = res.filter((r) => !r.ok);
  const texto = res.map((r) => `${r.ok ? "OK   " : "FALLA"} ${r.nombre}${r.detalle ? `  [${r.detalle}]` : ""}`).join("\n");
  fs.writeFileSync(path.join(RAIZ, "integridad", "resultado_v05.txt"), `${texto}\n\nTotal: ${res.length} | OK: ${res.length - fal.length} | Fallas: ${fal.length}\n`);
  console.log(`Total: ${res.length} | OK: ${res.length - fal.length} | Fallas: ${fal.length}`);
  chrome.kill();
  await espera(800);
  fs.rmSync(perfil, { recursive: true, force: true, maxRetries: 5 });
  process.exit(fal.length ? 1 : 0);
}
