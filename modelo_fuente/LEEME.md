# IFC del Mapa 3D

Si subes aquí un IFC exportado desde Revit (IFC4 Reference View, con los parámetros `LH_Codigo` y `LH_Contenedor`), la publicación genera el índice y el `.frag` del visor antes de construir el sitio.

- Debe haber un solo `.ifc` en esta carpeta.
- GitHub acepta archivos de hasta 100 MB. El IFC del portal v05 pesa 7,2 MB.
- El `.frag` publicado no lleva los parámetros del modelo, solo la geometría y los identificadores.
- Si un código del modelo no existe en los datos, no se publica.
- El norte usa el ángulo del modelo de Revit (41,1079°). Si cambia el modelo base, cambia `RUMBO_X` en `.github/workflows/publicar.yml`.
