# Registro de la versión v05 del portal (15/11/2026)

Se implementó el plan `PLAN_MEJORA_PORTAL_v05.md`, aprobado por Diego («Aprobar el plan»). **No se hizo commit ni push:** todo queda en la copia local `C:\Users\diego\portal-labhid`, pendiente de su revisión. Nada se modificó en TESIS-VDC.

## 1. Qué cambió en el sitio

| Parte | Archivos | Resumen |
|---|---|---|
| Panel «Actualizar información» (A1) | `portal/src/panel.js`, `panel.css`, `esquema.js`, `config.js` | Ruta `?panel` (y `?panel&id=CÓDIGO`). Sesión con token de GitHub de grano fino, guardado solo en el navegador. Edita estado operativo y su fuente, conservación, estado metrológico, próxima calibración, última OT, mueble y ubicación, evento de bitácora y foto (WebP de 1200 px). Pide motivo e iniciales. Guarda en `portal/public/datos/actualizaciones.json` con la API de GitHub, controlando la versión del archivo (`sha`) y reintentando si otra persona guardó a la vez |
| Capa de actualizaciones | `portal/src/datos.js`, `main.js` | El sitio lee `bienes.json` (Excel) y aplica encima `actualizaciones.json`; gana el cambio más reciente de cada campo. La ficha muestra «Actualizado el …» y la bitácora va de lo más nuevo a lo más viejo. Si el archivo falta o está dañado, el portal sigue con los datos del Excel |
| Novedades (A3) | `portal/src/vistas.js` | Pestaña nueva con los últimos 150 cambios; `?ver=novedades&id=CÓDIGO` filtra por equipo |
| Reportar un dato o una falla (A2) | `vistas.js`, `config.js`, `.github/ISSUE_TEMPLATE/reporte.yml` | Botón al final de cada ficha. Hoy abre un *Issue* de GitHub con el código prellenado. Si se pone un Google Form en `FORMULARIO_REPORTE`, abre ese |
| Hoja de campo (C) | `panel.js`, `campo/hoja_campo_v06.json`, `campo/mediciones_v06.json` | Los 55 ítems de la hoja F7 con su valor modelado y su tolerancia. Estado OK / CORREGIR / REVISAR. Funciona sin señal: la hoja queda guardada en el celular y las medidas esperan en una cola hasta «Enviar lo pendiente». `campo/` no se publica en el sitio, pero el repositorio es público |
| Modelo 3D (B) | `portal/public/modelo/*`, `portal/src/visor.js`, `scripts/ifc_indice.mjs`, `scripts/ifc_a_frag.mjs` | Edificio de la v06 auditada y equipos de la v09. El visor encuadra con muros y columnas (`encuadre` en el índice), y el volado, las lamas, los cortasoles y las rejas se atenúan y se ocultan con los muros |
| Acerca | `vistas.js`, `portal/public/modelo/estado_modelo.json` | Bloque «Modelo 3D»: origen y ajuste a la nube. Se quitó la fila «Modelo de demostración», que ya no aplica |
| Caché sin conexión | `portal/public/sw.js` | `labhid-v9-v05` |

## 2. Publicación y control

- `publicar.yml`:
  - corre `scripts/validar_actualizaciones.mjs` (mismas reglas que el panel; revisa además que existan las fotos referidas);
  - extiende la revisión de privacidad a `actualizaciones.json` y busca números de 12 dígitos;
  - los cambios en `campo/**` y `*.md` no publican.
- `scripts/sincronizar_excel.py`: lleva los cambios al Excel maestro.
  - Sin `--aplicar` solo los muestra.
  - Con `--aplicar` guarda antes una copia del Excel, archiva los cambios en `actualizaciones_AAAA-MM.json` y deja el archivo activo vacío.
  - Probado sobre una copia del maestro del Drive: con `excel_a_json.py`, la ficha regenerada trae el estado y el evento nuevos.

## 3. Modelo combinado (B)

En `C:\Users\diego\LabHid_portal_v05` (fuera del Drive y del repositorio):

| Archivo | Qué es |
|---|---|
| `modelo\v06_copia_lectura.rvt`, `v09_copia_lectura.rvt` | Copias de trabajo (v06: misma huella que la entrega, ac31cf55…) |
| `modelo\LabHid_portal_v05_combinado_d.rvt` | **El que vale.** Copia de la v06 + los 4 equipos de la v09 (`ElementTransformUtils.CopyElements`), con los parámetros `LH_Codigo` y `LH_Contenedor` creados con el mismo GUID que en la v09. Los equipos de la mesada suben 1 mm para apoyarse en el tablero de la v06 (+0,904). La mesada de la v06 lleva `LH_Contenedor = MES-01`. Mismas 19 advertencias que la v06 |
| `modelo\LabHid_portal_v05_combinado.rvt`, `_b`, `_c` | Intentos fallidos del archivo de parámetros (salto de línea doble y vínculo de suelos). Se conservan; se pueden borrar si Diego lo autoriza |
| `ifc\LabHid_portal_v05.ifc` | IFC4 Reference View (7,2 MB), mismas opciones que la v09 |
| `scripts\b01_inspeccion.py`, `b02_combinar.py` | Scripts de pyRevit |

Las dos versiones comparten sistema de coordenadas: ángulo al norte 41,1079°, el mismo nivel N01 +0,004 y los mismos ID de origen. El `.frag` pesa 0,35 MB y no contiene `LH_Codigo` ni los 21 códigos patrimoniales del control interno. El índice tiene 4 bienes, 1 contenedor, 353 elementos de entorno y 43 de encuadre.

## 4. Pruebas

Resultados en `integridad\resultado_navegador.txt` (batería anterior) y `integridad\resultado_v05.txt` (nueva: `scripts\prueba_v05.mjs`). La batería nueva usa una red simulada para GitHub y nunca escribe en el repositorio real.

- `prueba_v05.mjs`: 36 casos, 36 OK, 0 fallas (panel sin token y con token simulado, guardado con reintento, validación, capa de actualizaciones, ficha, bitácora, Novedades, reporte prellenado, hoja de campo sin señal, Mapa 3D v06 en escritorio y a 375 px). Capturas en `integridad\capturas_v05\`.
- `prueba_navegador.mjs` (batería anterior, sobre la compilación final): 51 casos, 51 OK, 0 fallas. Se ajustó el caso de manuales: mientras `MANUALES_PUBLICADOS = false`, la ficha debe decir «Solicítalo al técnico» en lugar de enlazar un PDF que no viaja con el sitio (antes daba 404).

**No probado:**
- un teléfono real;
- el sitio publicado;
- la API real de GitHub (token, permisos y CORS desde github.io);
- un Google Form.

## 5. Decisiones que tomé por mi cuenta

1. **Equipos y edificio:** se combinaron en un solo modelo Revit, en lugar de cargar dos `.frag` en el visor. Así el visor no cambia de arquitectura y el índice sigue igual.
2. **Campos editables:** son solo los que cambian en el día a día. Nombre, modelo, serie, especificaciones y manuales siguen saliendo solo del Excel.
3. **Bitácora:** el autor (iniciales) queda en `actualizaciones.json`, que es público. El Excel no recibe autores, como hasta ahora.
4. **Estados de conservación:** la lista es Bueno, Regular, Malo y Pendiente. El Excel no tenía una lista cerrada para ese campo; hay que confirmarla.
