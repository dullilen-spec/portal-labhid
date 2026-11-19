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

## 6. v05b: pedidos del 15/11 que no entraron en la v05 (15/11/2026)

Diego señaló que faltaban los cambios del visor y otros que había pedido. Se revisaron completas las conversaciones del 11–12/11 (rediseño v03) y del 15/11 (correcciones de la v03 y de R. Castillo). Estado de cada pedido:

| # | Pedido | Estado | Dónde |
|---|---|---|---|
| 1 | Botón de vistas: frontal, posterior, laterales | Hecho: menú «Vistas» con 7 vistas | `visor.js` (`dirVista`, `acciones.vista`), `vistas.js` (`VISTAS`) |
| 2 | Cubo de vistas tipo ViewCube | Hecho: dentro del anillo de la brújula; abajo a la derecha en escritorio | `vistas.js` (`CARAS_CUBO`), `tema.css` |
| 3 | El isométrico se ve muy lejos | Hecho: ejes del edificio desde las 17 columnas (el local está girado 41° en el visor) y encuadre en la zona que no tapan los paneles. Escritorio: de 68 m a 30 m, el edificio ocupa el 87 % | `visor.js` (`edificio`, `zonaLibre`, `ajustar`), `scripts/ifc_indice.mjs` (`columnas`, `fachada`) |
| 4 | Cambiar entre instrumentos sin que se deseleccione | Hecho: flechas anterior y siguiente en la hoja; la cámara sigue desde donde estaba; tocar un espacio vacío no suelta la selección (se cierra con X o Esc) | `vistas.js` (`navEquipos`), `visor.js` (`camaraPrevia`) |
| 5 | Agregar un equipo nuevo sin Revit | Hecho: alta en el panel con código automático, validación igual en la publicación y paso al Excel con `sincronizar_excel.py` | `panel.js`, `esquema.js`, `datos.js` (`nuevoBien`), `sincronizar_excel.py` |
| 6 | Flujo firme para subir Excel e IFC | Hecho: `datos/` y `modelo_fuente/` en el repositorio; la publicación convierte, revisa y bloquea si algo no cuadra | `publicar.yml`, `scripts/excel_a_json.py` (copia del de la v03) |
| 7 | Dominio | Documentado, con recomendación | `DOMINIO_Y_ACCESO.md` |
| 8 | Login y niveles de acceso | Opciones y recomendación; **falta la decisión de Diego** | `DOMINIO_Y_ACCESO.md` |
| 9 | Metas de rendimiento | Medido: modelo de 0,34 MB; ficha por QR en 1,45 s con 4G (sitio publicado). Con la 4G lenta de Lighthouse, 3,41 s: los dos archivos de datos ahora se piden a la vez | `scripts/medir_rendimiento.mjs`, `integridad/rendimiento*.txt` |

**Otros cambios y hallazgos:**
- La planta se ve alineada al edificio con el frente abajo, como en los planos de Revit. La brújula sigue marcando el norte real. Antes salía con el norte arriba y el edificio girado.
- Si la persona mueve la cámara o elige una vista apenas abre el visor, el vuelo inicial al equipo ya no le quita el control.
- **El Excel maestro vigente** es el de `11. PORTAL\Portal-VDC_v03_PRUEBA\datos` (162 bienes). El de `C:\Users\diego\Portal-VDC\datos` y el de la v01 tienen 81.
  - Su conversión reproduce `bienes.json` salvo los enlaces a manuales, que quedan vacíos porque los PDF no viajan con el sitio (el sitio ya los ocultaba).
- El IFC no lleva códigos patrimoniales. El único número de 12 cifras que aparece es una coordenada de la geometría.

**Pruebas v05b:**
- `prueba_v05.mjs`: 57 casos, 57 OK. Se agregaron 21: vistas, cubo, encuadre, cambio de equipo, toque en vacío y alta de un bien.
- Alta probada de punta a punta sobre una copia del Excel: validación con 9 casos, sitio, `sincronizar_excel.py --aplicar` y `excel_a_json.py`.

**Todavía no probado:** el Mapa 3D en un celular real. En Chrome sin ventana el 3D se dibuja por software y tarda 8,8 s con 4G, así que esa medida no sirve para un teléfono.

## 7. Correcciones del 14/11/2026 (PDF «CORRECIONES PORTAL 14-11-2026», aplicadas el 19/11)

El PDF se hizo sobre una versión anterior (v03/v04). Se aplicaron sus ideas sobre la v05b:

| # | Corrección | Qué se hizo |
|---|---|---|
| 1 | Al tocar otro equipo en el 3D solo cambiaba el cuadro de la derecha | Tocar otro equipo lo selecciona de verdad: cambian la cabecera y la marca amarilla, y la cámara vuela a él. **Además había un error:** si el rayo cruzaba la caja del equipo buscado, este ganaba aunque estuviera detrás, y no se podía elegir el de al lado. Ahora gana el más cercano |
| 2 | «Ver mapa 3D» y «General» muy lejos | General es un isométrico cercano desde afuera, desde la esquina que mira a los equipos. Llena la zona libre del visor: 87 a 93 %, a unos 30 m en escritorio |
| 3 | «Planta» pasa a «Vista», con menú al pasar el mouse: Planta, Derecha, Izquierda, Atrás, Frontal; sin tapar el modelo | Hecho. Botones chicos apilados sobre el botón; en celular, al costado de la barra. Ocupan menos del 8 % del visor. Cada vista encuadra cerca y alineada al edificio. «General» vuelve a la barra |
| 4 | «Corte»: no hacer nada al tocar; menú con altura en metros y «Por defecto» a 2,2 m | Hecho. Además: «Quitar el corte», y se rechazan alturas fuera de 0,3 a 8 m. La altura por defecto del índice pasó de 1,8 a 2,2 m |
| 5 | Interruptor estructura en colores / transparente | Interruptor «Colores de la estructura»: en celular bajo el cubo, en escritorio encima del cubo |
| 6 | Buscar dentro del Mapa 3D con el buscador de arriba | Los resultados salen debajo del buscador. En el 3D, elegir uno lleva al equipo en el 3D; Enter va al primero |
| 7 | Opción «Mobiliario» | Filtro nuevo (código LH-MOB, 15 bienes). En escritorio los filtros pasan a dos filas si no entran |
| 8 | Isométrico 3D del equipo junto a la foto, para girarlo y moverlo | Hecho para los equipos con modelo propio (hoy 4). En computadora carga solo; en celular, al tocar «Ver el equipo en 3D» |
| 9 | Botón «Abrir Inspection Tag» con la foto de la placa | Botón y ventana con la foto. Campo `Inspection_tag`, que se sube desde el panel, se valida y pasa al Excel (columna nueva). **No hay fotos de las placas** en la carpeta de la tesis: los equipos ESSOM muestran «Inspection Tag pendiente» |

**Pruebas:** `prueba_v05.mjs`, 80 de 80. Se agregaron 23 casos para estas correcciones.

**A tener en cuenta:** la placa ESSOM lleva nombres y firmas del personal del fabricante. Antes de publicarlas, conviene confirmar que se pueden mostrar o taparlos en la foto.
