# Portal de equipos del Laboratorio de Hidráulica, UNT (beta)

Portal web para encontrar los equipos del Laboratorio de Hidráulica de la Universidad Nacional de Trujillo: dónde están, su estado, su ficha y su ubicación en un modelo 3D del laboratorio. Cada equipo tiene un código QR que abre su ficha.

Forma parte de la tesis «Gestión de equipos del Laboratorio de Hidráulica mediante Virtual Design and Construction, UNT, 2026».

**Estado:** versión beta v05. Las ubicaciones están por confirmar en campo y el modelo 3D solo tiene algunos equipos ubicados.

## Novedades de la v05

- **Panel «Actualizar información»** (`?panel`, sin pestaña en el menú): el técnico y los tesistas cambian el estado, la ubicación, la bitácora y la foto de un equipo. Se guarda en el repositorio con el token de GitHub de cada persona, y el sitio se publica solo. Guía: [`GUIA_ACTUALIZAR_DATOS.md`](GUIA_ACTUALIZAR_DATOS.md).
- **Novedades:** lista pública de los últimos cambios.
- **Reportar un dato o una falla:** botón en cada ficha.
- **Hoja de campo** en el panel: las 55 cotas supuestas del modelo v06, para medirlas en obra, también sin señal.
- **Modelo 3D:** el edificio es el modelo Revit v06 auditado contra la nube LiDAR; los equipos ubicados siguen siendo los de la v09.

## Novedades de la v05b (pedidos del 15/11)

- **Mapa 3D:**
  - botón **Vistas** con General, Isométrico, Frontal, Posterior, Izquierda, Derecha y Planta;
  - **cubo de vistas** dentro del anillo de la brújula;
  - el isométrico ahora encuadra el edificio con sus propios ejes y llena la parte libre de la pantalla (en escritorio, de 68 m a unos 30 m);
  - **flechas** para pasar de un equipo a otro sin perder la selección; tocar un espacio vacío ya no la suelta.
- **Alta de un bien nuevo** desde el panel: código automático (prefijo según el tipo, número siguiente), ficha propia para su QR y ubicación por mueble, sin Revit.
- **Subir el Excel o el IFC desde GitHub:** si están en `datos/` o en `modelo_fuente/`, la publicación los convierte y revisa (ver la guía, sección 6).
- **Dominio y niveles de acceso:** opciones y recomendación en [`DOMINIO_Y_ACCESO.md`](DOMINIO_Y_ACCESO.md).
- **Rendimiento:** `scripts/medir_rendimiento.mjs` mide la ficha por QR y el Mapa 3D con red y procesador de celular limitados.

## Dirección

`https://dullilen-spec.github.io/portal-labhid/`

Ficha de un equipo: `https://dullilen-spec.github.io/portal-labhid/?id=LH-EQP-065`

## Cómo se publica

Cada cambio que llega a la rama `main` se construye y se publica solo con GitHub Actions (`.github/workflows/publicar.yml`). Si hay un Excel maestro en `datos/` o un IFC en `modelo_fuente/`, primero se convierten. Antes de publicar se revisa que el modelo y los datos coincidan, que los cambios del panel cumplan las reglas (`scripts/validar_actualizaciones.mjs`) y que los datos no traigan columnas privadas ni números de 12 dígitos. Si algo falla, no se publica y queda el sitio anterior. Los cambios en `campo/` y en los `.md` no disparan una publicación.

## Trabajar en una PC

| Qué | Cómo |
|---|---|
| Ver el portal | `Abrir_portal.bat` (usa Node si lo hay; si no, PowerShell) |
| Verlo en un celular del mismo Wi-Fi | `Abrir_portal_en_celular.bat` y escribir en el celular la dirección que muestra la ventana |
| Instalar dependencias | `npm ci` dentro de `portal` |
| Construir | `npm run build` dentro de `portal` |
| Probar | servir `portal/dist` en el puerto 4173 (`node scripts/servir_portal.mjs 4173`) y correr `node scripts/prueba_navegador.mjs` (necesita Chrome) |

## Estructura

| Carpeta | Contenido |
|---|---|
| `portal/src` | Código del sitio: `main.js`, `vistas.js`, `visor.js` y estilos |
| `portal/public/datos` | `bienes.json`: datos publicables del Excel maestro. `actualizaciones.json`: cambios hechos desde el panel, que se aplican encima |
| `portal/public/modelo` | Modelo 3D (`modelo.frag`) e índice que une cada equipo con su elemento del modelo |
| `portal/public/fotos` | Fotos de los equipos |
| `portal/src/panel.js`, `esquema.js`, `datos.js`, `config.js` | Panel de mantenimiento, reglas de validación, carga de datos y configuración (v05) |
| `datos`, `modelo_fuente` | Opcionales: el Excel maestro y el IFC, si se suben para que la publicación los convierta (v05b) |
| `campo` | Hoja de campo del modelo v06 y mediciones registradas desde el panel. No se publica en el sitio |
| `scripts` | Servidores locales, pruebas de navegador (`prueba_navegador.mjs`, `prueba_v05.mjs`), validación de actualizaciones, sincronización con el Excel e integración del modelo (`ifc_indice.mjs`, `ifc_a_frag.mjs`) |

## Lo que no se sube

El control interno, los datos patrimoniales, los Excel de trabajo, los modelos Revit y la nube de puntos no van a este repositorio (ver `.gitignore`). Solo se admiten el Excel maestro en `datos/` y un IFC en `modelo_fuente/`, que no llevan datos patrimoniales; la publicación lo comprueba. Los manuales de fábrica tampoco se publican por ahora, hasta confirmar que se pueden redistribuir.
