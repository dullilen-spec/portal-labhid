// v05: revisa portal/public/datos/actualizaciones.json antes de publicar. Usa las mismas reglas que el panel
// (portal/src/esquema.js). Si algo falla, termina con error y GitHub Actions no publica: queda el sitio anterior.
// Uso: node scripts/validar_actualizaciones.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validarArchivo } from "../portal/src/esquema.js";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLICO = path.join(RAIZ, "portal", "public");
const leer = (p) => JSON.parse(fs.readFileSync(path.join(PUBLICO, p), "utf8"));

const bienes = leer("datos/bienes.json").bienes;
const codigos = new Set(bienes.map((b) => b.Codigo_LH));
const contenedores = new Set(bienes.map((b) => b.Contenedor).filter((c) => c && c !== "Pendiente"));
const ruta = path.join(PUBLICO, "datos", "actualizaciones.json");
if (!fs.existsSync(ruta)) {
  console.log("Sin actualizaciones: se publica solo lo del Excel.");
  process.exit(0);
}
const datos = leer("datos/actualizaciones.json");
const errores = validarArchivo(datos, codigos, contenedores);
for (const x of datos.cambios ?? []) {
  if ((x.campo === "Foto" || x.campo === "Inspection_tag") && !fs.existsSync(path.join(PUBLICO, x.valor))) errores.push(`${x.codigo}: la foto ${x.valor} no está en el repositorio`);
}
if (errores.length) {
  console.error(`actualizaciones.json tiene ${errores.length} problema(s). No se publica.`);
  for (const e of errores) console.error(" -", e);
  process.exit(1);
}
console.log(`OK: ${datos.cambios.length} cambio(s) válidos en actualizaciones.json`);
