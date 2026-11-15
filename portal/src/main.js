// v03: Saira servida con el sitio para que funcione sin conexión
import "@fontsource/saira/400.css";
import "@fontsource/saira/500.css";
import "@fontsource/saira-condensed/600.css";
import "@fontsource/saira-condensed/700.css";
import { cargarDatos } from "./datos.js";
import { ICONO, inicioDividido, vistaAcerca, vistaError, vistaFicha, vistaInicio, vistaNoEncontrado, vistaNovedades, vistaVisor } from "./vistas.js";

const raiz = document.getElementById("app");
const navegacion = document.getElementById("nav");
// v03: en computadora la navegación va en la barra superior y la ficha se abre al lado de la lista
const ESCRITORIO = matchMedia("(min-width: 1000px)");
const buscarBarra = document.getElementById("buscar-barra");
buscarBarra?.addEventListener("submit", (e) => {
  e.preventDefault();
  const t = buscarBarra.querySelector("input").value.trim();
  buscarBarra.querySelector("input").value = "";
  navegar(`./?q=${encodeURIComponent(t)}`);
});
let bienes = [];
let cambios = [];
let estadoModelo;
let cerrarVisor = null;
let generacion = 0;

navegacion.innerHTML = `
  <a data-interno data-seccion="buscar" href="./">${ICONO.buscar}<span>Buscar</span></a>
  <a data-interno data-seccion="mapa" href="./?ver=mapa">${ICONO.cubo}<span>Mapa 3D</span></a>
  <a data-interno data-seccion="novedades" href="./?ver=novedades">${ICONO.campana}<span>Novedades</span></a>
  <a data-interno data-seccion="acerca" href="./?ver=acerca">${ICONO.info}<span>Acerca</span></a>`;

// v05: estado del modelo 3D para «Acerca»; si falta, la sección no se muestra
async function leerEstadoModelo() {
  if (estadoModelo !== undefined) return estadoModelo;
  try {
    const r = await fetch("./modelo/estado_modelo.json", { cache: "no-cache" });
    estadoModelo = r.ok ? await r.json() : null;
  } catch {
    estadoModelo = null;
  }
  return estadoModelo;
}

// v03, animaciones (12/11/2026): una sola marca bajo la pestaña activa que se desliza entre pestañas
const indicador = document.createElement("span");
indicador.className = "nav-indicador";
indicador.setAttribute("aria-hidden", "true");
navegacion.append(indicador);
function moverIndicador() {
  const a = navegacion.querySelector('a[aria-current="page"]');
  if (!a || !a.offsetWidth) {
    indicador.style.opacity = "0";
    return;
  }
  // Margen interior igual al de la marca anterior: 14 px en computadora, 28 % del botón en celular
  const m = ESCRITORIO.matches ? 14 : a.offsetWidth * 0.28;
  indicador.style.width = `${a.offsetWidth - 2 * m}px`;
  indicador.style.transform = `translateX(${a.offsetLeft + m}px)`;
  indicador.style.opacity = "1";
}
addEventListener("resize", () => {
  navegacion.classList.remove("desliza");
  moverIndicador();
});

function marcar(seccion, en3d) {
  navegacion.querySelectorAll("a").forEach((a) => {
    if (a.dataset.seccion === seccion) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.body.classList.toggle("en-visor", en3d);
  document.body.dataset.seccion = seccion;
  navegacion.classList.add("con-indicador");
  moverIndicador();
  // La primera ubicación no se anima; desde la segunda, la marca se desliza
  requestAnimationFrame(() => navegacion.classList.add("desliza"));
}

// Entrada de cada vista: fundido corto. La ficha en celular entra desde la derecha y la vuelta, desde la izquierda
let vistaPrevia = "";
function animarEntrada(vista) {
  const tipo = vista === "ficha" ? "der" : vista === "buscar" && vistaPrevia === "ficha" ? "izq" : "fundido";
  vistaPrevia = vista;
  raiz.classList.remove("entra-fundido", "entra-der", "entra-izq");
  void raiz.offsetWidth;
  raiz.classList.add(`entra-${tipo}`);
}
raiz.addEventListener("animationend", (e) => {
  if (e.target === raiz) raiz.classList.remove("entra-fundido", "entra-der", "entra-izq");
});

async function pintar() {
  const propia = ++generacion;
  if (cerrarVisor) {
    cerrarVisor();
    cerrarVisor = null;
  }
  const q = new URLSearchParams(location.search);
  const id = q.get("id");
  const ver = q.get("ver");
  // v05: panel de mantenimiento, sin pestaña en el menú
  if (q.has("panel")) {
    raiz.classList.remove("ancha", "dividida");
    marcar("", false);
    animarEntrada("otra");
    raiz.innerHTML = `<p class="cargando">Cargando el panel...</p>`;
    const { vistaPanel } = await import("./panel.js");
    if (propia === generacion) vistaPanel(raiz, { bienes, cambios });
    return;
  }
  if (ver === "novedades") {
    raiz.classList.remove("ancha", "dividida");
    window.scrollTo(0, 0);
    marcar("novedades", false);
    animarEntrada("otra");
    return vistaNovedades(raiz, bienes, cambios);
  }
  const bien = id && bienes.find((b) => b.Codigo_LH.toLowerCase() === id.trim().toLowerCase());
  // En computadora, si la lista ya está en pantalla, solo cambia la ficha del panel: la lista conserva su lugar
  const panel = ESCRITORIO.matches && !ver && !q.has("q") && (!id || bien) ? inicioDividido(raiz) : null;
  if (panel) {
    marcar("buscar", false);
    panel.mostrar(bien || null);
    vistaPrevia = "buscar";
    return;
  }
  raiz.classList.remove("ancha", "dividida");
  window.scrollTo(0, 0);
  animarEntrada(bien && !ver ? (ESCRITORIO.matches ? "buscar" : "ficha") : ver || id ? "otra" : "buscar");
  if (id && !bien) {
    marcar("", false);
    return vistaNoEncontrado(raiz, id);
  }
  if (ver === "3d" && bien) {
    marcar("mapa", true);
    const c = await vistaVisor(raiz, bien, bienes, { estaCerrado: () => propia !== generacion });
    if (propia === generacion) cerrarVisor = c;
    else c?.();
    return;
  }
  if (bien) {
    if (ESCRITORIO.matches) {
      marcar("buscar", false);
      return vistaInicio(raiz, bienes, navegar, bien);
    }
    marcar("", false);
    return vistaFicha(raiz, bien, bienes);
  }
  if (ver === "mapa") {
    marcar("mapa", true);
    const c = await vistaVisor(raiz, null, bienes, { estaCerrado: () => propia !== generacion });
    if (propia === generacion) cerrarVisor = c;
    else c?.();
    return;
  }
  if (ver === "acerca") {
    marcar("acerca", false);
    const m = await leerEstadoModelo();
    if (propia === generacion) vistaAcerca(raiz, m);
    return;
  }
  marcar("buscar", false);
  vistaInicio(raiz, bienes, navegar);
}

function navegar(url) {
  history.pushState(null, "", url);
  pintar();
}

// Los enlaces internos no recargan la página: el modelo y los datos siguen en memoria
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-interno]");
  if (!a || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  navegar(a.getAttribute("href"));
});
window.addEventListener("popstate", pintar);

try {
  ({ bienes, cambios } = await cargarDatos());
  await pintar();
} catch (err) {
  vistaError(raiz, err);
}

// Con la ficha ya en pantalla, se adelanta el 3D para que abra al instante
const adelantar = () => {
  if (navigator.connection?.saveData) return;
  import("./visor.js").catch(() => {});
  for (const u of ["./vendor/worker.mjs", "./modelo/indice_modelo.json", "./modelo/modelo.frag"]) fetch(u).catch(() => {});
};
if ("requestIdleCallback" in window) requestIdleCallback(adelantar, { timeout: 4000 });
else setTimeout(adelantar, 2000);

if ("serviceWorker" in navigator && isSecureContext) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
