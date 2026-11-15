// v03 PRUEBA: capturas de revisión del rediseño. Chrome sin ventana, perfil temporal, celular emulado.
// Uso: node scripts/capturas_v03.mjs <carpeta_salida>   (requiere el sitio en http://127.0.0.1:4173/)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SAL = path.resolve(process.argv[2] ?? "capturas");
fs.mkdirSync(SAL, { recursive: true });
const BASE = "http://127.0.0.1:4173/";
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-capturas-"));
const chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
  "--headless=new", "--remote-debugging-port=9334", `--user-data-dir=${perfil}`, "--no-first-run",
  "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--hide-scrollbars", "about:blank",
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
const pend = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m);
    pend.delete(m.id);
  }
};
const cdp = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++n;
    pend.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
const evalua = async (expression) => (await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value;

async function captura(nombre, url, { ancho = 390, alto = 844, movil = true, completa = false, espera: ms = 1500, antes = "" } = {}) {
  await cdp("Emulation.setDeviceMetricsOverride", { width: ancho, height: alto, deviceScaleFactor: 1, mobile: movil });
  await cdp("Page.navigate", { url: BASE + url });
  await espera(ms);
  await evalua("document.fonts.ready.then(() => true)");
  if (antes) await evalua(antes);
  await espera(300);
  const desborde = await evalua("document.documentElement.scrollWidth - innerWidth");
  let clip;
  if (completa) {
    // La barra fija se repetiría a media página en la captura completa
    await evalua("document.querySelector('.nav').style.display = 'none'");
    const h = await evalua("Math.ceil(document.documentElement.scrollHeight)");
    clip = { x: 0, y: 0, width: ancho, height: h, scale: 1 };
  }
  const { data } = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: completa, ...(clip ? { clip } : {}) });
  fs.writeFileSync(path.join(SAL, `${nombre}.png`), Buffer.from(data, "base64"));
  console.log(`${nombre}: desborde horizontal ${desborde} px`);
}

await cdp("Page.enable");
await cdp("Runtime.enable");
if (process.argv[3] === "inventario") {
  const esc = { ancho: 1366, alto: 900, movil: false };
  // Carga: perfil nuevo, sin service worker y con la descarga del modelo retenida, para ver los tubos
  await cdp("Network.enable");
  await cdp("Network.setBypassServiceWorker", { bypass: true });
  await cdp("Fetch.enable", { patterns: [{ urlPattern: "*modelo.frag*" }] });
  await captura("i0_carga_tubos", "?ver=mapa&prueba=1", { espera: 2500 });
  await cdp("Fetch.disable");
  await captura("i1_inventario_tabla", "?q=", esc);
  await captura("i2_inventario_por_ubicacion", "?q=", {
    ...esc,
    antes: "(() => { document.querySelector('[data-orden=\"ubicacion\"]').click(); return true; })()",
  });
  await captura("i3_inventario_filtrado", "?q=armario", esc);
  ws.close();
  chrome.kill();
  process.exit(0);
}
if (process.argv[3] === "visor") {
  // Iteración 2: visor espacial. Se espera a que termine el vuelo de la cámara
  const listo = { espera: 9000, antes: "window.__visor?.saltarVuelo?.().then(() => true) ?? true" };
  await captura("v1_visor_celular_HB015", "?id=LH-EQP-065&ver=3d&prueba=1", listo);
  await captura("v2_visor_celular_mapa", "?ver=mapa&prueba=1", listo);
  await captura("v3_visor_celular_armario", "?id=LH-TEC-065.01&ver=3d&prueba=1", listo);
  await captura("v4_visor_escritorio_HB015", "?id=LH-EQP-065&ver=3d&prueba=1", { ...listo, ancho: 1366, alto: 900, movil: false });
  await captura("v5_visor_escritorio_mapa", "?ver=mapa&prueba=1", {
    ...listo, ancho: 1366, alto: 900, movil: false,
    antes: "(async () => { document.querySelector('[data-mueble=\"ARM-01\"]')?.click(); return true; })()",
  });
  await captura("v6_visor_horizontal", "?id=LH-EQP-065&ver=3d&prueba=1", { ...listo, ancho: 844, alto: 390 });
  ws.close();
  chrome.kill();
  process.exit(0);
}
await captura("1_busqueda_HB015", "?q=HB015");
await captura("2_ficha_celular", "?id=LH-EQP-065");
await captura("3_ficha_completa", "?id=LH-EQP-065", { completa: true });
await captura("4_ficha_sin_ubicacion", "?id=LH-EQP-087", { completa: true });
await captura("5_inicio_escritorio", "?q=", { ancho: 1366, alto: 900, movil: false });
await captura("6_ficha_escritorio", "?id=LH-EQP-065", { ancho: 1366, alto: 900, movil: false, completa: true });
await captura("7_volver_conserva_busqueda", "", {
  antes: `(async () => {
    const q = document.querySelector('#q'); q.value = 'manometro'; q.dispatchEvent(new Event('input'));
    document.querySelector('[data-tipo="FOR-VDC-09B"]').click();
    document.querySelector('.tarjeta').click(); await new Promise((r) => setTimeout(r, 600));
    document.querySelector('.volver').click(); await new Promise((r) => setTimeout(r, 600));
    return true; })()`,
});
ws.close();
chrome.kill();
