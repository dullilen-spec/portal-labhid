import { MANUALES_PUBLICADOS } from "./config.js";

// v05: los datos de cada bien salen de bienes.json (Excel maestro) y, encima, de actualizaciones.json
// (lo que el técnico cambia desde el panel). Gana siempre el cambio más reciente de cada campo.

export function aplicarCambios(bienes, cambios) {
  const porCodigo = new Map(bienes.map((b) => [b.Codigo_LH, b]));
  const orden = [...cambios].sort((x, y) => Date.parse(x.fecha) - Date.parse(y.fecha));
  for (const x of orden) {
    const b = porCodigo.get(x.codigo);
    if (!b) continue;
    if (x.campo === "Historial") b.Historial = [...b.Historial, { ...x.valor, nuevo: true }];
    else b[x.campo] = x.valor;
    (b._cambios ??= []).push(x);
    b._actualizado = x.fecha;
  }
  return bienes;
}

export async function leerActualizaciones() {
  // Si el archivo falta o no se puede leer, el portal sigue con los datos del Excel
  try {
    const r = await fetch("./datos/actualizaciones.json", { cache: "no-cache" });
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d.cambios) ? d.cambios : [];
  } catch {
    return [];
  }
}

export async function cargarDatos() {
  const r = await fetch("./datos/bienes.json", { cache: "no-cache" });
  if (!r.ok) throw new Error(`No se pudo leer los datos (${r.status})`);
  const bienes = (await r.json()).bienes;
  // Un enlace a un manual que no viaja con el sitio daría error: se muestra como «Sin cargar»
  if (!MANUALES_PUBLICADOS) {
    for (const b of bienes) {
      for (const c of ["Manual_fabrica_URL", "Manual_operacion_URL"]) if (b[c] && !b[c].startsWith("https://")) b[c] = "";
    }
  }
  const cambios = await leerActualizaciones();
  aplicarCambios(bienes, cambios);
  return { bienes, cambios };
}

export function fechaCorta(iso) {
  const f = new Date(iso);
  if (Number.isNaN(f.getTime())) return "";
  return f.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
