// v05b: mide la carga del portal en un celular con la red y el procesador limitados, como Lighthouse en celular
// (4G lenta: 1,47 Mb/s, 562 ms de ida y vuelta, procesador 4 veces más lento). Cada medida empieza sin caché.
// Metas propuestas el 15/11/2026: primera pantalla en menos de 3 s con 4G y modelo 3D de 3 MB o menos.
// Uso: node scripts/medir_rendimiento.mjs [http://127.0.0.1:4173/]
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.argv[2] ?? "http://127.0.0.1:4173/";
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const REDES = {
  "4G lenta (Lighthouse)": { latency: 562.5, downloadThroughput: (1474.56 * 1024) / 8, uploadThroughput: (675 * 1024) / 8, cpu: 4 },
  "4G normal": { latency: 170, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8, cpu: 4 },
};

async function medir(red, url, listo) {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-rend-"));
  const chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless=new", "--remote-debugging-port=9335", `--user-data-dir=${perfil}`, "--no-first-run",
    "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "about:blank",
  ], { stdio: "ignore" });
  let info;
  for (let i = 0; i < 40 && !info; i++) {
    await espera(250);
    info = await fetch("http://127.0.0.1:9335/json/list").then((r) => r.json()).catch(() => null);
  }
  const ws = new WebSocket(info.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let n = 0;
  const pend = new Map();
  let bytes = 0;
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)(m.result);
      pend.delete(m.id);
    } else if (m.method === "Network.loadingFinished") bytes += m.params.encodedDataLength;
  };
  const cdp = (method, params = {}) => new Promise((res) => {
    const id = ++n;
    pend.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalua = async (expression) => (await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }))?.result?.value;
  try {
    await cdp("Network.enable");
    await cdp("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp("Network.emulateNetworkConditions", { offline: false, latency: red.latency, downloadThroughput: red.downloadThroughput, uploadThroughput: red.uploadThroughput });
    await cdp("Emulation.setCPUThrottlingRate", { rate: red.cpu });
    await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await cdp("Page.enable");
    await cdp("Page.navigate", { url });
    let t = null;
    const fin = Date.now() + 90000;
    while (Date.now() < fin && t === null) {
      await espera(100);
      t = await evalua(`(${listo}) ? performance.now() : null`).catch(() => null);
    }
    const fcp = await evalua("performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null");
    const lcp = await evalua("new Promise((r) => { new PerformanceObserver((l) => r(l.getEntries().at(-1)?.startTime ?? null)).observe({ type: 'largest-contentful-paint', buffered: true }); setTimeout(() => r(null), 1500); })");
    return { listo: t, fcp, lcp, kb: bytes / 1024 };
  } finally {
    chrome.kill();
    await espera(600);
    fs.rmSync(perfil, { recursive: true, force: true, maxRetries: 5 });
  }
}

const s = (ms) => (ms == null ? "sin dato" : `${(ms / 1000).toFixed(2)} s`);
const lineas = [`Medido el ${new Date().toLocaleString("es-PE")} en ${BASE}`, ""];
const frag = fs.statSync(path.join(RAIZ, "portal", "public", "modelo", "modelo.frag")).size / 1048576;
lineas.push(`Modelo 3D (modelo.frag): ${frag.toFixed(2)} MB  ${frag <= 3 ? "OK" : "SOBRE LA META"} (meta: 3 MB o menos)`, "");
for (const [nombre, red] of Object.entries(REDES)) {
  const ficha = await medir(red, `${BASE}?id=LH-EQP-065`, "document.querySelector('.codigo')?.textContent === 'LH-EQP-065'");
  const mapa = await medir(red, `${BASE}?id=LH-EQP-065&ver=3d&prueba=1`, "window.__visor?.ms > 0");
  lineas.push(
    `${nombre}:`,
    `  Ficha por QR: primera pintura ${s(ficha.fcp)}, ficha lista ${s(ficha.listo)} ${ficha.listo < 3000 ? "OK" : "SOBRE LA META"} (meta: menos de 3 s), ${ficha.kb.toFixed(0)} KB`,
    `  Mapa 3D con el equipo marcado: listo en ${s(mapa.listo)}, ${mapa.kb.toFixed(0)} KB descargados`,
    "",
  );
}
fs.mkdirSync(path.join(RAIZ, "integridad"), { recursive: true });
fs.writeFileSync(path.join(RAIZ, "integridad", "rendimiento.txt"), `${lineas.join("\n")}\n`);
console.log(lineas.join("\n"));
