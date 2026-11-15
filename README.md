# Portal de equipos del Laboratorio de Hidráulica, UNT (beta)

Portal web para encontrar los equipos del Laboratorio de Hidráulica de la Universidad Nacional de Trujillo: dónde están, su estado, su ficha y su ubicación en un modelo 3D del laboratorio. Cada equipo tiene un código QR que abre su ficha.

Forma parte de la tesis «Gestión de equipos del Laboratorio de Hidráulica mediante Virtual Design and Construction, UNT, 2026».

**Estado:** versión beta. Las ubicaciones están por confirmar en campo y el modelo 3D solo tiene algunos equipos ubicados.

## Dirección

`https://dullilen-spec.github.io/portal-labhid/`

Ficha de un equipo: `https://dullilen-spec.github.io/portal-labhid/?id=LH-EQP-065`

## Cómo se publica

Cada cambio que llega a la rama `main` se construye y se publica solo con GitHub Actions (`.github/workflows/publicar.yml`). Antes de publicar se revisa que los datos no traigan columnas privadas. Si algo falla, no se publica y queda el sitio anterior.

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
| `portal/public/datos` | `bienes.json`: solo los datos publicables de cada equipo |
| `portal/public/modelo` | Modelo 3D (`modelo.frag`) e índice que une cada equipo con su elemento del modelo |
| `portal/public/fotos` | Fotos de los equipos |
| `scripts` | Servidores locales, prueba de navegador y capturas |

## Lo que no se sube

El control interno, los datos patrimoniales, los Excel de trabajo, los modelos Revit, los IFC y la nube de puntos no van a este repositorio (ver `.gitignore`). Los manuales de fábrica tampoco se publican por ahora, hasta confirmar que se pueden redistribuir.
