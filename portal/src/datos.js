import { MANUALES_PUBLICADOS } from "./config.js";

// v05: los datos de cada bien salen de bienes.json (Excel maestro) y, encima, de actualizaciones.json
// (lo que el técnico cambia desde el panel). Gana siempre el cambio más reciente de cada campo.

// v05b: un bien dado de alta en el panel tiene los mismos campos que los del Excel; lo que no se pidió queda «Pendiente».
// scripts/sincronizar_excel.py usa los mismos valores al pasarlo al Excel maestro
export function nuevoBien(x) {
  const v = x.valor;
  const p = (k) => (v[k] ?? "").trim() || "Pendiente";
  return {
    Codigo_LH: x.codigo, En_muestra: "No", Foto: "", Nombre: v.Nombre.trim(), Nombre_oficial: "Pendiente",
    Marca_modelo: p("Marca_modelo"), Fabricante: p("Fabricante"), Serie: p("Serie"), Tipo_ficha: v.Tipo_ficha || "Sin ficha",
    Estrato: "", Descripcion_uso: p("Descripcion_uso"), Equipo_padre: "", Componentes: "",
    Contenedor: v.Contenedor || "Pendiente", Ubicacion_texto: p("Ubicacion_texto"), Ubicacion_estado: "Por confirmar en campo",
    Estado_operativo: v.Estado_operativo || "Pendiente", Estado_operativo_fuente: `Alta en el portal (${x.autor})`,
    Estado_conservacion: v.Estado_conservacion || "Pendiente", Funcion_medicion: "Pendiente", Estado_metrologico: "Pendiente",
    Proxima_fecha: "Pendiente", Verificacion_inicial: "Pendiente", Plan_mantenimiento: "Pendiente", Software_firmware: "Pendiente",
    Ultima_OT: "Pendiente", Manual_fabrica: "", Manual_fabrica_URL: "", Manual_operacion_URL: "", Inspection_tag: "",
    V3_pregunta: "Pendiente", V3_respuesta: "Pendiente", V3_fuente: "Pendiente", Especificaciones: [], Historial: [],
  };
}

export function aplicarCambios(bienes, cambios) {
  const porCodigo = new Map(bienes.map((b) => [b.Codigo_LH, b]));
  const orden = [...cambios].sort((x, y) => Date.parse(x.fecha) - Date.parse(y.fecha));
  for (const x of orden) {
    if (x.campo === "Alta") {
      // Si ya está en el Excel (después de sincronizar), manda el Excel
      if (porCodigo.has(x.codigo)) continue;
      const n = { ...nuevoBien(x), _alta: true, _cambios: [x], _actualizado: x.fecha };
      bienes.push(n);
      porCodigo.set(x.codigo, n);
      continue;
    }
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
  // v05b: los dos archivos se piden a la vez; en 4G lenta, uno detrás del otro sumaba medio segundo
  const actualizaciones = leerActualizaciones();
  const r = await fetch("./datos/bienes.json", { cache: "no-cache" });
  if (!r.ok) throw new Error(`No se pudo leer los datos (${r.status})`);
  const bienes = (await r.json()).bienes;
  // Un enlace a un manual que no viaja con el sitio daría error: se muestra como «Sin cargar»
  if (!MANUALES_PUBLICADOS) {
    for (const b of bienes) {
      for (const c of ["Manual_fabrica_URL", "Manual_operacion_URL"]) if (b[c] && !b[c].startsWith("https://")) b[c] = "";
    }
  }
  const cambios = await actualizaciones;
  aplicarCambios(bienes, cambios);
  return { bienes, cambios };
}

export function fechaCorta(iso) {
  const f = new Date(iso);
  if (Number.isNaN(f.getTime())) return "";
  return f.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
