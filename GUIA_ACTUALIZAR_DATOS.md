# Guía: actualizar los datos del portal

Para el técnico del laboratorio y los tesistas. Desde el panel se cambian el estado, la ubicación y la bitácora de un equipo, y se agregan equipos nuevos, sin tocar el Excel, el Revit ni el código. El sitio se publica solo en 1 o 2 minutos.

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

**Si en *Resource owner* no aparece `dullilen-spec`** (pasa con algunas cuentas invitadas), crea en su lugar un token clásico:
- *Settings* > *Developer settings* > *Personal access tokens* > *Tokens (classic)* > *Generate new token (classic)*;
- marca solo **public_repo** y pon un vencimiento corto.

Funciona igual en el panel, pero sirve para todos tus repositorios públicos: cuídalo más.

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

## 2b. Agregar un bien nuevo (llegó un equipo)

1. En la pestaña **Equipos**, toca **Agregar un bien nuevo**.
2. Elige **qué es**. El prefijo del código sale de ahí:
   - EQP: equipo de ensayo o componente;
   - MED: instrumento de medición;
   - TEC: interfaz, software o adquisición de datos;
   - HRR: herramienta o accesorio;
   - CON: consumible o material de vidrio;
   - MOB: mobiliario;
   - SEG: seguridad.

   El número es el siguiente libre, porque todos los prefijos comparten la misma numeración. El panel muestra el código antes de guardar.
3. Escribe el **nombre**, la ficha que le corresponde y lo que se vea en la placa (marca, modelo, serie). Lo que no sepas déjalo en blanco: queda «Pendiente». **Nunca** escribas el código patrimonial.
4. Elige el **mueble o zona**, el estado y, si puedes, toma una **foto**.
5. Escribe el motivo (por ejemplo «llegó por donación») y toca **Agregar el bien**.

El bien aparece en el buscador, con su ficha propia en `…/?id=CÓDIGO`. Con ese enlace se imprime su QR. En el Mapa 3D se ubica por su mueble: no hace falta Revit. Solo un equipo grande y fijo necesita modelarse; en ese caso, avisa a los tesistas.

Si el mueble no está en la lista, elige «Pendiente» y avisa: hay que crearlo en el Excel (hoja CONTENEDORES) y en el modelo (`LH_Contenedor`).

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

El Excel maestro vigente es `11. PORTAL\Portal-VDC_v03_PRUEBA\datos\Maestro_Bienes_LABHID.xlsx` (162 bienes). No uses el de `Portal-VDC` ni el de la v01: tienen 81.

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
   Los bienes nuevos se agregan como filas; sus campos no pedidos quedan «Pendiente».
3. Regenerar `bienes.json` con `python scripts/excel_a_json.py RUTA\Maestro_Bienes_LABHID.xlsx` y subir los cambios, o subir el Excel (sección 6).

## 6. Subir el Excel o el IFC desde GitHub (sin instalar nada)

En la página del repositorio, entra a la carpeta y usa *Add file* > *Upload files*. Al confirmar (*Commit changes*), la publicación hace todo sola.

| Qué subes | Dónde | Qué hace la publicación |
|---|---|---|
| `Maestro_Bienes_LABHID.xlsx` | `datos/` | Lo convierte con `excel_a_json.py`, que revisa hojas internas, columnas privadas y números de 12 dígitos. Si algo falla, no publica |
| Un IFC exportado de Revit (IFC4 Reference View) | `modelo_fuente/` (uno solo) | Genera el índice y el `.frag` del Mapa 3D y revisa que todo código del modelo exista en los datos |

- **Nunca subas** `Control_Interno_LABHID_NO_PUBLICAR.xlsx` ni un Revit (`.rvt`).
- El repositorio es público: lo que subas se puede descargar. El Excel maestro y el IFC no llevan datos patrimoniales, y la publicación lo comprueba.
- Los cambios del panel se siguen aplicando encima del Excel hasta que se sincronicen (sección 5).

## 7. Mapa 3D y ficha

- **General:** isométrico cercano desde afuera, desde la esquina que mira a los equipos.
- **Vista:** se abre al pasar el mouse (en celular, al tocar) con Planta, Derecha, Izquierda, Atrás y Frontal. Todas encuadran el edificio con sus propios ejes. La planta sale con el frente abajo, como en Revit.
- **Corte:** se abre igual. Escribe la altura en metros sobre el piso y toca «Cortar a esa altura», o usa «Por defecto (2,2 m)». «Quitar el corte» vuelve al modelo completo.
- **Colores de la estructura:** interruptor a la derecha. Apagado, los muros son transparentes; encendido, muestran sus materiales.
- **Cubo** dentro del anillo de la brújula: tocar una cara lleva a esa vista. La N marca el norte real.
- **Cambiar de equipo:** toca otro equipo en el modelo, usa las flechas de la hoja o busca con el buscador de arriba (en computadora). En los tres casos cambian la cabecera y la marca amarilla, y la cámara vuela al equipo. Tocar un espacio vacío no suelta la selección.
- **Ficha:** al lado de la foto aparece el equipo en 3D para girarlo y acercarlo (solo los equipos con modelo propio; en celular, al tocar).
- **Inspection Tag:** en los equipos ESSOM, la ficha tiene «Abrir Inspection Tag». La foto de la placa se sube desde el panel (sección 2, «Foto de la placa Inspection Tag»); mientras no exista, dice «pendiente».
- **Mobiliario:** filtro en el buscador para mesas, escritorios, armarios y demás muebles (código LH-MOB).

**Antes del postest (5/01/2027):** sincroniza, congela el sitio y avisa que no se usen el panel ni la hoja de campo durante la medición.
