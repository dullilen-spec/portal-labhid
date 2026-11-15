// v05: datos del repositorio y de los reportes. Aquí no va ningún secreto: el token de quien actualiza
// se guarda solo en su navegador.
export const REPO = "dullilen-spec/portal-labhid";
export const RAMA = "main";
export const API = "https://api.github.com";
export const RUTA_ACTUALIZACIONES = "portal/public/datos/actualizaciones.json";
export const RUTA_FOTOS = "portal/public/fotos";
export const RUTA_CAMPO_ITEMS = "campo/hoja_campo_v06.json";
export const RUTA_CAMPO_MEDICIONES = "campo/mediciones_v06.json";
export const RUTA_CAMPO_FOTOS = "campo/fotos";

// Los manuales de fábrica no se publican hasta confirmar que se pueden redistribuir (decisión del plan v05).
// Mientras sea false, los enlaces a manuales/ del Excel se ocultan y la ficha dice «Solicítalo al técnico».
export const MANUALES_PUBLICADOS = false;

// Reporte de un dato o una falla desde la ficha.
// Si FORMULARIO_REPORTE tiene la dirección de un Google Form, se usa ese (no pide cuenta).
// Debe traer {codigo} donde va el código del bien, por ejemplo:
// "https://docs.google.com/forms/d/e/XXXX/viewform?usp=pp_url&entry.123456={codigo}"
// Si está vacío, el botón abre un reporte en GitHub (pide cuenta de GitHub).
export const FORMULARIO_REPORTE = "";

export function enlaceReporte(codigo, nombre) {
  if (FORMULARIO_REPORTE) return FORMULARIO_REPORTE.replace("{codigo}", encodeURIComponent(codigo));
  const q = new URLSearchParams({ template: "reporte.yml", title: `[${codigo}] `, codigo, bien: nombre ?? "" });
  return `https://github.com/${REPO}/issues/new?${q}`;
}
