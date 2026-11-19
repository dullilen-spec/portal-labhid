// v05: reglas de lo que se puede actualizar desde el panel. Las usa el panel antes de guardar y
// scripts/validar_actualizaciones.mjs antes de publicar. Son las mismas listas del Excel maestro
// (scripts/excel_a_json.py): un valor que el Excel rechazaría tampoco se acepta aquí.
// Este archivo no usa el navegador: Node lo importa tal cual.

const FECHA = /^\d{2}\/\d{2}\/\d{4}$/;
export const RX_CODIGO = /^LH-[A-Z]{3}-\d{3}(\.\d{2}){0,2}$/;
// Un número de 12 dígitos seguidos es un código patrimonial: nunca se publica
const RX_PATRIMONIAL = /\b\d{12}\b/;

// v05b: alta de un bien nuevo desde el panel (pedido del 15/11). La numeración es una sola para todos los
// prefijos (hoy llega a 141) y el prefijo dice qué es, según los bienes ya registrados en el Excel maestro
export const PREFIJOS = {
  EQP: "Equipo de ensayo o componente",
  MED: "Instrumento de medición",
  TEC: "Interfaz, software o adquisición de datos",
  HRR: "Herramienta o accesorio",
  CON: "Consumible o material de vidrio",
  MOB: "Mobiliario",
  SEG: "Seguridad",
};
export const TIPOS_FICHA = {
  "FOR-VDC-09A": "Equipo de ensayo",
  "FOR-VDC-09B": "Instrumento de medición",
  "FOR-VDC-09C": "Módulo o accesorio de ensayo",
  "FOR-VDC-09D": "Patrón o material de referencia",
  "FOR-VDC-09E": "Adquisición de datos y software",
  "Sin ficha": "Sin ficha (herramienta, mobiliario o consumible)",
};
const ESTADOS_OPERATIVOS = ["Operativo", "Observado", "Inoperativo", "Pendiente"];
const ESTADOS_CONSERVACION = ["Bueno", "Regular", "Malo", "Pendiente"];
// Lo que se pide al dar de alta; lo demás queda «Pendiente» hasta que se registre en el Excel
export const CAMPOS_ALTA = {
  Nombre: { texto: 120, obligatorio: true },
  Tipo_ficha: { lista: Object.keys(TIPOS_FICHA) },
  Marca_modelo: { texto: 120 },
  Fabricante: { texto: 80 },
  Serie: { texto: 60 },
  Descripcion_uso: { texto: 600 },
  Contenedor: { contenedor: true },
  Ubicacion_texto: { texto: 160 },
  Estado_operativo: { lista: ESTADOS_OPERATIVOS },
  Estado_conservacion: { lista: ESTADOS_CONSERVACION },
};
const numeroDe = (codigo) => codigo.split("-")[2]?.slice(0, 3);
export function siguienteCodigo(prefijo, codigos) {
  const max = Math.max(0, ...[...codigos].map((c) => Number(numeroDe(c)) || 0));
  return `LH-${prefijo}-${String(max + 1).padStart(3, "0")}`;
}

export const TIPOS_EVENTO = ["Mantenimiento", "Calibración", "Verificación", "Traslado", "Falla", "Reparación", "Observación"];

// Solo estos campos se pueden cambiar desde el panel. Los demás salen del Excel maestro.
export const CAMPOS = {
  Estado_operativo: { rotulo: "Estado operativo", lista: ESTADOS_OPERATIVOS },
  Estado_operativo_fuente: { rotulo: "Fuente del estado", texto: 120 },
  Estado_conservacion: { rotulo: "Estado de conservación", lista: ESTADOS_CONSERVACION },
  Estado_metrologico: {
    rotulo: "Estado metrológico",
    lista: ["Calibrado", "Verificado internamente", "Calibración de fábrica no documentada", "No calibrado", "No aplica", "Pendiente"],
  },
  Proxima_fecha: { rotulo: "Próxima calibración o verificación", fecha: ["Pendiente", "No aplica"] },
  Ultima_OT: { rotulo: "Última orden de trabajo", texto: 80 },
  Contenedor: { rotulo: "Mueble o zona", contenedor: true },
  Ubicacion_texto: { rotulo: "Ubicación", texto: 160 },
  Ubicacion_estado: { rotulo: "Estado de la ubicación", texto: 120 },
  Foto: { rotulo: "Fotografía", foto: true },
  // Correcciones del 14/11 (n.° 9): foto de la placa «Inspection Tag» del fabricante
  Inspection_tag: { rotulo: "Placa Inspection Tag", foto: true },
  Historial: { rotulo: "Bitácora", evento: true },
  Alta: { rotulo: "Bien nuevo", alta: true },
};

export function fechaValida(t) {
  if (!FECHA.test(t)) return false;
  const [d, m, a] = t.split("/").map(Number);
  const f = new Date(a, m - 1, d);
  return f.getFullYear() === a && f.getMonth() === m - 1 && f.getDate() === d && a >= 2000 && a <= 2100;
}

function textoLimpio(v, max) {
  if (typeof v !== "string") return "debe ser texto";
  if (v.length > max) return `no puede pasar de ${max} caracteres`;
  if (RX_PATRIMONIAL.test(v)) return "contiene un número de 12 dígitos, como un código patrimonial";
  if (/[<>]/.test(v)) return "no puede llevar los signos < o >";
  return "";
}

// Devuelve "" si el valor sirve para ese campo; si no, el motivo
export function validarValor(campo, valor, contenedores) {
  const c = CAMPOS[campo];
  if (!c) return `el campo ${campo} no se puede actualizar desde el panel`;
  if (c.lista) return c.lista.includes(valor) ? "" : `debe ser uno de: ${c.lista.join(", ")}`;
  if (c.fecha) return c.fecha.includes(valor) || fechaValida(valor) ? "" : "debe ser una fecha dd/mm/aaaa, Pendiente o No aplica";
  if (c.texto) return textoLimpio(valor, c.texto);
  if (c.contenedor) {
    if (valor === "Pendiente") return "";
    if (typeof valor !== "string" || !/^[A-Z0-9-]{2,20}$/.test(valor)) return "no es un código de contenedor";
    return !contenedores || contenedores.has(valor) ? "" : `el contenedor ${valor} no existe`;
  }
  if (c.foto) return typeof valor === "string" && /^fotos\/[A-Za-z0-9._-]{3,80}\.webp$/.test(valor) ? "" : "debe ser una foto .webp de la carpeta fotos";
  if (c.alta) {
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return "el bien nuevo debe traer sus datos";
    for (const k of Object.keys(valor)) if (!CAMPOS_ALTA[k]) return `el dato ${k} no se pide al dar de alta`;
    for (const [k, r] of Object.entries(CAMPOS_ALTA)) {
      const x = valor[k];
      if (x === undefined || x === "") {
        if (r.obligatorio) return `falta ${k === "Nombre" ? "el nombre" : k}`;
        continue;
      }
      const e = r.lista ? (r.lista.includes(x) ? "" : `debe ser uno de: ${r.lista.join(", ")}`) : r.contenedor ? validarValor("Contenedor", x, contenedores) : textoLimpio(x, r.texto);
      if (e) return `${k}: ${e}`;
    }
    return valor.Nombre.trim().length >= 3 ? "" : "el nombre es muy corto";
  }
  if (c.evento) {
    if (!valor || typeof valor !== "object") return "el evento debe traer fecha, tipo y resultado";
    if (!fechaValida(valor.fecha ?? "")) return "la fecha del evento debe ser dd/mm/aaaa";
    if (!TIPOS_EVENTO.includes(valor.tipo)) return `el tipo de evento debe ser uno de: ${TIPOS_EVENTO.join(", ")}`;
    const e = textoLimpio(valor.resultado ?? "", 300);
    if (e) return `el resultado ${e}`;
    return (valor.resultado ?? "").trim() ? "" : "falta describir el resultado";
  }
  return "campo sin regla";
}

// Revisa un cambio completo. `codigos` y `contenedores` son conjuntos con lo que existe en bienes.json
export function validarCambio(x, codigos, contenedores) {
  const errores = [];
  if (!x || typeof x !== "object") return ["el cambio no es un objeto"];
  if (typeof x.id !== "string" || !/^[A-Za-z0-9-]{6,40}$/.test(x.id)) errores.push("falta el identificador del cambio");
  if (typeof x.codigo !== "string" || !RX_CODIGO.test(x.codigo)) errores.push("el código del bien no es válido");
  else if (x.campo === "Alta") {
    // Un bien nuevo lleva un código propio (sin sufijo de componente) con un número que nadie use
    if (!/^LH-[A-Z]{3}-\d{3}$/.test(x.codigo) || !PREFIJOS[x.codigo.split("-")[1]]) errores.push("el código de un bien nuevo va como LH-EQP-000, con un prefijo conocido");
    else if (codigos?.has(x.codigo)) errores.push(`el bien ${x.codigo} ya existe`);
    else if (codigos) {
      const otro = [...codigos].find((c) => numeroDe(c) === numeroDe(x.codigo));
      if (otro) errores.push(`el número ${numeroDe(x.codigo)} ya lo usa ${otro}`);
    }
  } else if (codigos && !codigos.has(x.codigo)) errores.push(`el bien ${x.codigo} no existe`);
  if (typeof x.fecha !== "string" || Number.isNaN(Date.parse(x.fecha))) errores.push("falta la fecha del cambio");
  if (typeof x.autor !== "string" || !/^[A-ZÁÉÍÓÚÑ]{2,5}$/.test(x.autor)) errores.push("el autor va con sus iniciales, de 2 a 5 letras mayúsculas");
  const m = textoLimpio(x.motivo ?? "", 200);
  if (m) errores.push(`el motivo ${m}`);
  else if (!(x.motivo ?? "").trim()) errores.push("falta el motivo del cambio");
  const v = validarValor(x.campo, x.valor, contenedores);
  if (v) errores.push(`${x.campo}: ${v}`);
  const permitidas = new Set(["id", "codigo", "campo", "antes", "valor", "fecha", "autor", "motivo"]);
  for (const k of Object.keys(x)) if (!permitidas.has(k)) errores.push(`sobra la clave ${k}`);
  return errores;
}

export function validarArchivo(datos, codigos, contenedores) {
  const errores = [];
  if (!datos || typeof datos !== "object" || !Array.isArray(datos.cambios)) return ["el archivo debe traer una lista «cambios»"];
  const vistos = new Set();
  // Los bienes dados de alta existen desde su alta en adelante
  const conocidos = codigos ? new Set(codigos) : null;
  datos.cambios.forEach((x, i) => {
    for (const e of validarCambio(x, conocidos, contenedores)) errores.push(`cambio ${i + 1} (${x?.codigo ?? "?"}): ${e}`);
    if (x?.campo === "Alta" && conocidos) conocidos.add(x.codigo);
    if (vistos.has(x?.id)) errores.push(`cambio ${i + 1}: identificador repetido`);
    vistos.add(x?.id);
  });
  return errores;
}
