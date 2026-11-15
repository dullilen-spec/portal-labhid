# Plan de mejora del portal LABHID (beta v04 → v05)

**Estado:** aprobado por Diego el 15/11/2026 e implementado en local (ver `REGISTRO_v05.md`). Sin commit ni push.
**Repositorio:** `C:\Users\diego\portal-labhid` (GitHub: dullilen-spec/portal-labhid). Sitio estático en GitHub Pages, construido con Vite.

**Reglas que valen para todo el plan:**
- No hacer commit ni push sin que Diego lo pida.
- No publicar datos patrimoniales ni el control interno.
- Un dato sin evidencia queda «Pendiente».
- El Excel maestro sigue siendo la fuente de los datos fijos.
- TESIS-VDC es de solo lectura.

---

## A. Apartado «Actualizar» (el pedido principal)

### A1. Panel de mantenimiento (técnico y tesistas)

**Acceso:**
- Ruta `?panel`, sin enlace visible en el menú público.
- Para guardar se pide un **token de GitHub de grano fino**: solo este repositorio, permiso *Contents: read and write*. Cada persona lo crea con su cuenta y queda guardado solo en su navegador (`localStorage`), con un botón «Cerrar sesión». Sin token se puede ver el panel, pero no guardar.
- El token nunca va en el repositorio ni en el código.

**Qué se edita** (solo los campos que cambian en el día a día; los campos fijos siguen saliendo del Excel):
- `Estado_operativo` y su fuente, `Estado_conservacion` (listas cerradas).
- `Ubicacion_texto`, `Ubicacion_estado` y `Contenedor` (lista de contenedores).
- `Estado_metrologico`, `Proxima_fecha` (fecha validada) y `Ultima_OT`.
- **Evento de historial:** fecha, tipo (mantenimiento, calibración, traslado, falla u observación), descripción y quién (iniciales).
- **Foto nueva** opcional: se reduce en el navegador a WebP de ~1200 px.

**Cómo se guarda:**
1. El panel arma un cambio en `portal/public/datos/actualizaciones.json` (una capa encima de `bienes.json`). Cada entrada lleva: código, campo, valor anterior, valor nuevo, fecha, autor y motivo.
2. Lo sube con la API de GitHub (`PUT /repos/{o}/{r}/contents/...`, con control de versión `sha` para no pisar cambios de otro).
3. El push dispara `publicar.yml`; el sitio se actualiza en 1–2 minutos.
4. El panel muestra «Guardado, se publica en unos minutos» y el enlace a la ejecución de Actions.

**Al cargar el sitio:**
- `main.js` lee `bienes.json` y `actualizaciones.json` y aplica la última versión de cada campo.
- La ficha muestra «Actualizado el dd/mm/aaaa».
- El **historial** del bien suma los eventos nuevos.

**Validación:**
- Esquema JSON en `scripts/esquema_actualizaciones.json`, comprobado:
  - en el panel, antes de enviar;
  - en el workflow, antes de construir.
- Si falla, no se publica (igual que hoy con la revisión de privacidad).
- La revisión de privacidad de `publicar.yml` se extiende a `actualizaciones.json`.

**Regreso al Excel:**
- Script `scripts/sincronizar_excel.py`: lleva las actualizaciones al `Maestro_Bienes_LABHID.xlsx` local, guardando primero una copia con fecha. Así el Excel no se queda atrás.
- Después de sincronizar, `actualizaciones.json` se archiva por período (`actualizaciones_2026-11.json`); no se borra.

### A2. «Reportar un dato o una falla» (cualquier usuario, desde la ficha)

- Botón en cada ficha, con un formulario corto: qué está mal, valor correcto, comentario y foto opcional.
- **Opción 1, recomendada si el técnico tiene GitHub:** abre un *Issue* del repositorio con plantilla `.github/ISSUE_TEMPLATE/reporte.yml`. El código del bien viene prellenado desde la URL. Los tesistas lo revisan y lo aplican desde el panel.
- **Opción 2, para usuarios sin cuenta:** un Google Form con el código prellenado. Las respuestas van a una hoja de Diego y se revisan a mano.
- Los reportes nunca cambian la ficha por sí solos: siempre los revisa alguien con acceso al panel.

### A3. Pantalla «Novedades»

- Lista de los últimos cambios publicados (de `actualizaciones.json`), con filtro por equipo.
- Sirve de bitácora visible y de evidencia para la tesis (indicadores de actualización).

---

## B. Modelo 3D con las correcciones del modelado

- **Hoy:** el Mapa 3D usa el IFC v09 de prueba, por decisión de Diego del 12/11. La v06 auditada no se mostraba porque el modelado seguía en curso.
- **Ahora:** la auditoría terminó (v06: muro cortina continuo, veredas, volado con lamas, cortasoles N y rejas de puertas).
- **Propuesta:** el **entorno** (edificio) sale de la v06 y los **equipos** siguen saliendo del modelo que los tiene (v09), porque la v06 no tiene equipos colocados.

**Pasos:**
1. Exportar la v06 a IFC4 Reference View con pyRevit, desde una copia, sin tocar la entrega.
2. `integrar_modelo.py` → `entorno.frag`.
3. Comprobar con 3 puntos de control (esquinas del muro cortina y una columna) que v06 y v09 comparten coordenadas.
4. El visor carga los dos `.frag`, y el índice de equipos sigue apuntando a v09.
5. Comprobar el peso del `.frag` en celular. Si pasa de unos 3 MB, simplificar: sin lamas ni brazos de cortasol a distancia (nivel de detalle).

**Bloque «Estado del modelo» en «Acerca»:**
- versión (v06), fecha y ajuste a la nube (veredas 99–100 %, muro cortina 95 %, volado 93–95 %, cortasoles 88–98 %);
- número de cotas pendientes de campo, enlazado al panel (C).

---

## C. (Opcional) Hoja de campo en el panel

- Pestaña «Campo» del panel con los 55 ítems de la hoja F7: elemento, qué medir, valor modelado y tolerancia.
- En obra se escribe el valor medido desde el celular y se adjunta la foto. Se guarda igual que A1, en `campo_v06.json`, que no es público: va en una ruta que el sitio no enlaza y se excluye de `dist`.
- Al volver, un script compara los valores con las tolerancias, genera la lista de correcciones del modelo y actualiza la hoja xlsx.

---

## D. Pruebas y publicación

1. Pruebas del navegador (`scripts/prueba_navegador.mjs`), con casos nuevos:
   - panel sin token;
   - panel con token simulado;
   - capa de actualizaciones aplicada;
   - historial;
   - reporte prellenado;
   - Mapa 3D con dos fragmentos;
   - celular a 375 px.
2. Subir la versión de caché de `portal/public/sw.js` (hoy `labhid-v8-prueba-v03`), porque cambian datos y modelo.
3. Actualizar `README.md` y crear la guía corta `GUIA_ACTUALIZAR_DATOS.md`, para el técnico: crear el token, editar, ver el historial.
4. **Push solo cuando Diego lo pida.** Se hace desde su terminal (`git -C C:\Users\diego\portal-labhid push`).

---

## Decisiones que necesita Diego

| # | Pregunta | Recomendación |
|---|---|---|
| 1 | ¿Quiénes van a actualizar y tienen cuenta de GitHub? | Tesistas y técnico, con token propio (A1) |
| 2 | Reportes de usuarios: ¿Issue de GitHub o Google Form? | Google Form si los alumnos no tienen GitHub |
| 3 | ¿Pasar ya el entorno del Mapa 3D a la v06 auditada? | Sí, con los equipos de v09 encima (B) |
| 4 | ¿Incluir la hoja de campo en el panel? | Sí, es útil para la visita de medición (C) |
| 5 | ¿Se publican los manuales de fábrica? | Seguir sin publicarlos hasta confirmar el permiso |

**Orden de trabajo sugerido:** A1 → A3 → B → A2 → C → D.
