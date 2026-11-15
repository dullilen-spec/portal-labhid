"""v05: lleva al Excel maestro los cambios hechos desde el panel (portal/public/datos/actualizaciones.json).

Uso:  python scripts/sincronizar_excel.py RUTA\\Maestro_Bienes_LABHID.xlsx [--aplicar]
- Sin --aplicar solo muestra lo que cambiaría (no toca nada).
- Con --aplicar:
  1. guarda una copia del Excel con fecha y hora junto al original (no se borra nada);
  2. escribe los campos en la hoja BIENES y agrega los eventos a INTERVENCIONES;
  3. pasa los cambios aplicados a portal/public/datos/actualizaciones_AAAA-MM.json (archivo histórico, el sitio no lo lee)
     y deja actualizaciones.json vacío, porque ahora esos datos ya vienen del Excel.
Después hay que correr excel_a_json.py como siempre para regenerar bienes.json.
No escribe nombres de personas en el Excel: el autor queda solo en el archivo histórico (iniciales).
"""
import datetime as dt
import json
import os
import shutil
import sys

import openpyxl

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(RAIZ, "portal", "public", "datos")
ACT = os.path.join(DATOS, "actualizaciones.json")
CAMPOS_BIENES = {"Estado_operativo", "Estado_operativo_fuente", "Estado_conservacion", "Estado_metrologico", "Proxima_fecha",
                 "Ultima_OT", "Contenedor", "Ubicacion_texto", "Ubicacion_estado", "Foto"}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    aplicar = "--aplicar" in sys.argv
    global ACT
    # --desde=archivo.json solo para pruebas: lee otro archivo de cambios
    for a in sys.argv[1:]:
        if a.startswith("--desde="):
            ACT = a.split("=", 1)[1]
    if not args:
        sys.exit(__doc__)
    maestro = args[0]
    datos = json.load(open(ACT, encoding="utf-8"))
    cambios = sorted(datos.get("cambios", []), key=lambda x: x["fecha"])
    if not cambios:
        print("No hay cambios del panel por sincronizar.")
        return 0

    wb = openpyxl.load_workbook(maestro)
    hb = wb["BIENES"]
    cab = [c.value for c in hb[1]]
    fila_de = {hb.cell(r, 1).value: r for r in range(2, hb.max_row + 1) if hb.cell(r, 1).value}
    hi = wb["INTERVENCIONES"]
    cab_i = [c.value for c in hi[1]]
    print(f"{len(cambios)} cambio(s) del panel:")
    faltan = []
    for x in cambios:
        r = fila_de.get(x["codigo"])
        if r is None:
            faltan.append(x["codigo"])
            continue
        if x["campo"] == "Historial":
            v = x["valor"]
            print(f"  {x['codigo']}: evento {v['fecha']} {v['tipo']}: {v['resultado']}")
            if aplicar:
                fila = {"Codigo_LH": x["codigo"], "Fecha": v["fecha"], "Tipo": v["tipo"], "Resultado": v["resultado"]}
                hi.append([fila.get(c, "") for c in cab_i])
        elif x["campo"] in CAMPOS_BIENES:
            col = cab.index(x["campo"]) + 1
            antes = hb.cell(r, col).value
            print(f"  {x['codigo']}: {x['campo']}: {antes!r} -> {x['valor']!r}")
            if aplicar:
                hb.cell(r, col).value = x["valor"]
    if faltan:
        print("ERROR: estos códigos no están en el Excel:", sorted(set(faltan)), "No se aplicó nada.")
        return 1
    if not aplicar:
        print("\nSolo revisión. Para escribir en el Excel agrega --aplicar.")
        return 0

    sello = dt.datetime.now().strftime("%Y%m%d_%H%M")
    base, ext = os.path.splitext(maestro)
    copia = f"{base}_antes_sync_{sello}{ext}"
    shutil.copy2(maestro, copia)
    wb.save(maestro)
    mes = dt.date.today().strftime("%Y-%m")
    hist = os.path.join(os.path.dirname(os.path.abspath(ACT)), f"actualizaciones_{mes}.json")
    previo = json.load(open(hist, encoding="utf-8"))["cambios"] if os.path.exists(hist) else []
    with open(hist, "w", encoding="utf-8") as f:
        json.dump({"version": 1, "sincronizado": dt.datetime.now().isoformat(timespec="seconds"), "cambios": previo + cambios}, f, ensure_ascii=False, indent=1)
    with open(ACT, "w", encoding="utf-8") as f:
        json.dump({"version": 1, "cambios": []}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"\nListo. Copia de respaldo: {copia}")
    print(f"Cambios archivados en {hist}; actualizaciones.json quedó vacío.")
    print("Ahora corre excel_a_json.py para regenerar bienes.json y sube los cambios.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
