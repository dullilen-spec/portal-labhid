# Guía: actualizar los datos del portal

Para el técnico del laboratorio y los tesistas. Desde el panel se cambian el estado, la ubicación y la bitácora de un equipo sin tocar el Excel ni el código. El sitio se publica solo en 1 o 2 minutos.

**Dirección del panel:** `https://dullilen-spec.github.io/portal-labhid/?panel`. No aparece en el menú; guárdala en favoritos.

## 1. La primera vez: crear tu token de GitHub

Necesitas una cuenta de GitHub con acceso de colaborador al repositorio `dullilen-spec/portal-labhid`. Diego te agrega en *Settings > Collaborators*.

1. Entra a GitHub > foto de perfil > *Settings* > *Developer settings* > *Personal access tokens* > *Fine-grained tokens* > *Generate new token*.
2. **Token name:** `Portal LABHID`.
3. **Expiration:** 90 días; al vencer, crea otro.
4. **Repository access:** *Only select repositories* > `dullilen-spec/portal-labhid`.
5. **Permissions > Repository permissions > Contents:** *Read and write*. Ningún otro permiso.
6. *Generate token* y copia el texto que empieza con `github_pat_`. GitHub no lo vuelve a mostrar.
7. En el panel pega el token, escribe tus iniciales (por ejemplo `RC`) y toca **Entrar**.

El token queda guardado **solo en ese navegador**. En una computadora compartida, usa **Cerrar sesión** al terminar. Si pierdes el celular, borra el token en GitHub (misma ruta, *Delete*).

## 2. Actualizar un equipo

1. En la pestaña **Equipos**, busca el equipo por nombre, modelo o código.
2. Cambia lo necesario:
   - **Estado operativo:** Operativo, Observado, Inoperativo o Pendiente. La «fuente» se llena sola con la fecha y tus iniciales; puedes corregirla.
   - **Estado de conservación**, **estado metrológico**, **próxima calibración** y **última orden de trabajo**.
   - **Mueble o zona:** al elegirlo se actualiza el texto de ubicación. Marca «Confirmada en campo» cuando lo hayas visto.
   - **Bitácora:** fecha, tipo y qué se hizo. Es pública: no escribas nombres completos ni códigos patrimoniales.
   - **Foto:** reemplaza la de la ficha; se reduce antes de subirla.
3. Escribe el **motivo** (por ejemplo «revisión semanal») y toca **Guardar cambios**.
4. El cambio aparece en **Novedades** y en la ficha («Actualizado el …») cuando termina la publicación. Puedes seguirla con el enlace «Ver la publicación».

**Qué valida el panel antes de guardar:** que los estados sean de la lista del Excel maestro, que las fechas sean reales (dd/mm/aaaa), que el contenedor exista, que no haya números de 12 dígitos (como un código patrimonial) y que haya un motivo. Si algo falla, no se guarda nada. La publicación vuelve a revisar todo y, si encuentra un error, no publica: queda el sitio anterior.

## 3. Hoja de campo (medidas del modelo)

Pestaña **Hoja de campo**: son los 55 ítems de la hoja F7 (cotas, perfiles y espesores supuestos en el modelo v06).

- Ábrela **una vez con señal** antes de ir a obra: queda guardada en el celular.
- En cada ítem escribe el valor medido en la unidad indicada y, si se pide, toma la foto.
- Sin señal, las medidas quedan en el celular. Al volver la señal, toca **Enviar lo pendiente**.
- El estado de cada ítem se calcula con la tolerancia: **OK**, **CORREGIR** o **REVISAR** (cuando el valor es un texto o varias cotas).
- Las medidas van a `campo/mediciones_v06.json` del repositorio. No se muestran en el sitio, pero el repositorio es público: no anotes datos personales.

## 4. Reportes de usuarios

Cada ficha tiene **Reportar un dato o una falla**.

- Hoy abre un formulario de GitHub (*Issues*), que pide cuenta.
- Para usar un Google Form (sin cuenta), pon su dirección en `portal/src/config.js`, en `FORMULARIO_REPORTE`, con `{codigo}` donde va el código del bien.

Los reportes no cambian la ficha. Un responsable los revisa y, si corresponde, aplica el cambio desde el panel.

## 5. Mantener el Excel maestro al día (tesistas)

Los cambios del panel quedan en `portal/public/datos/actualizaciones.json`, encima de lo que trae el Excel. Cada cierto tiempo hay que llevarlos al Excel:

1. Primero, solo revisión:

   ```
   python scripts/sincronizar_excel.py RUTA\Maestro_Bienes_LABHID.xlsx
   ```

2. Si está bien, escribir en el Excel:

   ```
   python scripts/sincronizar_excel.py RUTA\Maestro_Bienes_LABHID.xlsx --aplicar
   ```

   Esto guarda una copia del Excel con fecha y hora, escribe los campos y la bitácora, archiva los cambios en `actualizaciones_AAAA-MM.json` y deja vacío `actualizaciones.json`.
3. Regenerar `bienes.json` con `excel_a_json.py`, como siempre, y subir los cambios.

**Antes del postest (5/01/2027):** sincroniza, congela el sitio y avisa que no se usen el panel ni la hoja de campo durante la medición.
