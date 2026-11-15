// v05 (15/11/2026): copiado de Portal-VDC_v03_PRUEBA y ajustado para el modelo v06.
// PRUEBA v02. Versión en Node de ifc_indice.py (en esta PC no hay Python con ifcopenshell).
// Crea el índice que une el modelo con los datos y agrega el norte real del modelo de Revit.
// Uso: node ifc_indice.mjs modelo.ifc salida.json --rumbo-x=131.1079 [--simulado]
//   --rumbo-x: rumbo (desde el norte real, en sentido horario) del eje +X del proyecto de Revit.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const requerir = createRequire(path.join(aqui, "..", "portal", "package.json"));
const modWebIFC = await import("file:///" + requerir.resolve("web-ifc").replace(/\\/g, "/").replace(/^\/+/, ""));
const WebIFC = modWebIFC.IfcAPI ? modWebIFC : modWebIFC.default;

const args = process.argv.slice(2);
const [ruta, salida] = args.filter((a) => !a.startsWith("--"));
const opcion = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const simulado = args.includes("--simulado");
const rumboX = opcion("rumbo-x") !== undefined ? Number(opcion("rumbo-x")) : null;

const api = new WebIFC.IfcAPI();
api.SetWasmPath(path.dirname(requerir.resolve("web-ifc")) + path.sep, true);
await api.Init();
const m = api.OpenModel(new Uint8Array(fs.readFileSync(ruta)));

const T = WebIFC;
const lineas = (tipo) => {
  const v = api.GetLineIDsWithType(m, tipo, true);
  const r = [];
  for (let i = 0; i < v.size(); i++) r.push(v.get(i));
  return r;
};
const linea = (id) => api.GetLine(m, id, false);
const conGeometria = (tipos) =>
  tipos.flatMap((t) => lineas(t)).map(linea).filter((e) => e.Representation).map((e) => e.GlobalId.value);

// Propiedades LH_ de cada elemento (en cualquier conjunto de propiedades)
const props = new Map();
for (const rid of lineas(T.IFCRELDEFINESBYPROPERTIES)) {
  const rel = linea(rid);
  const pset = linea(rel.RelatingPropertyDefinition.value);
  if (!pset.HasProperties) continue;
  const valores = {};
  for (const h of pset.HasProperties) {
    const p = linea(h.value);
    if (p.Name && p.NominalValue) valores[p.Name.value] = p.NominalValue.value;
  }
  for (const o of rel.RelatedObjects) props.set(o.value, { ...(props.get(o.value) ?? {}), ...valores });
}
// Descomposición (familias anidadas, muros cortina)
const hijos = new Map();
for (const rid of lineas(T.IFCRELAGGREGATES)) {
  const rel = linea(rid);
  hijos.set(rel.RelatingObject.value, rel.RelatedObjects.map((o) => o.value));
}
const partes = (id) => [id, ...(hijos.get(id) ?? []).flatMap(partes)];

const bienes = {};
const contenedores = {};
for (const id of lineas(T.IFCELEMENT)) {
  const p = props.get(id) ?? {};
  const marca = String(p.Mark ?? p.Marca ?? "");
  const cod = p.LH_Codigo || (marca.startsWith("LH-") ? marca : null);
  const guids = partes(id).map(linea).filter((e) => e.Representation).map((e) => e.GlobalId.value);
  if (cod) (bienes[String(cod).trim()] ??= []).push(...guids);
  else if (p.LH_Contenedor) (contenedores[String(p.LH_Contenedor).trim()] ??= []).push(...guids);
}
// La losa del techo se modeló como suelo (IfcSlab): se oculta junto con techos y cielos rasos para ver el interior
const esTecho = (e) => /techo|cubierta|roof/i.test(e.Name?.value ?? "");
const losasTecho = lineas(T.IFCSLAB).map(linea).filter((e) => e.Representation && esTecho(e)).map((e) => e.GlobalId.value);
const ocultar = [...conGeometria([T.IFCROOF, T.IFCCOVERING]), ...losasTecho];
// IfcPlate e IfcMember son los paneles y montantes del muro cortina
const conCodigo = new Set([...Object.values(bienes).flat(), ...Object.values(contenedores).flat()]);
// v05: el volado, sus lamas, los cortasoles y las rejas de puerta (modelos genéricos del edificio, sin LH_) se atenúan
// y se ocultan con los muros, para que no tapen el interior
const envolvente = conGeometria([T.IFCBUILDINGELEMENTPROXY]).filter((g) => !conCodigo.has(g));
const entorno = [...conGeometria([T.IFCWALL, T.IFCWALLSTANDARDCASE, T.IFCCURTAINWALL, T.IFCPLATE, T.IFCMEMBER, T.IFCDOOR, T.IFCWINDOW, T.IFCCOLUMN, T.IFCBEAM, T.IFCRAILING]), ...envolvente];
const piso = conGeometria([T.IFCSLAB]).filter((g) => !losasTecho.includes(g));
// Losa de piso del local: referencia de altura para el corte horizontal del visor
const pisoBase = lineas(T.IFCSLAB).map(linea).filter((e) => e.Representation && /piso/i.test(e.Name?.value ?? "")).map((e) => e.GlobalId.value);
const usados = new Set([...Object.values(bienes).flat(), ...Object.values(contenedores).flat(), ...ocultar, ...entorno, ...piso]);
const otros = lineas(T.IFCELEMENT).map(linea).filter((e) => e.Representation && !usados.has(e.GlobalId.value)).map((e) => e.GlobalId.value);

// Norte: dirección del eje +X del proyecto en el visor y rumbo de ese eje según Revit.
// That Open (fragments 3.6) aplica la rotación del IfcSite: en el visor, el eje X del proyecto es la RefDirection
// del IfcSite (verificado el 7/11/2026: la grilla del visor queda girada respecto de los muros). --eje-x=proyecto la ignora.
let norte = null;
if (rumboX !== null) {
  let ejeX = [1, 0];
  const sitio = lineas(T.IFCSITE).map(linea)[0];
  if (opcion("eje-x") !== "proyecto" && sitio?.ObjectPlacement) {
    const lp = linea(sitio.ObjectPlacement.value);
    const ap = linea(lp.RelativePlacement.value);
    if (ap.RefDirection) {
      const d = linea(ap.RefDirection.value).DirectionRatios.map((x) => x.value);
      const n = Math.hypot(d[0], d[1]);
      ejeX = [d[0] / n, d[1] / n];
    }
  }
  // Un rumbo es horario desde el norte: el norte es el eje +X girado rumboX grados en sentido antihorario
  const a = (rumboX * Math.PI) / 180;
  const plano = [ejeX[0] * Math.cos(a) - ejeX[1] * Math.sin(a), ejeX[0] * Math.sin(a) + ejeX[1] * Math.cos(a)];
  norte = {
    rumbo_eje_x_grados: rumboX,
    eje_x_plano: ejeX.map((x) => +x.toFixed(6)),
    // En el visor (three.js): x = X del IFC, y = Z del IFC, z = -Y del IFC
    direccion_visor: [+plano[0].toFixed(6), 0, +(-plano[1]).toFixed(6)],
    fuente: "Modelo_LabHid_v08.rvt: ángulo al norte real 41,1079° (plano U-01, confirmado por R. Castillo)",
  };
}

// Altura del corte del visor sobre la cara superior del piso (pedido de R. Castillo, 7/11/2026)
const corte = { altura_m: Number(opcion("corte") ?? 1.8), piso_base: pisoBase };
// v05: el visor encuadra con el edificio (muros, muro cortina y columnas), no con las veredas ni el volado
const encuadre = conGeometria([T.IFCWALL, T.IFCWALLSTANDARDCASE, T.IFCCURTAINWALL, T.IFCCOLUMN]);
const res = { simulado, bienes, contenedores, ocultar, entorno, piso, otros, encuadre, geometria_real: Object.keys(bienes), norte, corte };
fs.writeFileSync(salida, JSON.stringify(res));
console.log(`Índice: ${Object.keys(bienes).length} bienes, ${Object.keys(contenedores).length} contenedores, ${entorno.length} de entorno, ${piso.length} pisos, ${ocultar.length} ocultos, ${otros.length} otros`);
if (norte) console.log("Norte:", JSON.stringify(norte));
api.CloseModel(m);
