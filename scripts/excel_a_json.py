"""Valida el Excel maestro y genera portal/public/datos/bienes.json.

Publica solo una lista cerrada de columnas: una columna nueva nunca sale al sitio hasta
agregarla aquí. Si hay errores no genera nada y el portal sigue con la versión anterior.
Uso: excel_a_json.py [maestro.xlsx] [salida.json]
"""
import json
import os
import re
import sys

import openpyxl

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENTRADA = os.path.join(RAIZ, "datos", "Maestro_Bienes_LABHID.xlsx")
SALIDA = os.path.join(RAIZ, "portal", "public", "datos", "bienes.json")
INTERNO = os.path.join(RAIZ, "datos", "Control_Interno_LABHID_NO_PUBLICAR.xlsx")
HOJAS_PROHIBIDAS = {"PATRIMONIAL", "TRAZABILIDAD", "DISCREPANCIAS"}

PUBLICAS = [
    "Codigo_LH", "En_muestra", "Foto", "Nombre", "Nombre_oficial", "Marca_modelo", "Fabricante", "Serie", "Tipo_ficha",
    "Estrato", "Descripcion_uso", "Equipo_padre", "Componentes", "Contenedor", "Ubicacion_texto",
    "Ubicacion_estado", "Estado_operativo", "Estado_operativo_fuente", "Estado_conservacion",
    "Funcion_medicion", "Estado_metrologico", "Proxima_fecha", "Verificacion_inicial",
    "Plan_mantenimiento", "Software_firmware", "Ultima_OT", "Manual_fabrica", "Manual_fabrica_URL",
    "Manual_operacion_URL", "V3_pregunta", "V3_respuesta", "V3_fuente",
    # Correcciones del 14/11/2026 (n.° 9): foto de la placa del fabricante; si el Excel no tiene la columna, va vacía
    "Inspection_tag",
]
OBLIGATORIAS = ["Codigo_LH", "Nombre", "Contenedor", "Estado_operativo"]
RX_CODIGO = re.compile(r"^LH-[A-Z]{3}-\d{3}(\.\d{2}){0,2}$")
RX_PATRIMONIAL = re.compile(r"\b\d{12}\b")
ESTADOS = {"Operativo", "Inoperativo", "Observado", "Pendiente"}
METROLOGICOS = {"Calibrado", "Verificado internamente", "Calibración de fábrica no documentada", "No calibrado", "No aplica", "Pendiente"}
RX_FECHA = re.compile(r"^(\d{2}/\d{2}/\d{4}|Pendiente|No aplica)$")


def tabla(wb, nombre):
    filas = list(wb[nombre].iter_rows(values_only=True))
    h = [str(c) for c in filas[0]]
    return [dict(zip(h, f)) for f in filas[1:] if f[0] not in (None, "")]


def limpiar(v):
    return "" if v is None else str(v).strip()


def validar(bienes, contenedores):
    errores = []
    vistos = set()
    for i, b in enumerate(bienes, start=2):
        cod = limpiar(b.get("Codigo_LH"))
        pref = f"BIENES fila {i} ({cod or 'sin código'})"
        for c in OBLIGATORIAS:
            if not limpiar(b.get(c)):
                errores.append(f"{pref}: falta {c}")
        if cod and not RX_CODIGO.match(cod):
            errores.append(f"{pref}: el código no sigue el formato LH-XXX-000, con sufijos .00 si es componente")
        if cod in vistos:
            errores.append(f"{pref}: código repetido")
        vistos.add(cod)
        if limpiar(b.get("Estado_operativo")) not in ESTADOS:
            errores.append(f"{pref}: Estado_operativo debe ser {sorted(ESTADOS)}")
        if limpiar(b.get("Estado_metrologico")) not in METROLOGICOS:
            errores.append(f"{pref}: Estado_metrologico debe ser uno de los estados de la Metodología v6")
        muestra = limpiar(b.get("En_muestra"))
        if muestra not in ("Sí", "No"):
            errores.append(f"{pref}: En_muestra debe ser Sí o No")
        if muestra == "Sí" and limpiar(b.get("Estrato")) not in ("F", "G"):
            errores.append(f"{pref}: Estrato debe ser F o G")
        cont = limpiar(b.get("Contenedor"))
        if cont and cont != "Pendiente" and cont not in contenedores:
            errores.append(f"{pref}: el contenedor {cont} no está en la hoja CONTENEDORES")
        fecha = limpiar(b.get("Proxima_fecha"))
        if fecha and not RX_FECHA.match(fecha):
            errores.append(f"{pref}: Proxima_fecha debe ser dd/mm/aaaa, Pendiente o No aplica")
        for c in ("Manual_fabrica_URL", "Manual_operacion_URL"):
            u = limpiar(b.get(c))
            if u and not u.startswith(("https://", "manuales/")):
                errores.append(f"{pref}: {c} debe empezar con https:// o manuales/")
    for b in bienes:
        padre = limpiar(b.get("Equipo_padre"))
        if padre and not RX_CODIGO.match(padre):
            errores.append(f"{b.get('Codigo_LH')}: Equipo_padre no es un código válido ({padre})")
    return errores


def generar(entrada, salida):
    wb = openpyxl.load_workbook(entrada, read_only=True, data_only=True)
    filas = tabla(wb, "BIENES")
    # El Excel maestro viaja a un repositorio público: se revisa el archivo entero, no solo la salida
    interno = HOJAS_PROHIBIDAS & set(wb.sheetnames)
    if interno or (filas and any(str(c).startswith("INT_") or "patrimonial" in str(c).lower() for c in filas[0])):
        print(f"ERROR: el Excel lleva datos internos ({sorted(interno) or 'columnas internas'}). No se publicó nada.")
        return 1
    if any(RX_PATRIMONIAL.search(str(c)) for h_ in wb.worksheets for f in h_.iter_rows(values_only=True) for c in f if c is not None):
        print("ERROR: el Excel contiene un número de 12 dígitos, como un código patrimonial. No se publicó nada.")
        return 1
    contenedores = {limpiar(c["Contenedor"]) for c in tabla(wb, "CONTENEDORES")}
    errores = validar(filas, contenedores)
    if errores:
        print(f"ERROR: {len(errores)} problema(s). No se publicó nada.")
        for e in errores:
            print(" -", e)
        return 1

    specs, hist = {}, {}
    for s in tabla(wb, "ESPECIFICACIONES"):
        specs.setdefault(s["Codigo_LH"], []).append({"campo": limpiar(s["Campo"]), "valor": limpiar(s["Valor"])})
    for h in tabla(wb, "INTERVENCIONES"):
        # Los nombres de quienes intervinieron no se publican
        hist.setdefault(h["Codigo_LH"], []).append(
            {"fecha": limpiar(h["Fecha"]), "tipo": limpiar(h["Tipo"]), "resultado": limpiar(h["Resultado"])})

    bienes = []
    for b in filas:
        d = {c: limpiar(b.get(c)) for c in PUBLICAS}
        # Un enlace a un archivo local solo se publica si el archivo viaja con el sitio
        web = os.path.join(os.path.dirname(os.path.dirname(salida)))
        for c in ("Manual_fabrica_URL", "Manual_operacion_URL", "Foto", "Inspection_tag"):
            if d[c] and not d[c].startswith("https://") and not os.path.exists(os.path.join(web, d[c])):
                d[c] = ""
        d["Especificaciones"] = specs.get(b["Codigo_LH"], [])
        d["Historial"] = hist.get(b["Codigo_LH"], [])
        bienes.append(d)

    texto = json.dumps({"bienes": bienes}, ensure_ascii=False, indent=1)
    # Última barrera: ningún código del control interno puede salir, si ese archivo está disponible
    prohibidos = set()
    if os.path.exists(INTERNO):
        wi = openpyxl.load_workbook(INTERNO, read_only=True, data_only=True)
        prohibidos = {limpiar(b.get("INT_Codigo_patrimonial")) for b in tabla(wi, "PATRIMONIAL")} - {"", "No registrado", "Pendiente"}
    if RX_PATRIMONIAL.search(texto) or any(p in texto for p in prohibidos):
        print("ERROR: se detectó un código patrimonial en la salida. No se publicó nada.")
        return 1

    os.makedirs(os.path.dirname(salida), exist_ok=True)
    temporal = salida + ".tmp"
    with open(temporal, "w", encoding="utf-8") as s:
        s.write(texto)
    os.replace(temporal, salida)
    print(f"OK: {len(bienes)} bienes publicados en {salida}")
    return 0


if __name__ == "__main__":
    a = sys.argv[1] if len(sys.argv) > 1 else ENTRADA
    b = sys.argv[2] if len(sys.argv) > 2 else SALIDA
    sys.exit(generar(a, b))
