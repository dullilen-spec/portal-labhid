# Excel maestro

Si subes aquí `Maestro_Bienes_LABHID.xlsx` (en GitHub: *Add file → Upload files*), la publicación lo convierte a `portal/public/datos/bienes.json` con `scripts/excel_a_json.py` antes de construir el sitio.

- Si el Excel tiene un error, una hoja interna o un número de 12 dígitos, no se publica nada y queda el sitio anterior.
- Nunca subas `Control_Interno_LABHID_NO_PUBLICAR.xlsx`.

Los cambios del panel (`actualizaciones.json`) se siguen aplicando encima. Para pasarlos al Excel, usa `scripts/sincronizar_excel.py` (ver `GUIA_ACTUALIZAR_DATOS.md`).
