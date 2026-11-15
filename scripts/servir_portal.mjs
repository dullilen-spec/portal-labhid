// v03 PRUEBA: sirve el sitio ya construido (portal/dist) sin instalar nada más que Node.
// Uso: node scripts/servir_portal.mjs [puerto]   (por defecto 4175)
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "portal", "dist");
const PUERTO = Number(process.argv[2]) || 4175;
// Segundo argumento opcional: 0.0.0.0 para abrirlo desde un celular en el mismo Wi-Fi
const HOST = process.argv[3] || "127.0.0.1";
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".frag": "application/octet-stream",
};

if (!fs.existsSync(path.join(RAIZ, "index.html"))) {
  console.error(`No existe ${RAIZ}\\index.html. Construye el sitio primero (npm run build).`);
  process.exit(1);
}

http
  .createServer((req, res) => {
    let ruta = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (ruta.endsWith("/")) ruta += "index.html";
    const archivo = path.normalize(path.join(RAIZ, ruta));
    // No se sirve nada fuera de dist
    if (!archivo.startsWith(RAIZ)) {
      res.writeHead(403).end();
      return;
    }
    fs.stat(archivo, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("No encontrado");
        return;
      }
      res.writeHead(200, {
        "Content-Type": TIPOS[path.extname(archivo).toLowerCase()] ?? "application/octet-stream",
        "Content-Length": st.size,
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(archivo).pipe(res);
    });
  })
  .listen(PUERTO, HOST, () => {
    if (HOST !== "0.0.0.0") {
      console.log(`Portal v03 PRUEBA en http://${HOST}:${PUERTO}/  (cierra esta ventana para detenerlo)`);
      return;
    }
    // 0.0.0.0 solo indica "escuchar en todas las redes": no se escribe en el celular. Se muestran las IP reales
    const ips = Object.values(os.networkInterfaces())
      .flat()
      .filter((i) => i && i.family === "IPv4" && !i.internal && !i.address.startsWith("169.254"))
      .map((i) => i.address);
    console.log("\nPortal v03 PRUEBA listo. En el celular (mismo Wi-Fi que esta PC) escribe en Chrome:\n");
    for (const ip of ips) console.log(`    http://${ip}:${PUERTO}/`);
    console.log("\nNo uses 0.0.0.0. Cierra esta ventana para detenerlo.");
  });
