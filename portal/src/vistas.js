import { enlaceReporte } from "./config.js";
import { fechaCorta } from "./datos.js";

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const normalizar = (t) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const enlace = (codigo, extra = "") => `./?id=${encodeURIComponent(codigo)}${extra}`;

const trazo = (d) =>
  `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICONO = {
  buscar: trazo('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  cubo: trazo('<path d="M12 3 4 7.5v9L12 21l8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>'),
  info: trazo('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  pin: trazo('<path d="M12 21s7-6.100 7-11.500A7 7 0 0 0 5 9.500C5 14.900 12 21 12 21z"/><circle cx="12" cy="9.500" r="2.500"/>'),
  libro: trazo('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>'),
  foco: trazo('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>'),
  general: trazo('<path d="m3 7 6-3 6 3 6-3v13l-6 3-6-3-6 3zM9 4v13M15 7v13"/>'),
  planta: trazo('<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 12h7M11 4v11M15 12h5"/>'),
  muros: trazo('<path d="M4 20V8l8-4 8 4v12"/><path d="M4 12h16M4 16h16M12 8v4M8 12v4M16 12v4"/>'),
  corte: trazo('<path d="M2 11h3M8 11h3M14 11h3M20 11h2"/><path d="M5 14v6h14v-6"/><path d="M9 17h6"/>'),
  aislar: trazo('<path d="M12 3 5 7v10l7 4 7-4V7z"/><path d="M2 2l3 3M22 2l-3 3M2 22l3-3M22 22l-3-3"/>'),
  cerrar: trazo('<path d="M6 6l12 12M18 6 6 18"/>'),
  ampliar: trazo('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
  atras: trazo('<path d="m15 18-6-6 6-6"/>'),
  tubo: trazo('<path d="M8 3h8M9 3v12a3 3 0 0 0 6 0V3M9 11h6"/>'),
  campana: trazo('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  alerta: trazo('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>'),
  etiqueta: trazo('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>'),
};

export const TIPOS = {
  "FOR-VDC-09A": { corto: "Equipos", nombre: "Equipo de ensayo" },
  "FOR-VDC-09B": { corto: "Instrumentos", nombre: "Instrumento de medición" },
  "FOR-VDC-09C": { corto: "Accesorios", nombre: "Módulo o accesorio de ensayo" },
  "FOR-VDC-09D": { corto: "Patrones", nombre: "Patrón o material de referencia" },
  "FOR-VDC-09E": { corto: "Datos", nombre: "Adquisición de datos y software" },
};

const PEND = `<span class="pend">Pendiente</span>`;
const dato = (v) => (v === "" || v === "Pendiente" || v == null ? PEND : esc(v));
const lugarCorto = (b) => (b.Ubicacion_texto || "").split("(")[0].trim();
// v03: «Por registrar en campo» tampoco es un lugar
const tieneLugar = (b) => b.Ubicacion_texto && b.Ubicacion_texto !== "Pendiente" && b.Ubicacion_texto !== "Por registrar en campo";
const partesLugar = (b) => lugarCorto(b).split(" - ").map((p) => p.trim()).filter(Boolean);
// Mueble: solo cuando el contenedor es un mueble real (no la sala ni un pendiente)
const esMueble = (b) => tieneLugar(b) && b.Contenedor && b.Contenedor !== "Pendiente" && !b.Contenedor.startsWith("SALA");
const rotulo = (b) => (esMueble(b) ? `<span class="rotulo">${esc(partesLugar(b).at(-1))}</span>` : "");
// Ninguna ubicación está validada todavía: mismo criterio que el aviso general
const validada = (b) => b.Ubicacion_validada === "S" || b.Ubicacion_validada === "Sí";
const TUBOS = [0.55, 0.8, 0.42, 0.95, 0.66, 0.34, 0.74];
const tubos = (clase = "") =>
  `<span class="tubos ${clase}" aria-hidden="true">${TUBOS.map((h) => `<i style="--h:${h}"></i>`).join("")}</span>`;

function ruta(b) {
  if (!tieneLugar(b)) return `<p class="lugar-vacio">Ubicación pendiente de registrar</p>`;
  const partes = partesLugar(b);
  return `<ol class="ruta">${partes
    .map((p, i) => `<li${i === partes.length - 1 ? ' class="final"' : ""}>${esc(p)}</li>`)
    .join("")}</ol>`;
}

function chipEstado(e) {
  const clase = { Operativo: "ok", Inoperativo: "mal", Observado: "obs" }[e] ?? "pend";
  return `<span class="chip ${clase}">${esc(e || "Pendiente")}</span>`;
}

const fila = (etiqueta, valor) => `<div class="fila"><dt>${esc(etiqueta)}</dt><dd>${valor}</dd></div>`;

const textoBusqueda = (b) =>
  normalizar([b.Codigo_LH, b.Nombre, b.Nombre_oficial, b.Marca_modelo, b.Ubicacion_texto, TIPOS[b.Tipo_ficha]?.nombre].join(" "));

// v03: coincidencias exactas primero. 0 = código; 1 = modelo exacto (HB015); 2 = el nombre empieza así; 3 = el resto
function rango(b, q) {
  if (!q) return 0;
  const compacta = q.replace(/\s+/g, "");
  if (normalizar(b.Codigo_LH) === compacta) return 0;
  if (normalizar(b.Marca_modelo).split(/\s+/).includes(compacta)) return 1;
  if (normalizar(b.Nombre).startsWith(q)) return 2;
  return 3;
}

// Correcciones del 14/11 (n.° 7): mesas, escritorios, armarios y demás muebles (código LH-MOB)
const MOBILIARIO = "MOB";
const esDelTipo = (b, tipo) => (tipo === MOBILIARIO ? b.Codigo_LH.startsWith("LH-MOB-") : b.Tipo_ficha === tipo);

export function filtrar(bienes, consulta, tipo = "") {
  const q = normalizar(consulta).trim();
  const palabras = q.split(/\s+/).filter(Boolean);
  return bienes
    .filter((b) => {
      if (tipo && !esDelTipo(b, tipo)) return false;
      const t = textoBusqueda(b);
      return palabras.every((p) => t.includes(p));
    })
    .map((b, i) => [rango(b, q), i, b])
    .sort((x, y) => x[0] - y[0] || x[1] - y[1])
    .map((x) => x[2]);
}

const miniatura = (b) =>
  b.Foto
    ? `<img class="t-foto" src="./${esc(b.Foto)}" alt="" loading="lazy" decoding="async" width="72" height="72" />`
    : `<span class="t-foto t-vacia">${b.Tipo_ficha === "FOR-VDC-09B" ? ICONO.tubo : ICONO.cubo}</span>`;

function tarjeta(b) {
  const p = partesLugar(b);
  const lugar = !tieneLugar(b) ? "Ubicación pendiente" : esMueble(b) ? esc(p.slice(0, -1).join(" › ")) : esc(p.join(" › "));
  return `<li class="resultado" data-codigo="${esc(b.Codigo_LH)}"><a class="tarjeta" data-interno href="${enlace(b.Codigo_LH)}">
    ${miniatura(b)}
    <span class="t-cuerpo">
      <span class="t-codigo">${esc(b.Codigo_LH)}</span>
      <span class="t-nombre">${esc(b.Nombre)}</span>
      <span class="t-meta">${esc(b.Marca_modelo)}</span>
      <span class="t-ubic">${lugar}${rotulo(b)}</span>
    </span>
  </a>
  <div class="t-acciones">
    <a class="t-accion" data-interno href="${enlace(b.Codigo_LH)}">${ICONO.info}Ficha</a>
    ${tieneLugar(b)
      ? `<a class="t-accion prin" data-interno href="${enlace(b.Codigo_LH, "&ver=3d")}">${ICONO.cubo}Ubicar en 3D</a>`
      : `<span class="t-accion off">${ICONO.cubo}Sin ubicación</span>`}
  </div></li>`;
}

// v03: la búsqueda y el filtro se conservan al volver de la ficha o del visor, aun tras recargar
const memoria = {
  leer: (k) => {
    try {
      return sessionStorage.getItem(k) ?? "";
    } catch {
      return "";
    }
  },
  guardar: (k, v) => {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      // Sin almacenamiento solo se conserva en memoria
    }
  },
};
let filtroTipo = memoria.leer("labhid-tipo");
let ultimaConsulta = memoria.leer("labhid-q");

// v03: inventario en tabla para escritorio (1000 px o más). En celular siempre van tarjetas
// Fuera del navegador (las pruebas de datos importan este archivo en Node) no hay matchMedia
const ESCRITORIO = typeof matchMedia === "function" ? matchMedia("(min-width: 1000px)") : { matches: false };
let modoLista = memoria.leer("labhid-modo") || "tabla";
let orden = { col: "", asc: true };
const CLAVE_ORDEN = {
  codigo: (b) => b.Codigo_LH,
  bien: (b) => normalizar(b.Nombre),
  modelo: (b) => normalizar(b.Marca_modelo),
  ubicacion: (b) => (tieneLugar(b) ? normalizar(partesLugar(b).join(" ")) : ""),
  estado: (b) => normalizar(b.Estado_operativo || "Pendiente"),
};
const COLUMNAS = [
  ["codigo", "Código"],
  ["bien", "Bien"],
  ["modelo", "Modelo"],
  ["ubicacion", "Ubicación"],
  ["estado", "Estado"],
];

function filaTabla(b) {
  const p = partesLugar(b);
  const lugar = !tieneLugar(b) ? `<span class="nota">Pendiente</span>` : esMueble(b) ? esc(p.slice(0, -1).join(" › ")) : esc(p.join(" › "));
  return `<tr data-codigo="${esc(b.Codigo_LH)}">
    <td class="c-cod"><a class="t-codigo" data-interno href="${enlace(b.Codigo_LH)}">${esc(b.Codigo_LH)}</a></td>
    <td class="c-bien"><a data-interno href="${enlace(b.Codigo_LH)}">${esc(b.Nombre)}</a><small>${esc(TIPOS[b.Tipo_ficha]?.corto ?? "")}</small></td>
    <td>${esc(b.Marca_modelo)}</td>
    <td class="c-ubic">${lugar}${rotulo(b)}</td>
    <td>${chipEstado(b.Estado_operativo)}</td>
    <td class="c-acc"><a class="t-accion" data-interno href="${enlace(b.Codigo_LH)}">${ICONO.info}Ficha</a>${tieneLugar(b)
      ? `<a class="t-accion prin" data-interno href="${enlace(b.Codigo_LH, "&ver=3d")}">${ICONO.cubo}3D</a>`
      : `<span class="t-accion off">${ICONO.cubo}3D</span>`}</td>
  </tr>`;
}

function tabla(r) {
  const lista = orden.col
    ? [...r].sort((x, y) => {
        // Lo pendiente (vacío o «Pendiente») va siempre al final, en cualquier sentido
        const [a, b] = [CLAVE_ORDEN[orden.col](x), CLAVE_ORDEN[orden.col](y)];
        const [pa, pb] = [!a || a === "pendiente", !b || b === "pendiente"];
        if (pa !== pb) return pa ? 1 : -1;
        return a.localeCompare(b, "es", { numeric: true }) * (orden.asc ? 1 : -1);
      })
    : r;
  return `<table class="inventario">
    <thead><tr>${COLUMNAS.map(([k, t]) => `<th scope="col" aria-sort="${orden.col === k ? (orden.asc ? "ascending" : "descending") : "none"}"><button type="button" data-orden="${k}">${t}</button></th>`).join("")}<th scope="col"><span class="solo-lector">Acciones</span></th></tr></thead>
    <tbody>${lista.map(filaTabla).join("")}</tbody>
  </table>`;
}

// v03: en computadora el inicio se divide en lista y ficha. La ficha cambia sin volver a dibujar la lista
let panelInicio = null;
export function inicioDividido(raiz) {
  return panelInicio && panelInicio.raiz === raiz && raiz.querySelector("#panel-ficha") ? panelInicio : null;
}

export function vistaInicio(raiz, bienes, navegar, seleccion = null) {
  const q0 = new URLSearchParams(location.search).get("q") ?? ultimaConsulta;
  const dividida = ESCRITORIO.matches;
  // Con un bien abierto, el título de la página es el del bien (el h1 de su ficha)
  const titulo = dividida && seleccion ? "p" : "h1";
  raiz.innerHTML = `
    <section class="portada">
      <div class="portada-cabeza">
        <div>
          <p class="sobretitulo">Laboratorio de Hidráulica, UNT</p>
          <${titulo} class="portada-titulo">Encuentra un equipo del laboratorio</${titulo}>
        </div>
        ${tubos()}
      </div>
      <p>Busca su ubicación, su estado y cómo usarlo.</p>
      <label class="caja-busqueda" for="q">
        ${ICONO.buscar}
        <span class="solo-lector">Buscar un equipo</span>
        <input id="q" type="search" autocomplete="off" enterkeyhint="search" placeholder="Nombre, modelo o código" value="${esc(q0)}" />
      </label>
      <div class="filtros" role="group" aria-label="Filtrar por tipo">
        <button type="button" data-tipo="">Todos</button>
        ${Object.entries(TIPOS).map(([k, v]) => `<button type="button" data-tipo="${k}">${v.corto}</button>`).join("")}
        <button type="button" data-tipo="${MOBILIARIO}">Mobiliario</button>
      </div>
    </section>
    <div class="inicio-cuerpo">
      <section class="inicio-lista" aria-label="Equipos">
        <div class="lista-cabeza">
          <p id="conteo" class="conteo" role="status"></p>
          <div class="vista-modo" role="group" aria-label="Forma de la lista">
            <button type="button" data-modo="tabla">Tabla</button>
            <button type="button" data-modo="tarjetas">Tarjetas</button>
          </div>
        </div>
        <ul id="lista" class="lista"></ul>
        <div id="tabla" class="tabla-caja" hidden></div>
      </section>
      ${dividida ? `<aside class="panel-ficha" id="panel-ficha" aria-label="Ficha del equipo"></aside>` : ""}
    </div>`;
  raiz.classList.toggle("ancha", dividida);
  raiz.classList.toggle("dividida", dividida);
  const panel = raiz.querySelector("#panel-ficha");
  let elegido = seleccion?.Codigo_LH ?? "";
  const marcarElegido = () =>
    raiz.querySelectorAll("[data-codigo]").forEach((x) => {
      if (x.dataset.codigo === elegido) x.setAttribute("aria-current", "true");
      else x.removeAttribute("aria-current");
    });
  // Un solo h1 por página: con un bien abierto lo lleva su ficha y el título de la portada pasa a párrafo
  const ajustarTitulo = (conBien) => {
    const t = raiz.querySelector(".portada-titulo");
    const tag = conBien ? "P" : "H1";
    if (!t || t.tagName === tag) return;
    const nuevo = document.createElement(tag);
    nuevo.className = t.className;
    nuevo.textContent = t.textContent;
    t.replaceWith(nuevo);
  };
  const mostrar = (b) => {
    elegido = b?.Codigo_LH ?? "";
    marcarElegido();
    ajustarTitulo(!!b);
    // Fundido corto de la ficha nueva; la lista no se mueve
    panel.classList.remove("cambia");
    void panel.offsetWidth;
    panel.classList.add("cambia");
    if (b) {
      vistaFicha(panel, b, bienes);
      panel.scrollTop = 0;
      return;
    }
    panel.innerHTML = `<div class="panel-vacio">${tubos()}<strong>Elige un equipo de la lista</strong><span>Su ficha aparece aquí, sin dejar la búsqueda.</span></div>`;
    document.title = "Equipos LABHID";
  };
  panelInicio = dividida ? { raiz, mostrar } : null;
  const q = raiz.querySelector("#q");
  const lista = raiz.querySelector("#lista");
  const conteo = raiz.querySelector("#conteo");
  const botones = [...raiz.querySelectorAll("[data-tipo]")];
  const cajaTabla = raiz.querySelector("#tabla");
  const modos = [...raiz.querySelectorAll("[data-modo]")];
  const actualizar = () => {
    ultimaConsulta = q.value;
    memoria.guardar("labhid-q", q.value);
    memoria.guardar("labhid-tipo", filtroTipo);
    const r = filtrar(bienes, q.value, filtroTipo);
    conteo.textContent = `${r.length} ${r.length === 1 ? "bien" : "bienes"}`;
    botones.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tipo === filtroTipo)));
    const enTabla = dividida && modoLista === "tabla" && r.length > 0;
    modos.forEach((m) => m.setAttribute("aria-pressed", String(m.dataset.modo === modoLista)));
    lista.hidden = enTabla;
    cajaTabla.hidden = !enTabla;
    if (enTabla) {
      cajaTabla.innerHTML = tabla(r);
      lista.innerHTML = "";
      marcarElegido();
      return;
    }
    cajaTabla.innerHTML = "";
    lista.innerHTML = r.length
      ? r.map(tarjeta).join("")
      : `<li class="vacio">${ICONO.buscar}<strong>No encontramos ese equipo</strong><span>Prueba con otra palabra o con el modelo escrito en su placa.</span></li>`;
    marcarElegido();
  };
  modos.forEach((m) =>
    m.addEventListener("click", () => {
      modoLista = m.dataset.modo;
      memoria.guardar("labhid-modo", modoLista);
      actualizar();
    }),
  );
  cajaTabla.addEventListener("click", (e) => {
    const t = e.target.closest("[data-orden]");
    if (t) {
      orden = { col: t.dataset.orden, asc: orden.col === t.dataset.orden ? !orden.asc : true };
      actualizar();
      return;
    }
    // Toda la fila abre la ficha; los enlaces y botones de la fila siguen haciendo lo suyo
    const fila = e.target.closest("tr[data-codigo]");
    if (fila && !e.target.closest("a, button")) navegar(enlace(fila.dataset.codigo));
  });
  // Al pasar de celular a computadora (o al revés) se vuelve a dibujar con la otra disposición
  ESCRITORIO.onchange = () => raiz.isConnected && raiz.querySelector("#q") === q && dispatchEvent(new PopStateEvent("popstate"));
  q.addEventListener("input", actualizar);
  q.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const r = filtrar(bienes, q.value, filtroTipo);
    if (r.length === 1) navegar(enlace(r[0].Codigo_LH));
  });
  botones.forEach((b) =>
    b.addEventListener("click", () => {
      filtroTipo = b.dataset.tipo;
      actualizar();
    }),
  );
  actualizar();
  document.title = "Equipos LABHID";
  if (dividida) mostrar(seleccion);
}

function relacionados(titulo, codigos, porCodigo) {
  const items = codigos.map((c) => {
    const b = porCodigo.get(c);
    return b
      ? `<li><a class="enlace-fila" data-interno href="${enlace(c)}"><span>${esc(b.Nombre)}</span><small>${esc(c)}</small></a></li>`
      : `<li class="enlace-fila sin"><span>${esc(c)}</span><small>Sin ficha registrada</small></li>`;
  });
  return items.length ? `<h3>${esc(titulo)}</h3><ul class="rel">${items.join("")}</ul>` : "";
}

function bloque(id, titulo, cuerpo, abierto = true) {
  return `<details class="seccion" id="${id}" ${abierto ? "open" : ""}><summary><h2>${esc(titulo)}</h2></summary><div class="seccion-cuerpo">${cuerpo}</div></details>`;
}

export function vistaFicha(raiz, b, bienes) {
  const porCodigo = new Map(bienes.map((x) => [x.Codigo_LH, x]));
  const esp = b.Especificaciones.filter((s) => s.valor !== "Pendiente");
  const espPend = b.Especificaciones.length - esp.length;
  const padre = b.Equipo_padre ? [b.Equipo_padre] : [];
  const comps = b.Componentes ? b.Componentes.split(",").map((s) => s.trim()) : [];
  const pendientes = [b.Estado_operativo, b.Estado_metrologico, b.Proxima_fecha, b.Ultima_OT, b.Manual_operacion_URL || "Pendiente"].filter((v) => v === "Pendiente").length;
  // v03: «Abrir manual» abre el de operación si existe; si no, el de fábrica
  const manualURL = b.Manual_operacion_URL || b.Manual_fabrica_URL;
  const botonManual = manualURL
    ? `<a class="boton claro" href="${esc(manualURL)}" target="_blank" rel="noopener">${ICONO.libro}Abrir manual</a>`
    : `<span class="boton claro off" aria-disabled="true">${ICONO.libro}Manual pendiente</span>`;
  // Correcciones del 14/11 (n.° 9): foto de la placa «Inspection Tag» del fabricante
  const esEssom = /essom/i.test(`${b.Fabricante} ${b.Marca_modelo}`);
  const botonTag = b.Inspection_tag
    ? `<button type="button" class="boton claro" data-tag="./${esc(b.Inspection_tag)}">${ICONO.etiqueta}Abrir Inspection Tag</button>`
    : esEssom
      ? `<span class="boton claro off" aria-disabled="true" title="Se sube desde el panel de mantenimiento">${ICONO.etiqueta}Inspection Tag pendiente</span>`
      : "";
  const boton3d = tieneLugar(b)
    ? `<a class="boton grafito" data-interno href="${enlace(b.Codigo_LH, "&ver=3d")}">${ICONO.cubo}Ubicar en 3D</a>`
    : `<span class="boton grafito off" aria-disabled="true">${ICONO.cubo}Sin ubicación</span>`;
  const abrir = (url) => `<a class="doc-abrir" href="${esc(url)}" target="_blank" rel="noopener">${ICONO.libro}Abrir</a>`;
  const docFab = b.Manual_fabrica_URL
    ? abrir(b.Manual_fabrica_URL)
    : /\.pdf$/i.test(b.Manual_fabrica)
      ? `<span class="pend">Sin cargar</span><small class="bajo">Solicítalo al técnico</small>`
      : PEND;
  const docOp = b.Manual_operacion_URL ? abrir(b.Manual_operacion_URL) : PEND;

  raiz.innerHTML = `
    <article class="ficha">
      <div class="heroe${b.Foto ? "" : " sin-foto"}">
        ${b.Foto ? `<img src="./${esc(b.Foto)}" alt="Fotografía de ${esc(b.Nombre)}" fetchpriority="high" />` : `<span>${ICONO.cubo}<small>Sin fotografía registrada</small></span>`}
        <div class="heroe-3d" hidden aria-label="Modelo 3D del equipo"></div>
        <a class="volver" data-interno href="./" aria-label="Volver al buscador">${ICONO.atras}</a>
      </div>
      <header class="cabeza placa">
        <div class="placa-sup">
          <p class="tipo">${esc(TIPOS[b.Tipo_ficha]?.nombre ?? "")}</p>
          ${tubos("chicos")}
        </div>
        <h1>${esc(b.Nombre)}</h1>
        <p class="modelo">${esc(b.Marca_modelo)}</p>
        <p class="codigo">${esc(b.Codigo_LH)}</p>
        <div class="placa-acciones">${botonManual}${boton3d}${botonTag}</div>
        ${b._actualizado ? `<p class="ficha-actualizada">Actualizado el ${esc(fechaCorta(b._actualizado))}</p>` : ""}
      </header>

      <section class="tarjeta-lugar" aria-label="Ubicación">
        <h2>Dónde está</h2>
        ${ruta(b)}
        <div class="chips">${rotulo(b)}${tieneLugar(b) && !validada(b) ? `<span class="chip confirmar">Por confirmar</span>` : ""}</div>
        <p class="nota">${esc(b.Ubicacion_estado)}</p>
      </section>

      ${bloque("estado", "Estado", `<div class="chips">${chipEstado(b.Estado_operativo)}${b.Funcion_medicion === "Sí" ? `<span class="chip neutro">Con función de medición</span>` : ""}</div>
      <dl>
        ${fila("Estado operativo", `${esc(b.Estado_operativo || "Pendiente")}${b.Estado_operativo_fuente ? `<small class="bajo">${esc(b.Estado_operativo_fuente)}</small>` : ""}`)}
        ${fila("Estado metrológico", dato(b.Estado_metrologico))}
        ${fila("Próxima calibración o verificación", dato(b.Proxima_fecha))}
        ${fila("Última orden de trabajo", dato(b.Ultima_OT))}
        ${fila("Estado de conservación", dato(b.Estado_conservacion))}
      </dl>`)}

      ${bloque("docs", "Documentación", `<table class="docs">
        <thead><tr><th scope="col">Documento</th><th scope="col">Disponible</th></tr></thead>
        <tbody>
          <tr><td>Manual de fábrica${b.Manual_fabrica && b.Manual_fabrica !== "Pendiente" ? `<small class="bajo">${esc(b.Manual_fabrica)}</small>` : ""}</td><td>${docFab}</td></tr>
          <tr><td>Manual de operación en español</td><td>${docOp}</td></tr>
        </tbody>
      </table>`)}

      ${bloque("uso", "Uso y montaje", `<p class="descripcion">${dato(b.Descripcion_uso)}</p>`)}

      ${bloque("tecnicos", "Datos técnicos", `<dl>
        ${b.Nombre_oficial && !b.Nombre_oficial.startsWith("No aplica") ? fila("Nombre según manual", dato(b.Nombre_oficial)) : ""}
        ${fila("Fabricante", dato(b.Fabricante))}
        ${fila("Número de serie", dato(b.Serie))}
        ${esp.map((s) => fila(s.campo, esc(s.valor))).join("")}
      </dl>${espPend ? `<p class="nota">${espPend} dato(s) técnico(s) por completar.</p>` : ""}`)}

      ${padre.length || comps.length ? bloque("conjunto", "Conjunto", `${relacionados("Pertenece a", padre, porCodigo)}${relacionados("Componentes", comps, porCodigo)}`) : ""}

      ${bloque("historial", "Bitácora", b.Historial.length
        ? `<ul class="hist">${[...b.Historial].reverse().map((h) => `<li><time>${esc(h.fecha)}</time><strong>${esc(h.tipo)}</strong><span>${esc(h.resultado)}</span></li>`).join("")}</ul>`
        : `<p class="nota">Sin intervenciones registradas.</p>`, b.Historial.length > 0)}
      ${pendientes ? `<p class="nota centro">Esta ficha tiene ${pendientes} dato(s) principal(es) por completar.</p>` : ""}
      <p class="reportar"><a class="boton sec chico" href="${esc(enlaceReporte(b.Codigo_LH, b.Nombre))}" target="_blank" rel="noopener">${ICONO.alerta}Reportar un dato o una falla</a></p>
    </article>`;
  document.title = `${b.Nombre} | Equipos LABHID`;
  raiz.querySelector("[data-tag]")?.addEventListener("click", (e) => verTag(e.currentTarget.dataset.tag, b));
  montar3dFicha(raiz, b);
}

// Correcciones del 14/11 (n.° 9): la foto de la placa se abre encima de la ficha, sin salir de ella
function verTag(src, b) {
  const d = document.createElement("dialog");
  d.className = "tag-dialogo";
  d.innerHTML = `<figure><img src="${esc(src)}" alt="Placa Inspection Tag de ${esc(b.Nombre)}" /><figcaption>Inspection Tag · ${esc(b.Nombre)} · ${esc(b.Codigo_LH)}</figcaption></figure>
    <div class="tag-acciones"><a class="boton sec chico" href="${esc(src)}" target="_blank" rel="noopener">Abrir en otra pestaña</a><button type="button" class="boton chico" data-cerrar>Cerrar</button></div>`;
  document.body.append(d);
  d.addEventListener("click", (e) => {
    if (e.target === d || e.target.closest("[data-cerrar]")) d.close();
  });
  d.addEventListener("close", () => d.remove());
  d.showModal();
}

// Correcciones del 14/11 (n.° 8): al lado de la foto, el equipo en 3D para girarlo. Solo para los equipos con
// modelo propio. En computadora se carga solo; en celular, al tocar (cuida los datos móviles)
async function montar3dFicha(raiz, b) {
  const caja = raiz.querySelector(".heroe-3d");
  if (!caja || !tieneLugar(b)) return;
  const { tieneModelo } = await import("./visor.js");
  if (!(await tieneModelo(b.Codigo_LH)) || !caja.isConnected) return;
  caja.hidden = false;
  caja.closest(".heroe").classList.add("con-3d");
  const cargar = async () => {
    caja.innerHTML = `<span class="heroe-3d-aviso">Cargando el 3D...</span>`;
    try {
      const { abrirMini } = await import("./visor.js");
      await abrirMini(caja, b.Codigo_LH);
      caja.querySelector(".heroe-3d-aviso")?.remove();
      caja.insertAdjacentHTML("beforeend", `<span class="heroe-3d-ayuda">Arrastra para girar · dos dedos o rueda para acercar</span>`);
    } catch {
      caja.innerHTML = `<span class="heroe-3d-aviso">No se pudo cargar el 3D en este dispositivo</span>`;
    }
  };
  const auto = matchMedia("(min-width: 1000px)").matches && !navigator.connection?.saveData;
  if (auto) return cargar();
  caja.innerHTML = `<button type="button" class="heroe-3d-boton">${ICONO.cubo}<span>Ver el equipo en 3D</span><small>Gíralo y acércalo</small></button>`;
  caja.querySelector("button").addEventListener("click", cargar, { once: true });
}

export function vistaNoEncontrado(raiz, id) {
  raiz.innerHTML = `<section class="aviso-grande">${ICONO.buscar}<h1>No encontramos ese código</h1>
    <p>El código <strong>${esc(id)}</strong> no está registrado.</p>
    <a class="boton" data-interno href="./">Buscar un equipo</a></section>`;
}

export function vistaError(raiz, err) {
  raiz.innerHTML = `<section class="aviso-grande">${ICONO.info}<h1>No se pudieron cargar los datos</h1>
    <p>Revisa tu conexión y vuelve a intentar.</p><p class="nota">${esc(err.message)}</p>
    <a class="boton" href="./">Reintentar</a></section>`;
}

// v05: estado del modelo 3D, según modelo/estado_modelo.json (si falta, no se muestra nada)
function modeloHtml(m) {
  if (!m) return "";
  return `<h2>Modelo 3D</h2>
    <p>${esc(m.descripcion)}</p>
    <dl>
      ${fila("Edificio", esc(m.entorno))}
      ${fila("Equipos", esc(m.equipos))}
      ${(m.ajuste ?? []).map((a) => fila(a.zona, esc(a.valor))).join("")}
    </dl>
    <p class="nota">${esc(m.nota)}</p>`;
}

export function vistaAcerca(raiz, modelo = null) {
  raiz.innerHTML = `<article class="acerca">
    <h1>Acerca de este portal</h1>
    <p>Reúne la ubicación, el estado y la documentación de los equipos del Laboratorio de Hidráulica de la Universidad Nacional de Trujillo. Cada bien tiene un código QR que abre su ficha.</p>
    <h2>Cómo usarlo</h2>
    <ol class="pasos">
      <li><span><strong>Busca el equipo</strong> por nombre, modelo o código, o escanea su QR.</span></li>
      <li><span><strong>Revisa la ficha:</strong> estado, uso y datos técnicos.</span></li>
      <li><span><strong>Ubícalo en 3D:</strong> el visor marca el equipo o el lugar donde se guarda.</span></li>
    </ol>
    <h2>Qué significa cada dato</h2>
    <dl>
      ${fila("Pendiente", "El dato aún no está verificado. No se completa sin evidencia.")}
      ${fila("Por confirmar en campo", "Viene del censo del pretest y falta contrastarlo con el lugar real.")}
      ${fila("Actualizado el", "Fecha del último cambio hecho desde el panel de mantenimiento. Los cambios se ven en Novedades.")}
      ${fila("Cuadrícula del visor", "Cada cuadro del piso mide 1 m.")}
    </dl>
    ${modeloHtml(modelo)}
    <h2>Algo está mal en una ficha</h2>
    <p>Usa «Reportar un dato o una falla» al final de la ficha. Un responsable del laboratorio lo revisa y lo corrige; el reporte no cambia la ficha por sí solo.</p>
    <h2>Trabajo de tesis</h2>
    <p>«Gestión de equipos del Laboratorio de Hidráulica mediante Virtual Design and Construction, Universidad Nacional de Trujillo, 2026». Escuela de Ingeniería Civil.</p>
    <p class="nota">El portal no publica datos patrimoniales.</p>
  </article>`;
  document.title = "Acerca | Equipos LABHID";
}

const NOMBRE_ACCION = { foco: "Ubicación", general: "General", vista: "Vista", muros: "Sin muros", corte: "Corte", aislar: "Aislar", pantalla: "Ampliar" };
const ICONO_ACCION = { foco: ICONO.foco, general: ICONO.general, vista: ICONO.planta, muros: ICONO.muros, corte: ICONO.corte, aislar: ICONO.aislar, pantalla: ICONO.ampliar };
// «Vista» y «Corte» abren un menú (al pasar el mouse o al tocar); no hacen nada por sí solos
const CON_MENU = new Set(["vista", "corte"]);
const TITULO_ACCION = { foco: "Volver a la ubicación", vista: "Planta, frontal, atrás, izquierda y derecha", corte: "Cortar a una altura" };

// Correcciones del 14/11 (n.° 3): el menú «Vista» tiene estas cinco, en este orden
const VISTAS = [
  ["planta", "Planta"],
  ["derecha", "Derecha"],
  ["izquierda", "Izquierda"],
  ["posterior", "Atrás"],
  ["frontal", "Frontal"],
];
const CARAS_CUBO = [
  ["frente", "frontal", "Frente"],
  ["atras", "posterior", "Atrás"],
  ["izq", "izquierda", "Izq."],
  ["der", "derecha", "Der."],
  ["arriba", "planta", "Planta"],
  ["abajo", "", ""],
];

const nombreLugar = (b) => lugarCorto(b).split(" - ").pop();

// v05b: flechas para pasar al equipo anterior o siguiente con modelo 3D sin salir del visor
function navEquipos(b, orden) {
  const i = orden ? orden.findIndex((x) => x.Codigo_LH === b.Codigo_LH) : -1;
  if (i < 0 || orden.length < 2) return "";
  const ant = orden[(i - 1 + orden.length) % orden.length];
  const sig = orden[(i + 1) % orden.length];
  return `<div class="hoja-nav">
      <a class="boton chico sec" data-interno data-seguir href="${enlace(ant.Codigo_LH, "&ver=3d")}" aria-label="Equipo anterior: ${esc(ant.Nombre)}" title="${esc(ant.Nombre)}">${ICONO.atras}</a>
      <span>${i + 1} de ${orden.length} equipos con modelo 3D</span>
      <a class="boton chico sec siguiente" data-interno data-seguir href="${enlace(sig.Codigo_LH, "&ver=3d")}" aria-label="Equipo siguiente: ${esc(sig.Nombre)}" title="${esc(sig.Nombre)}">${ICONO.atras}</a>
    </div>`;
}

function hojaBien(b, cerrable, orden = null) {
  const verMueble = b.Contenedor && b.Contenedor !== "Pendiente" && !b.Contenedor.startsWith("SALA");
  return `${navEquipos(b, orden)}<div class="hoja-fila">
      ${miniatura(b)}
      <div class="hoja-texto"><strong>${esc(b.Nombre)}</strong><small>${esc(b.Codigo_LH)}</small></div>
      ${cerrable ? `<button type="button" class="hoja-cerrar" data-hoja="cerrar" aria-label="Cerrar">${ICONO.cerrar}</button>` : chipEstado(b.Estado_operativo)}
    </div>
    <div class="hoja-acciones">
      <a class="boton chico" data-interno href="${enlace(b.Codigo_LH)}">Ver ficha</a>
      ${b.Manual_fabrica_URL ? `<a class="boton chico sec" href="${esc(b.Manual_fabrica_URL)}" target="_blank" rel="noopener">${ICONO.libro}Manual de fábrica</a>` : ""}
      ${verMueble ? `<button type="button" class="boton chico sec" data-hoja="mueble" data-mueble="${esc(b.Contenedor)}">Qué hay en ${esc(nombreLugar(b))}</button>` : ""}
    </div>`;
}

// v03: panel de zonas (escritorio). Primero la sala, después sus muebles
function panelZonas(bienes) {
  const salas = new Map();
  for (const y of bienes) {
    if (!tieneLugar(y) || !y.Contenedor || y.Contenedor === "Pendiente") continue;
    const p = partesLugar(y);
    if (!salas.has(p[0])) salas.set(p[0], new Map());
    const m = salas.get(p[0]);
    if (!m.has(y.Contenedor)) m.set(y.Contenedor, { nombre: p.at(-1), n: 0 });
    m.get(y.Contenedor).n++;
  }
  return `<nav class="visor-zonas" id="visor-zonas" aria-label="Zonas y muebles del laboratorio">
    <h2>Zonas</h2>
    ${[...salas].map(([sala, m]) => `<section><h3>${esc(sala)}</h3><ul>${[...m]
      .map(([cod, x]) => `<li><button type="button" data-mueble="${esc(cod)}" aria-pressed="false"><span>${esc(x.nombre)}</span><small>${x.n}</small></button></li>`)
      .join("")}</ul></section>`).join("")}
  </nav>`;
}

function hojaMueble(cod, bienes) {
  const dentro = bienes.filter((y) => y.Contenedor === cod);
  const orden = [...dentro.filter((y) => y.En_muestra === "Sí"), ...dentro.filter((y) => y.En_muestra !== "Sí")];
  const nombre = dentro[0] ? nombreLugar(dentro[0]) : cod;
  return `<div class="hoja-fila">
      <div class="hoja-texto"><strong>${esc(nombre)}</strong><small>${dentro.length} ${dentro.length === 1 ? "bien registrado" : "bienes registrados"}</small></div>
      <button type="button" class="hoja-cerrar" data-hoja="cerrar" aria-label="Cerrar">${ICONO.cerrar}</button>
    </div>
    <ul class="hoja-lista">${orden.map((y) => `<li><a data-interno href="${enlace(y.Codigo_LH, "&ver=3d")}">${esc(y.Nombre)}<small>${esc(y.Codigo_LH)}</small></a></li>`).join("")}</ul>`;
}

export async function vistaVisor(raiz, b, bienes, { estaCerrado }) {
  const porCodigo = new Map(bienes.map((x) => [x.Codigo_LH, x]));
  const ancho = innerWidth >= 700;
  const acciones = (b ? ["foco", "general", "vista", "muros", "corte", "aislar", "pantalla"] : ["general", "vista", "muros", "corte", "aislar", "pantalla"])
    .filter((a) => a !== "pantalla" || (document.fullscreenEnabled && ancho));
  raiz.innerHTML = `
    <section class="visor-pagina">
      <header class="visor-cabeza">
        ${b ? `<a class="volver-ficha" data-interno href="${enlace(b.Codigo_LH)}" aria-label="Volver a la ficha">${ICONO.atras}</a>` : ""}
        <div class="visor-titulo">
          <h1>${b ? esc(b.Nombre) : "Mapa 3D del laboratorio"}</h1>
          <p>${b ? (tieneLugar(b) ? esc(partesLugar(b).join(" › ")) : "Ubicación pendiente") : "Busca un equipo o tócalo en el modelo"}</p>
        </div>
        <button type="button" class="visor-lupa" id="visor-lupa" aria-label="Buscar en el modelo" aria-expanded="false">${ICONO.buscar}</button>
        <div class="visor-busqueda" id="visor-busqueda" hidden>
          <label class="solo-lector" for="visor-q">Buscar un equipo</label>
          <input id="visor-q" type="search" autocomplete="off" enterkeyhint="search" placeholder="Nombre, modelo o código" />
          <ul id="visor-resultados"></ul>
        </div>
      </header>
      <div id="visor" class="visor">
        <div class="visor-carga" id="visor-carga" role="status">${tubos("carga")}<div class="barra"><i id="visor-barra"></i></div><span id="visor-texto">Cargando el modelo...</span></div>
        <div class="visor-pin" hidden><span>${b ? esc(b.Nombre) : ""}</span></div>
        <div class="visor-cubo" hidden>
          <div class="visor-norte" role="img" aria-label="Norte real" title="Norte real" hidden><svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="37"/><path class="flecha" d="M40 0 L46 10 L34 10 Z"/></svg><b>N</b></div>
          <div class="cubo-escena" role="group" aria-label="Cubo de vistas"><div class="cubo">
            ${CARAS_CUBO.map(([c, v, t]) => (v ? `<button type="button" class="cara ${c}" data-vista="${v}" title="Vista ${esc(VISTAS.find((x) => x[0] === v)[1].toLowerCase())}">${t}</button>` : `<span class="cara ${c}" aria-hidden="true"></span>`)).join("")}
          </div></div>
        </div>
        <div class="visor-menu visor-menu-vista" role="menu" aria-label="Vista" hidden>
          ${VISTAS.map(([v, t]) => `<button type="button" role="menuitem" data-vista="${v}">${t}</button>`).join("")}
        </div>
        <div class="visor-menu visor-menu-corte" role="group" aria-label="Corte horizontal" hidden>
          <p class="menu-estado">Sin corte</p>
          <label class="corte-altura">Altura <input type="number" inputmode="decimal" min="0.3" max="8" step="0.1" value="2.2" aria-label="Altura de corte en metros" /> m</label>
          <button type="button" data-corte="aplicar">Cortar a esa altura</button>
          <button type="button" data-corte="defecto">Por defecto (2,2 m)</button>
          <button type="button" data-corte="quitar" hidden>Quitar el corte</button>
        </div>
        <button type="button" class="visor-interruptor" data-accion="colores" role="switch" aria-checked="false" title="Estructura transparente o con sus colores">
          <span class="pista" aria-hidden="true"><i></i></span><span class="texto">Colores de la estructura</span>
        </button>
        <div class="visor-barra" role="toolbar" aria-label="Controles del modelo">
          ${acciones.map((a) => `<button type="button" ${CON_MENU.has(a) ? `data-menu="${a}" aria-haspopup="true" aria-expanded="false"` : `data-accion="${a}"`} title="${TITULO_ACCION[a] ?? NOMBRE_ACCION[a]}" ${a === "muros" || a === "aislar" || a === "corte" ? 'aria-pressed="false"' : ""}>${ICONO_ACCION[a]}<span>${NOMBRE_ACCION[a]}</span></button>`).join("")}
        </div>
      </div>
      ${panelZonas(bienes)}
      <div id="visor-hoja" class="visor-hoja" aria-live="polite"></div>
      <p id="visor-estado" class="visor-aviso" role="status"></p>
    </section>`;
  const estado = raiz.querySelector("#visor-estado");
  const carga = raiz.querySelector("#visor-carga");
  const barra = raiz.querySelector("#visor-barra");
  const texto = raiz.querySelector("#visor-texto");
  const hoja = raiz.querySelector("#visor-hoja");
  const caja = raiz.querySelector("#visor");
  document.title = `${b ? b.Nombre : "Mapa 3D"} | Equipos LABHID`;

  // Equipos con modelo 3D propio, en el orden de las flechas de la hoja (por lugar y nombre)
  let orden = null;
  let control = null;
  const hojaBase = () => {
    hoja.innerHTML = b ? hojaBien(b, false, orden) : "";
    hoja.hidden = !b;
  };
  hojaBase();
  hoja.addEventListener("click", (e) => {
    const t = e.target.closest("[data-hoja]");
    if (!t) return;
    if (t.dataset.hoja === "cerrar") {
      control?.quitarSeleccion?.();
      hojaBase();
    }
    if (t.dataset.hoja === "mueble") {
      hoja.innerHTML = hojaMueble(t.dataset.mueble, bienes);
      hoja.hidden = false;
    }
  });

  const zonas = raiz.querySelector("#visor-zonas");
  zonas.addEventListener("click", (e) => {
    const t = e.target.closest("[data-mueble]");
    if (!t) return;
    zonas.querySelectorAll("[data-mueble]").forEach((x) => x.setAttribute("aria-pressed", String(x === t)));
    hoja.innerHTML = hojaMueble(t.dataset.mueble, bienes);
    hoja.hidden = false;
  });

  // Buscador dentro del visor: va a otro bien sin volver a la lista
  const lupa = raiz.querySelector("#visor-lupa");
  const panel = raiz.querySelector("#visor-busqueda");
  const entrada = raiz.querySelector("#visor-q");
  const resultados = raiz.querySelector("#visor-resultados");
  const alternar = (abrir) => {
    panel.hidden = !abrir;
    lupa.setAttribute("aria-expanded", String(abrir));
    if (abrir) entrada.focus();
  };
  lupa.addEventListener("click", () => alternar(panel.hidden));
  entrada.addEventListener("input", () => {
    const q = entrada.value.trim();
    const r = q ? filtrar(bienes, q).slice(0, 6) : [];
    resultados.innerHTML = q && !r.length
      ? `<li class="sin-resultado">Sin resultados</li>`
      : r.map((x) => `<li><a data-interno href="${enlace(x.Codigo_LH, "&ver=3d")}">${esc(x.Nombre)}<small>${tieneLugar(x) ? esc(lugarCorto(x)) : "Ubicación pendiente"}</small></a></li>`).join("");
  });
  entrada.addEventListener("keydown", (e) => {
    if (e.key === "Escape") alternar(false);
    if (e.key === "Enter") resultados.querySelector("a")?.click();
  });

  // Guía breve la primera vez; no bloquea nada y desaparece al primer toque
  let vista = false;
  try {
    vista = !!localStorage.getItem("labhid-guia-3d");
  } catch {
    vista = false;
  }
  if (!vista && !new URLSearchParams(location.search).has("prueba")) {
    try {
      localStorage.setItem("labhid-guia-3d", "1");
    } catch {
      // Sin almacenamiento, la guía simplemente vuelve a aparecer
    }
    const guia = document.createElement("div");
    guia.className = "visor-guia";
    guia.textContent = "Gira con un dedo, acerca con dos y toca un equipo para identificarlo. Cada cuadro del piso mide 1 m.";
    caja.append(guia);
    const quitar = () => guia.remove();
    caja.addEventListener("pointerdown", quitar, { once: true });
    setTimeout(quitar, 8000);
  }

  try {
    const { abrirVisor } = await import("./visor.js");
    control = await abrirVisor(caja, b, porCodigo, {
      cerrado: estaCerrado,
      alProgreso: (p) => {
        barra.style.width = `${Math.round(p * 100)}%`;
        texto.textContent = p >= 1 ? "Preparando la vista..." : `Descargando el modelo: ${Math.round(p * 100)} %`;
      },
      alListo: ({ tipo, codigo, simulado, geometriaReal, conModelo }) => {
        carga.hidden = true;
        orden = (conModelo ?? [])
          .map((c) => porCodigo.get(c))
          .filter(Boolean)
          .sort((x, y) => lugarCorto(x).localeCompare(lugarCorto(y), "es") || x.Nombre.localeCompare(y.Nombre, "es"));
        hojaBase();
        caja.classList.add("listo");
        const etiqueta = raiz.querySelector(".visor-pin span");
        if (tipo === "padre") etiqueta.textContent = `Con: ${porCodigo.get(codigo)?.Nombre ?? codigo}`;
        if (tipo === "contenedor") etiqueta.textContent = "Se guarda aquí";
        const m = {
          bien: "",
          padre: "Este componente se guarda con su equipo principal, marcado en amarillo.",
          contenedor: "Este bien aún no tiene modelo propio: se marca el lugar donde se guarda.",
          ninguno: "Este bien aún no tiene lugar en el modelo. Consulta al técnico del laboratorio.",
          mapa: "",
        }[tipo];
        const d = !simulado
          ? ""
          : geometriaReal && (tipo === "bien" || tipo === "padre")
            ? "Modelo de demostración: el local es esquemático y el equipo usa su familia real."
            : "Modelo de demostración: el local y los volúmenes son esquemáticos.";
        estado.textContent = `${m} ${d}`.trim();
      },
      alTocar: (sel) => {
        if (!sel) return hojaBase();
        hoja.hidden = false;
        if (sel.tipo === "bien") {
          const x = porCodigo.get(sel.codigo);
          if (x && x.Codigo_LH === b?.Codigo_LH) return hojaBase();
          // Correcciones del 14/11 (n.° 1): tocar otro equipo lo selecciona de verdad: cambia la cabecera,
          // la marca amarilla y la cámara vuela a él (sin volver a la vista general)
          if (x) {
            history.pushState(null, "", enlace(x.Codigo_LH, "&ver=3d"));
            dispatchEvent(new PopStateEvent("popstate"));
            return;
          }
          hoja.innerHTML = "";
        } else {
          hoja.innerHTML = hojaMueble(sel.codigo, bienes);
        }
      },
      alFallo: () => {
        caja.classList.add("sin-3d");
        carga.hidden = false;
        carga.innerHTML = `<strong>El 3D se interrumpió</strong><span>El teléfono liberó memoria gráfica. La ubicación en texto sigue siendo válida.</span><a class="boton chico" href="${esc(location.href)}">Volver a cargar</a>`;
      },
    });
    return control;
  } catch (err) {
    console.warn("3D no disponible:", err?.message ?? err);
    caja.classList.add("sin-3d");
    carga.hidden = false;
    // Solo se culpa al dispositivo si de verdad no tiene 3D; si falló la carga, se puede reintentar
    const conWebgl = !!document.createElement("canvas").getContext("webgl2");
    const lugar = b && tieneLugar(b) ? `Búscalo en: ${esc(lugarCorto(b))}` : "Consulta la ficha del bien.";
    carga.innerHTML = conWebgl
      ? `<strong>No se pudo cargar el modelo 3D</strong><span>${lugar}</span><a class="boton chico" href="${esc(location.href)}">Volver a intentar</a>`
      : `<strong>El 3D no está disponible en este dispositivo</strong><span>${lugar}</span>`;
    return null;
  }
}

// v05: últimos cambios publicados desde el panel de mantenimiento
const NOMBRE_CAMPO = {
  Estado_operativo: "Estado operativo",
  Estado_operativo_fuente: "Fuente del estado",
  Estado_conservacion: "Estado de conservación",
  Estado_metrologico: "Estado metrológico",
  Proxima_fecha: "Próxima calibración o verificación",
  Ultima_OT: "Última orden de trabajo",
  Contenedor: "Mueble o zona",
  Ubicacion_texto: "Ubicación",
  Ubicacion_estado: "Estado de la ubicación",
  Foto: "Fotografía",
  Historial: "Bitácora",
  Alta: "Bien nuevo",
};
const valorCambio = (x) =>
  x.campo === "Alta" ? `${esc(x.valor.Nombre)}, agregado al inventario` : x.campo === "Historial" ? `${esc(x.valor.tipo)}: ${esc(x.valor.resultado)}` : x.campo === "Foto" ? "Foto nueva" : x.campo === "Ubicacion_texto" ? esc(String(x.valor).split("(")[0].trim()) : esc(x.valor);

export function vistaNovedades(raiz, bienes, cambios) {
  const porCodigo = new Map(bienes.map((b) => [b.Codigo_LH, b]));
  const q = new URLSearchParams(location.search).get("id");
  // La fuente del estado y el texto de ubicación acompañan a otro cambio: no se listan aparte
  const visibles = cambios
    .filter((x) => x.campo !== "Estado_operativo_fuente" && x.campo !== "Contenedor")
    .filter((x) => !q || x.codigo === q)
    .sort((x, y) => Date.parse(y.fecha) - Date.parse(x.fecha))
    .slice(0, 150);
  raiz.innerHTML = `<article class="novedades">
    <p class="sobretitulo">Laboratorio de Hidráulica, UNT</p>
    <h1>Novedades</h1>
    <p>Cambios recientes en el estado, la ubicación y la bitácora de los equipos.${q ? ` Solo de <strong>${esc(q)}</strong>. <a data-interno href="./?ver=novedades">Ver todas</a>` : ""}</p>
    ${visibles.length
      ? `<ul class="nov-lista">${visibles
          .map((x) => {
            const b = porCodigo.get(x.codigo);
            return `<li><time datetime="${esc(x.fecha)}">${esc(fechaCorta(x.fecha))}</time>
              <p><a data-interno href="./?id=${encodeURIComponent(x.codigo)}">${esc(b?.Nombre ?? x.codigo)}</a> <small class="t-codigo">${esc(x.codigo)}</small></p>
              <p><strong>${esc(NOMBRE_CAMPO[x.campo] ?? x.campo)}:</strong> ${valorCambio(x)}</p>
              <p class="nota">${esc(x.motivo)} (${esc(x.autor)})</p></li>`;
          })
          .join("")}</ul>`
      : `<section class="aviso-grande">${ICONO.campana}<h2>Todavía no hay novedades</h2><p>Cuando el técnico actualice un equipo, el cambio aparecerá aquí.</p></section>`}
  </article>`;
  document.title = "Novedades | Equipos LABHID";
}

// Correcciones del 14/11 (n.° 6): resultados del buscador de la barra superior. En el Mapa 3D llevan al equipo
// en el 3D; en las demás secciones, a su ficha
export function resultadosBarra(bienes, consulta, en3d) {
  const q = consulta.trim();
  if (!q) return "";
  const r = filtrar(bienes, q).slice(0, 8);
  if (!r.length) return `<li class="sin-resultado">Sin resultados</li>`;
  return r
    .map((x) => {
      const destino = en3d && tieneLugar(x) ? enlace(x.Codigo_LH, "&ver=3d") : enlace(x.Codigo_LH);
      return `<li><a data-interno href="${destino}"><strong>${esc(x.Nombre)}</strong><small>${esc(x.Codigo_LH)} · ${tieneLugar(x) ? esc(lugarCorto(x)) : "Ubicación pendiente"}</small></a></li>`;
    })
    .join("");
}
