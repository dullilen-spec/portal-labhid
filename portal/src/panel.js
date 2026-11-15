// v05: panel de mantenimiento (?panel). Lo usan el técnico y los tesistas para actualizar el estado,
// la ubicación y la bitácora de un bien, y para anotar las medidas de la hoja de campo.
// Guarda en el repositorio con el token de GitHub de cada persona; el token queda solo en su navegador.
import "./panel.css";
import { API, RAMA, REPO, RUTA_ACTUALIZACIONES, RUTA_CAMPO_FOTOS, RUTA_CAMPO_ITEMS, RUTA_CAMPO_MEDICIONES, RUTA_FOTOS } from "./config.js";
import { aplicarCambios, fechaCorta } from "./datos.js";
import { CAMPOS, TIPOS_EVENTO, fechaValida, validarArchivo, validarCambio } from "./esquema.js";
import { filtrar } from "./vistas.js";

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// Las pruebas reemplazan la red por una simulación: nunca escriben en el repositorio real
const pedir = (...a) => (globalThis.__fetchPanel ?? fetch)(...a);
const CLAVE_SESION = "labhid-panel";
const CLAVE_COLA = "labhid-campo-cola";
const CLAVE_HOJA = "labhid-campo-hoja";

const almacen = {
  leer(k, defecto) {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? defecto;
    } catch {
      return defecto;
    }
  },
  guardar(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch {
      return false;
    }
  },
  quitar(k) {
    try {
      localStorage.removeItem(k);
    } catch {
      // Sin almacenamiento no hay nada que quitar
    }
  },
};

// ---------- GitHub
class ErrorGitHub extends Error {
  constructor(estado, texto) {
    super(texto);
    this.estado = estado;
  }
}
async function gh(ruta, token, opciones = {}) {
  let r;
  try {
    r = await pedir(`${API}${ruta}`, {
      cache: "no-store",
      ...opciones,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opciones.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch {
    throw new ErrorGitHub(0, "Sin conexión a internet.");
  }
  if (!r.ok) {
    const motivo = { 401: "El token no es válido o ya venció.", 403: "El token no tiene permiso, o se agotó el límite de consultas.", 404: "No se encontró el archivo o el repositorio." }[r.status];
    throw new ErrorGitHub(r.status, motivo ?? `GitHub respondió ${r.status}.`);
  }
  return r.json();
}
const aBase64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const deBase64 = (t) => Uint8Array.from(atob(t.replace(/\s/g, "")), (c) => c.charCodeAt(0));

async function leerJson(ruta, token) {
  try {
    const d = await gh(`/repos/${REPO}/contents/${ruta}?ref=${RAMA}`, token);
    return { json: JSON.parse(new TextDecoder().decode(deBase64(d.content))), sha: d.sha };
  } catch (e) {
    if (e.estado === 404) return { json: null, sha: null };
    throw e;
  }
}
const escribir = (ruta, base64, mensaje, sha, token) =>
  gh(`/repos/${REPO}/contents/${ruta}`, token, {
    method: "PUT",
    body: JSON.stringify({ message: mensaje, content: base64, branch: RAMA, ...(sha ? { sha } : {}) }),
  });

// Lee la versión más reciente, agrega y sube. Si otra persona guardó a la vez, vuelve a leer y reintenta
async function agregarAlArchivo(ruta, token, mensaje, agregar) {
  for (let intento = 0; ; intento++) {
    const { json, sha } = await leerJson(ruta, token);
    const datos = agregar(json);
    const texto = `${JSON.stringify(datos, null, 1)}\n`;
    try {
      await escribir(ruta, aBase64(new TextEncoder().encode(texto)), mensaje, sha, token);
      return datos;
    } catch (e) {
      if ((e.estado === 409 || e.estado === 422) && intento < 2) continue;
      throw e;
    }
  }
}

// ---------- utilidades
const hoy = () => new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
const aFechaPe = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
const aFechaIso = (pe) => (fechaValida(pe) ? pe.split("/").reverse().join("-") : "");
const sello = () => new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
const idCambio = (i) => `${sello()}-${Math.random().toString(36).slice(2, 6)}${i}`;

async function fotoWebp(archivo, lado = 1200, calidad = 0.82) {
  const img = await createImageBitmap(archivo);
  const k = Math.min(1, lado / Math.max(img.width, img.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(img.width * k);
  lienzo.height = Math.round(img.height * k);
  lienzo.getContext("2d").drawImage(img, 0, 0, lienzo.width, lienzo.height);
  const blob = await new Promise((res) => lienzo.toBlob(res, "image/webp", calidad));
  if (!blob) throw new Error("Este navegador no pudo preparar la foto.");
  return aBase64(new Uint8Array(await blob.arrayBuffer()));
}

const opciones = (lista, actual) => lista.map((o) => `<option${o === actual ? " selected" : ""}>${esc(o)}</option>`).join("");
const campoHtml = (id, rotulo, control, ayuda = "") =>
  `<div class="p-campo"><label for="${id}">${esc(rotulo)}</label>${control}${ayuda ? `<small>${esc(ayuda)}</small>` : ""}</div>`;

export function vistaPanel(raiz, estado) {
  const { bienes, cambios } = estado;
  const codigos = new Set(bienes.map((b) => b.Codigo_LH));
  // Cada contenedor con el texto de ubicación que ya usa el Excel maestro
  const lugares = new Map();
  for (const b of bienes) if (b.Contenedor && b.Contenedor !== "Pendiente" && !lugares.has(b.Contenedor)) lugares.set(b.Contenedor, b.Ubicacion_texto);
  const contenedores = new Set(lugares.keys());
  let sesion = almacen.leer(CLAVE_SESION, null);
  let elegido = null;

  raiz.classList.remove("ancha", "dividida");
  raiz.innerHTML = `
    <article class="panel">
      <header class="panel-cabeza">
        <p class="sobretitulo">Mantenimiento del portal</p>
        <h1>Actualizar información</h1>
        <p>Cambia el estado, la ubicación o la bitácora de un equipo. El cambio queda registrado con fecha, autor y motivo, y el sitio se publica solo en unos minutos.</p>
      </header>
      <section class="panel-caja" id="p-sesion" aria-label="Sesión"></section>
      <div class="panel-pestanas" role="tablist" aria-label="Qué actualizar">
        <button type="button" role="tab" id="t-equipos" aria-controls="p-equipos" aria-selected="true">Equipos</button>
        <button type="button" role="tab" id="t-campo" aria-controls="p-campo" aria-selected="false">Hoja de campo</button>
      </div>
      <section id="p-equipos" role="tabpanel" aria-labelledby="t-equipos">
        <div class="panel-caja">
          <label class="p-rotulo" for="p-q">Equipo</label>
          <input id="p-q" type="search" autocomplete="off" placeholder="Nombre, modelo o código" />
          <ul id="p-resultados" class="p-resultados"></ul>
        </div>
        <form id="p-form" class="panel-caja" hidden novalidate></form>
      </section>
      <section id="p-campo" role="tabpanel" aria-labelledby="t-campo" hidden></section>
      <p id="p-aviso" class="p-aviso" role="status" aria-live="polite"></p>
    </article>`;
  document.title = "Actualizar | Equipos LABHID";

  const $ = (s) => raiz.querySelector(s);
  const aviso = $("#p-aviso");
  const decir = (texto, clase = "") => {
    aviso.className = `p-aviso ${clase}`;
    aviso.innerHTML = texto;
  };

  // ---------- sesión
  const cajaSesion = $("#p-sesion");
  function pintarSesion() {
    cajaSesion.innerHTML = sesion
      ? `<div class="p-sesion-ok"><p><strong>Sesión abierta</strong> como <span class="p-autor">${esc(sesion.autor)}</span>. El token está guardado solo en este navegador.</p>
          <button type="button" class="boton sec chico" id="p-salir">Cerrar sesión</button></div>`
      : `<h2>Entrar para guardar</h2>
         <p class="nota">Sin sesión puedes revisar el panel, pero no guardar. Necesitas un token de GitHub con permiso de escritura solo en este repositorio (la guía explica cómo crearlo).</p>
         <form id="p-entrar" class="p-fila" novalidate>
           ${campoHtml("p-token", "Token de GitHub", `<input id="p-token" type="password" autocomplete="off" spellcheck="false" />`)}
           ${campoHtml("p-autor", "Tus iniciales", `<input id="p-autor" type="text" maxlength="5" autocomplete="off" placeholder="DU" />`)}
           <button class="boton" type="submit">Entrar</button>
         </form>`;
    cajaSesion.querySelector("#p-salir")?.addEventListener("click", () => {
      almacen.quitar(CLAVE_SESION);
      sesion = null;
      pintarSesion();
      decir("Sesión cerrada. El token se borró de este navegador.");
    });
    cajaSesion.querySelector("#p-entrar")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const token = $("#p-token").value.trim();
      const autor = $("#p-autor").value.trim().toUpperCase();
      if (!token) return decir("Escribe el token.", "mal");
      if (!/^[A-ZÁÉÍÓÚÑ]{2,5}$/.test(autor)) return decir("Las iniciales van con 2 a 5 letras, sin espacios.", "mal");
      decir("Comprobando el token...");
      try {
        const repo = await gh(`/repos/${REPO}`, token);
        if (!repo.permissions?.push) return decir("El token es válido, pero no tiene permiso de escritura en este repositorio.", "mal");
        sesion = { token, autor };
        if (!almacen.guardar(CLAVE_SESION, sesion)) decir("Sesión abierta, pero este navegador no permite guardarla: tendrás que entrar de nuevo al volver.", "obs");
        else decir("Sesión abierta.", "ok");
        pintarSesion();
        actualizarBotones();
      } catch (err) {
        decir(esc(err.message), "mal");
      }
    });
    actualizarBotones();
  }
  function actualizarBotones() {
    raiz.querySelectorAll("[data-necesita-sesion]").forEach((b) => {
      b.disabled = !sesion;
      b.title = sesion ? "" : "Entra con tu token para guardar";
    });
  }

  // ---------- pestañas
  const pestanas = [...raiz.querySelectorAll('[role="tab"]')];
  pestanas.forEach((t) =>
    t.addEventListener("click", () => {
      pestanas.forEach((x) => {
        x.setAttribute("aria-selected", String(x === t));
        $(`#${x.getAttribute("aria-controls")}`).hidden = x !== t;
      });
      if (t.id === "t-campo") abrirCampo();
    }),
  );

  // ---------- equipos
  const q = $("#p-q");
  const resultados = $("#p-resultados");
  const form = $("#p-form");
  q.addEventListener("input", () => {
    const t = q.value.trim();
    const r = t ? filtrar(bienes, t).slice(0, 8) : [];
    resultados.innerHTML = t && !r.length
      ? `<li class="nota">Sin resultados</li>`
      : r.map((b) => `<li><button type="button" data-codigo="${esc(b.Codigo_LH)}"><strong>${esc(b.Nombre)}</strong><small>${esc(b.Codigo_LH)} · ${esc(b.Marca_modelo)}</small></button></li>`).join("");
  });
  resultados.addEventListener("click", (e) => {
    const b = e.target.closest("[data-codigo]");
    if (!b) return;
    elegir(bienes.find((x) => x.Codigo_LH === b.dataset.codigo));
    resultados.innerHTML = "";
    q.value = "";
  });

  function elegir(b) {
    elegido = b;
    const fechaEsp = CAMPOS.Proxima_fecha.fecha.includes(b.Proxima_fecha) || !b.Proxima_fecha ? b.Proxima_fecha || "Pendiente" : "Fecha";
    const estadosUbic = [...new Set(["Por confirmar en campo", "Por registrar en campo", `Confirmada en campo el ${hoy()}`, b.Ubicacion_estado].filter(Boolean))];
    form.hidden = false;
    form.innerHTML = `
      <header class="p-bien"><div><h2>${esc(b.Nombre)}</h2><p class="t-codigo">${esc(b.Codigo_LH)}</p></div>
        <a class="boton sec chico" data-interno href="./?id=${encodeURIComponent(b.Codigo_LH)}">Ver ficha</a></header>
      ${b._actualizado ? `<p class="nota">Última actualización: ${esc(fechaCorta(b._actualizado))}.</p>` : ""}
      <fieldset><legend>Estado</legend>
        ${campoHtml("f-eo", "Estado operativo", `<select id="f-eo" data-campo="Estado_operativo">${opciones(CAMPOS.Estado_operativo.lista, b.Estado_operativo || "Pendiente")}</select>`)}
        ${campoHtml("f-eof", "Fuente del estado", `<input id="f-eof" data-campo="Estado_operativo_fuente" type="text" maxlength="120" value="${esc(b.Estado_operativo_fuente)}" />`, "Quién lo comprobó y cuándo. Se llena solo al cambiar el estado.")}
        ${campoHtml("f-ec", "Estado de conservación", `<select id="f-ec" data-campo="Estado_conservacion">${opciones(CAMPOS.Estado_conservacion.lista, b.Estado_conservacion || "Pendiente")}</select>`)}
        ${campoHtml("f-em", "Estado metrológico", `<select id="f-em" data-campo="Estado_metrologico">${opciones(CAMPOS.Estado_metrologico.lista, b.Estado_metrologico || "Pendiente")}</select>`)}
        <div class="p-campo"><label for="f-pft">Próxima calibración o verificación</label>
          <div class="p-doble"><select id="f-pft">${opciones(["Pendiente", "No aplica", "Fecha"], fechaEsp)}</select>
          <input id="f-pf" type="date" aria-label="Fecha" value="${esc(aFechaIso(b.Proxima_fecha))}" ${fechaEsp === "Fecha" ? "" : "hidden"} /></div></div>
        ${campoHtml("f-ot", "Última orden de trabajo", `<input id="f-ot" data-campo="Ultima_OT" type="text" maxlength="80" value="${esc(b.Ultima_OT)}" />`)}
      </fieldset>
      <fieldset><legend>Ubicación</legend>
        ${campoHtml("f-cont", "Mueble o zona", `<select id="f-cont"><option value="Pendiente"${!contenedores.has(b.Contenedor) ? " selected" : ""}>Pendiente</option>${[...lugares]
          .map(([c, t]) => `<option value="${esc(c)}"${c === b.Contenedor ? " selected" : ""}>${esc(t.split("(")[0].trim())}</option>`)
          .join("")}</select>`)}
        ${campoHtml("f-ue", "Estado de la ubicación", `<select id="f-ue" data-campo="Ubicacion_estado">${opciones(estadosUbic, b.Ubicacion_estado)}</select>`)}
      </fieldset>
      <fieldset><legend>Bitácora (opcional)</legend>
        <div class="p-doble">
          ${campoHtml("f-hf", "Fecha", `<input id="f-hf" type="date" />`)}
          ${campoHtml("f-ht", "Tipo", `<select id="f-ht"><option value="">Sin evento</option>${opciones(TIPOS_EVENTO)}</select>`)}
        </div>
        ${campoHtml("f-hr", "Qué se hizo y resultado", `<textarea id="f-hr" rows="3" maxlength="300"></textarea>`, "No escribas nombres completos ni datos patrimoniales: la bitácora es pública.")}
      </fieldset>
      <fieldset><legend>Fotografía (opcional)</legend>
        ${campoHtml("f-foto", "Foto nueva del equipo", `<input id="f-foto" type="file" accept="image/*" />`, "Se reduce antes de subirla. Reemplaza la foto de la ficha.")}
      </fieldset>
      ${campoHtml("f-motivo", "Motivo del cambio", `<input id="f-motivo" type="text" maxlength="200" required />`, "Por ejemplo: revisión semanal, traslado, calibración recibida.")}
      <div class="p-acciones"><button class="boton" type="submit" data-necesita-sesion>Guardar cambios</button></div>`;
    const tipoFecha = form.querySelector("#f-pft");
    tipoFecha.addEventListener("change", () => (form.querySelector("#f-pf").hidden = tipoFecha.value !== "Fecha"));
    form.querySelector("#f-eo").addEventListener("change", () => {
      const fuente = form.querySelector("#f-eof");
      if (fuente.value === (b.Estado_operativo_fuente ?? "")) fuente.value = `Revisión en el laboratorio, ${hoy()}${sesion ? ` (${sesion.autor})` : ""}`;
    });
    actualizarBotones();
    decir("");
    form.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function reunirCambios(b) {
    const v = (id) => form.querySelector(id).value.trim();
    const nuevos = [];
    const poner = (campo, valor) => {
      if (valor !== (b[campo] ?? "")) nuevos.push({ campo, antes: b[campo] ?? "", valor });
    };
    form.querySelectorAll("[data-campo]").forEach((el) => poner(el.dataset.campo, el.value.trim()));
    const tipoFecha = v("#f-pft");
    poner("Proxima_fecha", tipoFecha === "Fecha" ? aFechaPe(v("#f-pf")) : tipoFecha);
    const cont = v("#f-cont");
    if (cont !== (contenedores.has(b.Contenedor) ? b.Contenedor : "Pendiente")) {
      nuevos.push({ campo: "Contenedor", antes: b.Contenedor ?? "", valor: cont });
      poner("Ubicacion_texto", cont === "Pendiente" ? "Pendiente" : lugares.get(cont));
    }
    if (v("#f-ht")) nuevos.push({ campo: "Historial", antes: "", valor: { fecha: aFechaPe(v("#f-hf")), tipo: v("#f-ht"), resultado: v("#f-hr") } });
    return nuevos;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!sesion || !elegido) return decir("Entra con tu token para guardar.", "mal");
    const b = elegido;
    const boton = form.querySelector('[type="submit"]');
    const motivo = form.querySelector("#f-motivo").value.trim();
    const archivo = form.querySelector("#f-foto").files[0];
    const base = reunirCambios(b);
    if (archivo) base.push({ campo: "Foto", antes: b.Foto ?? "", valor: `fotos/${b.Codigo_LH}.${sello()}.webp` });
    if (!base.length) return decir("No hay cambios que guardar.", "obs");
    const fecha = new Date().toISOString();
    const nuevos = base.map((x, i) => ({ id: idCambio(i), codigo: b.Codigo_LH, ...x, fecha, autor: sesion.autor, motivo }));
    const errores = nuevos.flatMap((x) => validarCambio(x, codigos, contenedores));
    if (errores.length) return decir(`Revisa esto antes de guardar:<ul>${[...new Set(errores)].map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`, "mal");
    boton.disabled = true;
    decir("Guardando...");
    try {
      const foto = nuevos.find((x) => x.campo === "Foto");
      if (foto) await escribir(`${RUTA_FOTOS}/${foto.valor.split("/")[1]}`, await fotoWebp(archivo), `Foto de ${b.Codigo_LH} (${sesion.autor})`, null, sesion.token);
      await agregarAlArchivo(RUTA_ACTUALIZACIONES, sesion.token, `Actualiza ${b.Codigo_LH}: ${[...new Set(nuevos.map((x) => x.campo))].join(", ")} (${sesion.autor})`, (json) => {
        const datos = json ?? { version: 1, cambios: [] };
        datos.cambios.push(...nuevos);
        const mal = validarArchivo(datos, codigos, contenedores);
        if (mal.length) throw new Error(`El archivo de actualizaciones quedó con errores: ${mal[0]}`);
        return datos;
      });
      cambios.push(...nuevos);
      aplicarCambios(bienes, nuevos);
      elegir(b);
      decir(`Guardado: ${nuevos.length} ${nuevos.length === 1 ? "cambio" : "cambios"} en ${esc(b.Codigo_LH)}. El sitio se publica solo en unos minutos. <a href="https://github.com/${REPO}/actions" target="_blank" rel="noopener">Ver la publicación</a>`, "ok");
    } catch (err) {
      decir(`No se guardó. ${esc(err.message)}`, "mal");
    } finally {
      boton.disabled = !sesion;
    }
  });

  // ---------- hoja de campo
  const campo = $("#p-campo");
  let hoja = null;
  let mediciones = [];
  const cola = () => almacen.leer(CLAVE_COLA, []);
  const ultima = (n) => [...mediciones, ...cola()].filter((m) => m.n === n).at(-1);
  const numero = (t) => {
    const x = Number(String(t).replace(",", ".").trim());
    return String(t).trim() !== "" && Number.isFinite(x) ? x : null;
  };
  function estadoItem(it) {
    const m = ultima(it.n);
    if (!m) return ["PENDIENTE", "pend"];
    const medido = numero(m.valor);
    if (typeof it.valor_modelo !== "number" || medido === null || typeof it.tolerancia !== "number") return ["REVISAR", "obs"];
    return Math.abs(medido - it.valor_modelo) <= it.tolerancia ? ["OK", "ok"] : ["CORREGIR", "mal"];
  }

  async function abrirCampo() {
    if (hoja) return pintarCampo();
    campo.innerHTML = `<p class="cargando">Cargando la hoja de campo...</p>`;
    try {
      const [a, b] = await Promise.all([leerJson(RUTA_CAMPO_ITEMS, sesion?.token), leerJson(RUTA_CAMPO_MEDICIONES, sesion?.token)]);
      if (!a.json) throw new Error("La hoja de campo todavía no está en el repositorio.");
      hoja = a.json;
      mediciones = b.json?.mediciones ?? [];
      // Copia en el celular para usarla en obra sin señal
      almacen.guardar(CLAVE_HOJA, { hoja, mediciones });
      pintarCampo();
    } catch (err) {
      const guardada = almacen.leer(CLAVE_HOJA, null);
      if (guardada?.hoja) {
        hoja = guardada.hoja;
        mediciones = guardada.mediciones ?? [];
        pintarCampo();
        decir(`${esc(err.message)} Se usa la hoja guardada en este celular; las medidas se envían al volver la señal.`, "obs");
        return;
      }
      campo.innerHTML = `<div class="panel-caja"><p><strong>No se pudo cargar la hoja de campo.</strong></p><p class="nota">${esc(err.message)} Ábrela una vez con señal para que quede guardada en este celular.</p></div>`;
    }
  }

  let filtroCampo = "";
  function pintarCampo() {
    const items = hoja.items.filter((it) => !filtroCampo || (filtroCampo === "PEND" ? !ultima(it.n) : it.prioridad === filtroCampo));
    const medidos = hoja.items.filter((it) => ultima(it.n)).length;
    const enCola = cola().length;
    const grupos = new Map();
    for (const it of items) (grupos.get(it.grupo) ?? grupos.set(it.grupo, []).get(it.grupo)).push(it);
    campo.innerHTML = `
      <div class="panel-caja">
        <h2>Hoja de campo: cotas por medir</h2>
        <p class="nota">${esc(hoja.modelo)}. Escribe el valor medido en la unidad que indica cada ítem. Sirve sin señal: lo que no se pueda enviar queda en este celular.</p>
        <p class="p-avance"><strong>${medidos} de ${hoja.items.length}</strong> ítems medidos${enCola ? ` · <span class="chip obs">${enCola} sin enviar</span>` : ""}</p>
        <div class="filtros" role="group" aria-label="Filtrar ítems">
          ${[["", "Todos"], ["PEND", "Sin medir"], ["A", "Prioridad A"], ["B", "Prioridad B"], ["C", "Prioridad C"]].map(([k, t]) => `<button type="button" data-filtro="${k}" aria-pressed="${k === filtroCampo}">${t}</button>`).join("")}
        </div>
        ${enCola ? `<button type="button" class="boton chico" id="c-enviar" data-necesita-sesion>Enviar lo pendiente (${enCola})</button>` : ""}
      </div>
      ${[...grupos].map(([g, lista]) => `<section class="p-grupo"><h3>${esc(g)}</h3>${lista.map(itemHtml).join("")}</section>`).join("") || `<p class="nota centro">No hay ítems con ese filtro.</p>`}`;
    actualizarBotones();
  }
  function itemHtml(it) {
    const m = ultima(it.n);
    const [est, clase] = estadoItem(it);
    return `<details class="p-item" data-n="${it.n}"><summary><span class="p-n">${it.n}</span><span class="p-item-t"><strong>${esc(it.elemento)}</strong><small>${esc(it.ubicacion)}</small></span><span class="chip ${clase}">${est}</span></summary>
      <dl>
        <div class="fila"><dt>Qué medir</dt><dd>${esc(it.que_medir)}</dd></div>
        <div class="fila"><dt>Valor en el modelo</dt><dd>${esc(it.valor_modelo)} ${esc(it.unidad === "-" ? "" : it.unidad)}${typeof it.tolerancia === "number" ? ` <small class="bajo">Tolerancia: ±${it.tolerancia} mm</small>` : ""}</dd></div>
        <div class="fila"><dt>Cómo medir</dt><dd>${esc(it.como_medir)}</dd></div>
        <div class="fila"><dt>Fuente</dt><dd>${esc(it.fuente)}</dd></div>
        ${it.foto_pedida ? `<div class="fila"><dt>Foto pedida</dt><dd>${esc(it.foto_pedida)}</dd></div>` : ""}
        <div class="fila"><dt>En Revit</dt><dd>${esc(it.marca)}</dd></div>
      </dl>
      ${m ? `<p class="nota">Último registro: <strong>${esc(m.valor)}</strong>${m.obs ? `, ${esc(m.obs)}` : ""} (${esc(m.autor)}, ${esc(fechaCorta(m.fecha))})${m.foto ? ", con foto" : ""}.</p>` : ""}
      <form class="p-medir" novalidate>
        <div class="p-doble">
          ${campoHtml(`c-v-${it.n}`, `Valor medido${it.unidad !== "-" ? ` (${it.unidad})` : ""}`, `<input id="c-v-${it.n}" name="valor" type="text" inputmode="decimal" autocomplete="off" />`)}
          ${campoHtml(`c-f-${it.n}`, "Foto", `<input id="c-f-${it.n}" name="foto" type="file" accept="image/*" capture="environment" />`)}
        </div>
        ${campoHtml(`c-o-${it.n}`, "Observaciones", `<input id="c-o-${it.n}" name="obs" type="text" maxlength="200" />`)}
        <button class="boton chico" type="submit">Guardar medición</button>
      </form></details>`;
  }

  async function enviarCola() {
    if (!sesion) return false;
    const pendientes = cola();
    if (!pendientes.length) return true;
    const listas = [];
    for (const m of pendientes) {
      const x = { ...m };
      if (x.foto_datos) {
        x.foto = `${RUTA_CAMPO_FOTOS}/item_${String(x.n).padStart(2, "0")}_${sello()}.webp`;
        await escribir(x.foto, x.foto_datos, `Foto de campo, ítem ${x.n} (${sesion.autor})`, null, sesion.token);
        delete x.foto_datos;
      }
      listas.push(x);
    }
    const datos = await agregarAlArchivo(RUTA_CAMPO_MEDICIONES, sesion.token, `Hoja de campo: ${listas.length} ${listas.length === 1 ? "medición" : "mediciones"} (${sesion.autor})`, (json) => {
      const d = json ?? { version: 1, modelo: hoja.modelo, mediciones: [] };
      d.mediciones.push(...listas);
      return d;
    });
    mediciones = datos.mediciones;
    almacen.quitar(CLAVE_COLA);
    almacen.guardar(CLAVE_HOJA, { hoja, mediciones });
    return true;
  }

  campo.addEventListener("click", async (e) => {
    const f = e.target.closest("[data-filtro]");
    if (f) {
      filtroCampo = f.dataset.filtro;
      return pintarCampo();
    }
    if (e.target.closest("#c-enviar")) {
      decir("Enviando...");
      try {
        await enviarCola();
        decir("Mediciones enviadas.", "ok");
      } catch (err) {
        decir(`No se pudo enviar: ${esc(err.message)} Siguen guardadas en este celular.`, "obs");
      }
      pintarCampo();
    }
  });
  campo.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target.closest(".p-medir");
    if (!f) return;
    const n = Number(f.closest("[data-n]").dataset.n);
    const valor = f.elements.valor.value.trim();
    const obs = f.elements.obs.value.trim();
    const archivo = f.elements.foto.files[0];
    if (!valor && !obs && !archivo) return decir("Escribe el valor medido, una observación o adjunta la foto.", "mal");
    if (/[<>]/.test(valor + obs)) return decir("No uses los signos < o >.", "mal");
    const m = { n, valor, obs, fecha: new Date().toISOString(), autor: sesion?.autor ?? "SIN" };
    try {
      // En la cola la foto va más chica: el almacenamiento del navegador es limitado
      if (archivo) m.foto_datos = await fotoWebp(archivo, 1000, 0.7);
    } catch (err) {
      return decir(esc(err.message), "mal");
    }
    if (!almacen.guardar(CLAVE_COLA, [...cola(), m])) {
      delete m.foto_datos;
      if (!almacen.guardar(CLAVE_COLA, [...cola(), m])) return decir("Este navegador no dejó guardar la medición.", "mal");
      decir("La medición se guardó sin la foto: no queda espacio en este celular. Envía lo pendiente y vuelve a adjuntarla.", "obs");
    }
    try {
      if (!sesion) throw new Error("Falta entrar con el token.");
      await enviarCola();
      decir(`Ítem ${n}: medición enviada.`, "ok");
    } catch (err) {
      decir(`Ítem ${n}: guardado en este celular. ${esc(err.message)} Se envía con «Enviar lo pendiente».`, "obs");
    }
    pintarCampo();
    campo.querySelector(`[data-n="${n}"]`)?.scrollIntoView({ block: "center" });
  });

  pintarSesion();
  // Enlace directo a un equipo: ?panel&id=LH-EQP-065
  const inicial = new URLSearchParams(location.search).get("id");
  const b0 = inicial && bienes.find((x) => x.Codigo_LH.toLowerCase() === inicial.toLowerCase());
  if (b0) elegir(b0);
}
