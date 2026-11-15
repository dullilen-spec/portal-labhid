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
  // Cerrar sesión borra el token
  await evalua("document.querySelector('#p-salir').click()");
  caso("Cerrar sesión borra el token del navegador", (await evalua("localStorage.getItem('labhid-panel')")) === null);

  // El sitio aplica las actualizaciones
  actualizacionesSimuladas = subido2;
  await ir(`${BASE}?id=LH-EQP-065`, 800);
  await hasta("document.querySelector('.codigo')?.textContent === 'LH-EQP-065'");
  const ficha = await evalua("document.querySelector('.ficha').innerText");
  caso("La ficha muestra el cambio y la fecha de actualización", ficha.includes("Inoperativo") && ficha.includes("Actualizado el") && ficha.includes("Armario 1") && ficha.includes("No enciende"));
  caso("El evento nuevo va primero en la bitácora", (await evalua("document.querySelector('.hist li strong')?.textContent")) === "Falla");
  await captura("3_ficha_actualizada.png");
  await ir(`${BASE}?ver=novedades`, 700);
  const nov = await evalua("document.querySelectorAll('.nov-lista li').length");
  // Estado, bitácora y ubicación; la fuente del estado y el código del mueble van con su cambio
  caso("Novedades lista los cambios publicados", nov === 3, `${nov} entradas`);
  caso("Novedades no desborda en celular", await evalua("document.documentElement.scrollWidth <= innerWidth"));
  await captura("4_novedades.png");
  await ir(`${BASE}?ver=novedades&id=LH-EQP-065`, 600);
  caso("Novedades se filtra por equipo", (await evalua("document.querySelectorAll('.nov-lista li').length")) === 3 && (await evalua("document.body.innerText.includes('Ver todas')")));
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
