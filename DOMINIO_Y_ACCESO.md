# Dominio y niveles de acceso del portal

Respuesta a las correcciones de R. Castillo del 15/11/2026 («ver lo del login» y «tratarlo como página, con dominio»). Este documento recomienda; las decisiones son de Diego y Rubén.

## 1. Dominio

| Opción | Dirección | Costo | A favor | En contra |
|---|---|---|---|---|
| **GitHub Pages (hoy)** | `dullilen-spec.github.io/portal-labhid` | Gratis | Ya funciona, con publicación automática y HTTPS | Depende de una cuenta personal |
| Organización de GitHub | `labhid-unt.github.io/portal-labhid` | Gratis | Se le puede pasar al laboratorio al terminar la tesis | Hay que mover el repositorio |
| **Subdominio de la UNT** | `labhid.unitru.edu.pe` | Gratis | Oficial y estable | Trámite con la oficina de informática |
| Dominio propio | `labhid-unt.com` o similar | US$ 10 a 15 al año | Inmediato | Alguien debe renovarlo después de la tesis |

**Cómo se conecta un dominio a GitHub Pages:**
1. En el repositorio: *Settings* > *Pages* > *Custom domain*, escribir el dominio y marcar *Enforce HTTPS*.
2. Quien administra el dominio crea un registro `CNAME` que apunte a `dullilen-spec.github.io`.

El código no cambia, porque el sitio usa rutas relativas.

**Recomendación:**
- Seguir con GitHub Pages durante la beta.
- Pedir ya a la UNT el subdominio. Es lo más estable para un laboratorio de la universidad.
- **Cerrar la dirección antes de imprimir los QR definitivos.** Cada QR apunta a una dirección: si cambia, hay que reimprimirlos todos.
- Los QR de la beta sirven mientras el sitio siga en `github.io`.

## 2. Inicio de sesión y niveles de acceso

En la reunión del 11/11 se pidieron tres niveles:
1. técnico y escuela, con datos sensibles;
2. estudiantes, con acceso limitado;
3. público, muy limitado.

**Límite técnico:** GitHub Pages solo sirve archivos. Lo que está en el sitio lo puede descargar cualquiera que tenga la dirección, aunque la página lo esconda. Para ocultar datos de verdad, esos datos no pueden estar en el sitio público.

**Lo que ya existe (v05):**
- **Ver:** sin usuario. Quien escanea un QR entra directo a la ficha, sin pantalla de ingreso, como pide el indicador I1.
- **Editar:** solo con token de GitHub (panel `?panel`). Cada cambio queda con autor, fecha y motivo.
- **Datos sensibles** (control interno, códigos patrimoniales): nunca entran al sitio ni al repositorio. La publicación lo bloquea.

**Opciones para los niveles 1 y 2:**

| Opción | Cómo | Costo | A favor | En contra |
|---|---|---|---|---|
| **A. Drive con cuenta UNT (recomendada)** | El sitio público queda como está. Los documentos sensibles (control interno, manuales con permiso restringido, informes) van a una carpeta de Drive compartida solo con cuentas `@unitru.edu.pe`, y la ficha enlaza a ella | Gratis | No hay que mantener servidores. Google pide el inicio de sesión. Se puede dar acceso por persona o por grupo | Son dos lugares: el portal y la carpeta |
| B. Puerta de acceso delante del sitio | Cloudflare Access (gratis hasta 50 usuarios) pide una cuenta `@unitru.edu.pe` para entrar a una copia interna del portal | Gratis hasta 50 | Una sola página con todo | Hay que llevar el dominio a Cloudflare. Un QR no sirve sin iniciar sesión |
| C. Base de datos con usuarios | Supabase o Firebase, con roles por persona | Gratis al inicio | Niveles finos dentro del mismo portal | Mucho más trabajo y mantenimiento después de la tesis |

**Recomendación:** opción A para la tesis. Después, la B, si el laboratorio quiere una sola página interna.
