// Convierte un IFC a .frag para que el celular no tenga que procesar el IFC.
// Uso: node ifc_a_frag.mjs modelo.ifc salida.frag
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const requerir = createRequire(path.join(aqui, "..", "portal", "package.json"));
const FRAGS = await import(
  "file://" + requerir.resolve("@thatopen/fragments").replace(/\\/g, "/").replace(/index\.cjs$/, "index.mjs")
);

const [entrada, salida] = process.argv.slice(2);
const carpetaWasm = path.dirname(requerir.resolve("web-ifc")).replace(/\\/g, "/") + "/";

const importador = new FRAGS.IfcImporter();
importador.wasm = { absolute: true, path: carpetaWasm };
importador.doubleSidedMaterials = true; // Revit no siempre exporta caras con orden coherente
// El sitio público lleva solo geometría e identificadores: los parámetros del modelo
// (incluido el código patrimonial) se quedan fuera. El portal une datos con el índice.
importador.classes.abstract.clear();
importador.relations.clear();

const inicio = Date.now();
const bytes = fs.readFileSync(entrada);
const frag = await importador.process({ bytes });
fs.writeFileSync(salida, frag);
const crudo = Buffer.from(await importador.process({ bytes, raw: true }));
for (const prohibido of process.argv.slice(4)) {
  if (crudo.includes(prohibido) || crudo.includes(Buffer.from(prohibido, "utf16le"))) {
    fs.rmSync(salida);
    console.error(`ERROR: el valor protegido "${prohibido}" sigue en el .frag. No se generó.`);
    process.exit(1);
  }
}
console.log(
  `IFC ${(bytes.length / 1048576).toFixed(2)} MB -> FRAG ${(frag.length / 1048576).toFixed(2)} MB en ${((Date.now() - inicio) / 1000).toFixed(1)} s`,
);
process.exit(0);
