# Servitech v1.4.9 — App de soporte técnico

PWA (web app instalable) para trabajo de soporte técnico en campo: **empresas, equipos, banco de servicios, costos de servicios, repuestos e informes con firma y PDF**.

Hecha en HTML/CSS/JavaScript puro (sin frameworks ni build), con los datos guardados en el propio dispositivo (localStorage), sincronización transparente con Firebase Cloud Firestore y respaldo manual en JSON.

## Funciones

- **Portada** tipo carpeta e inicio "En servicio" con las empresas con trabajo abierto y resumen del día.
- **Empresas**: ficha editable (razón social, RUC, dirección, contacto, notas) e historial. El **correo es obligatorio** en la ficha, como dato de contacto del cliente.
- **Equipos**: registrados por empresa (tipo, marca, modelo, N° de serie, usuario y fecha de registro).
- **Servicios**: banco de servicios con estados (Pendiente, En curso, Esperando repuestos, Completado, Cancelado), novedad y el campo único *Trabajo Realizado / Solución de Servicio*. Los **⏳ Pendientes** salen en su propio bloque arriba de todo (del más antiguo al más nuevo), para que no se pierdan entre los ya atendidos. Se pueden ver **📅 por día** (los servicios de la misma fecha se juntan en un solo bloque con su subtotal y el enlace al **resumen del día**) o **🗓️ por mes** (el mes se junta y se separa por empresa, con la opción de **juntar los servicios del mes en un solo informe por empresa** cuando hay 2 o más).
- **Resumen en pantalla** (`#/resumen`): vista previa imprimible que junta los servicios de un día o de un mes (con o sin empresa) en un solo listado, con subtotal por día y total del período. Desde ahí se emite el informe oficial.
- **Costos**: listado completo de servicios con edición directa de precios, filtros rápidos por fechas (Hoy, 7 días, Este mes, Rango), subtotales por jornada, cálculo dinámico de los servicios seleccionados y **generación de liquidación en PDF para envío directo por WhatsApp y descarga**. Solo suman los servicios **Completados** (los que están en verde): los que están Pendiente, En curso, Esperando repuestos o Cancelada no entran en ningún total, ni en el subtotal del día ni en el mes.
@@@MONTO1@@@
- **El informe no cobra aparte**: no tiene un "monto total" ni un importe suelto. El cobro va donde corresponde: el costo de cada servicio se define al cerrarlo (*Costo de mano de obra / servicio*, y el módulo **Costos**) y en el informe aparece junto a ese servicio, dentro de su bloque del detalle.
- **Repuestos / compras**: estados *Por comprar → Pedido → Recibido → Cambiado*.
- **Informes de servicio**: emisión consolidada por empresa y fecha de jornada **o por mes completo** (un solo informe por empresa con todos los servicios de ese mes), numeración correlativa anual, repuestos usados, **firma del responsable y del técnico**, descarga directa en PDF y envío directo en PDF por WhatsApp. El informe es **solo el documento técnico: no pide ni imprime monto** — el cobro del servicio se establece al cerrarlo (campo *Costo de mano de obra / servicio* del servicio, y el módulo Costos). Los informes antiguos que ya tenían un monto guardado lo siguen mostrando, porque son documentos ya emitidos.  El cuerpo del informe es el **detalle de los servicios**, un bloque por cada servicio que entra, en este orden: **el servicio** (código, tipo y fecha), **el equipo en cuestión** (tipo, marca, modelo, serie y usuario), **la falla reportada**, **la solución / trabajo realizado** y **el costo de ese servicio** (solo aparece si el servicio ya está cerrado como *Completada*). Después van los **repuestos utilizados** y las **firmas**. Ya no hay secciones aparte con los textos de todos los servicios juntos: eso era lo que no se leía.
- **Conformidad del servicio, en el sitio**: al cerrar el informe el cliente está delante. Se marca **✅ Conforme** o **⚠️ No conforme (Observaciones pendientes)**, se escribe la observación si hace falta y el cliente **firma con el dedo** en el celular (obligatorio), además de su nombre y cargo. Todo eso queda en el informe y en el PDF.
- **Centro de soluciones**: cuando el cliente firma *No conforme* o deja una observación, se abre un caso con su texto, estado (*Pendiente* / *Resuelto*), tu nota de solución y la fecha de cierre. Se entra desde la portada (*Quejas por resolver*).
- **Ajustes**: sincronización Firebase con **inicio de sesión por correo/contraseña** (usa la misma cuenta en todos tus equipos para ver los mismos datos), botones *Subir este dispositivo* y *Bajar desde la nube*, copia automática de seguridad antes de reemplazar datos, respaldo/restauración JSON, nombre del técnico y moneda. El botón **Borrar todos los datos** avisa del alcance real: con sesión iniciada borra también en la nube y en los otros equipos, y confirma al terminar si llegó a subir.

## Sincronización entre la PC y el celular

Los datos viven en Firestore bajo `users/{uid}/app/main`, un documento **por
usuario**. Por eso el requisito es uno solo: **entrar con la misma cuenta
(correo y contraseña) en los dos dispositivos**.

Cómo funciona:

1. Guardas algo en el celular → se sube solo a la nube (si no hay señal queda
   en cola y sube al reconectar).
2. El otro dispositivo está escuchando el documento, así que recibe el cambio
   **en segundos**, sin tocar nada.
3. Si los dos dispositivos cambiaron a la vez (por ejemplo el celular sin
   señal), los registros se **combinan por `id`**: no se pierde lo que haya
   creado el otro equipo. Avisa en pantalla cuántos registros se combinaron.
4. **Lo que borras, se borra en los dos.** Cada borrado deja una *lápida*
   (`meta.tomb`), que se combina con la del otro equipo: un registro borrado en
   un equipo no reaparece aunque el otro todavía lo tenga. La lápida manda
   sobre la combinación por `id`.
5. **"Borrar todos los datos" también se propaga.** El botón vacía el equipo y
   sube el borrado **de inmediato** (sin los 2,5 s de espera), y deja un sello
   (`meta.wipedAt`) que el otro equipo adopta: en vez de "rescatar" sus datos
   al ver la nube vacía, se vacía también. Avisa antes de hacerlo y confirma en
   pantalla si llegó a subir. Sin sesión iniciada borra **solo** este equipo, y
   lo dice al terminar.
6. Antes de reemplazar datos se guarda una copia, recuperable en Ajustes →
   "Restaurar copia anterior".

> **Si el borrado no se queda quieto**: aparece una franja de aviso en
> cualquier pantalla — *"Un equipo con la versión anterior de la app sigue
> subiendo los datos borrados"*. Significa que en otro equipo con la misma
> cuenta quedó la **versión anterior**, que no conoce el sello y por eso repone
> sus datos. En Ajustes → Nube → *Diagnóstico de sincronización* se ve **qué
> equipo escribió por última vez**. Actualiza la app en ese equipo (Ajustes →
> *Actualizar la app*): al abrir la versión nueva adopta el borrado y la pelea
> termina. Mientras tanto este equipo sigue reponiendo el borrado, con un tope
> de una reposición cada 5 s, para no estar pisándose sin fin (que era lo que
> dejaba el indicador clavado en "Subiendo").

> **Limitación conocida**: si los dos equipos crean un registro nuevo estando
> separados (sin sincronizar entremedio), cada uno numera desde su propia
> cuenta y a los dos les puede tocar el mismo `id`; al combinarlos, uno de los
> dos se pierde. Es anterior a esta versión. Mientras no se cambien los `id` por
> identificadores únicos por equipo, conviene sincronizar antes de registrar o
> trabajar en un solo equipo por jornada.

> Sin sesión iniciada **no hay sincronización**: cada dispositivo guarda solo
> en su propio navegador. Es a propósito, para no mezclar datos de equipos
> distintos. El indicador de nube de la barra superior muestra el estado.

Requisito en Firebase: las reglas de seguridad deben estar publicadas
(ver [`firestore.rules`](firestore.rules) y `firebase-configuracion.md`,
paso 5). Si están por defecto, Firestore deniega todo y la app queda en modo
local.

Verificación automática (script local, la carpeta `pruebas/` no se publica
porque guarda capturas y datos de clientes):

```powershell
powershell -ExecutionPolicy Bypass -File pruebas\verificar-sincronizacion.ps1
```

El script crea un usuario de prueba desechable y hace **7 comprobaciones**: 4 de
sincronización (crear cuenta, escribir, leer y que no se pueda tocar los datos de
otro usuario) y 3 de que las zonas públicas quedan cerradas (que sin sesión no se
lean los datos del técnico, y que las antiguas rutas `envios/` y `respuestas/` del
enlace de conformidad respondan **403**, porque esa función ya no existe).

- Si fallan los pasos 2 y 3 (datos del técnico), es que las reglas de Firestore
  todavía no están publicadas: ver paso 5 de
  [`firebase-configuracion.md`](firebase-configuracion.md).
- Si fallan los pasos 5 a 7, quedaron publicadas las reglas viejas: publica otra vez
  [`firestore.rules`](firestore.rules), que ya solo abre `users/{uid}/app/**`.
- Si todo pasa, el script borra los documentos de prueba. Si algo falla, los deja
  para revisarlos (el usuario de prueba se borra desde Firebase → Authentication).

Y dos comprobaciones rápidas —de la conformidad y de los servicios— **sin navegador
ni nube**: cargan `store.js` y `app.js` reales en un entorno mínimo y ejecutan las
vistas y el guardado.

```bash
node pruebas\test-conformidad.js
node pruebas\test-servicios-mes.js
node pruebas\test-borrado.js
```

`test-conformidad.js` hace **51 comprobaciones**: que el formulario pide la firma del
cliente en el sitio (nombre y firma obligatorios, monto mayor que 0), que *No conforme*
abre un caso en el centro de soluciones, que las vistas se dibujan sin errores, que los
informes antiguos que quedaron pendientes se siguen abriendo, y que **no queda rastro**
del circuito por enlace (ni botones, ni funciones, ni zonas públicas en las reglas).

`test-servicios-mes.js` hace **58 comprobaciones** del agrupado por día y por mes, del
resumen en pantalla y del informe consolidado del mes (un informe por empresa, que los
servicios del mes queden Completados y que el código del informe sea correlativo).

`test-borrado.js` hace **39 comprobaciones** del borrado, con dos equipos simulados
sobre el `applySnap` y el `mergeDB` reales: que el borrado total no vuelva con la copia
vieja de la nube ni porque el otro equipo la "rescate", que un registro borrado no
resucite aunque el otro equipo todavía lo tenga y los dos hayan cambiado, que lo creado
después de un borrado total sobreviva, que la red de seguridad de "nube vacía" siga
funcionando cuando el vacío no es deliberado, y que la pelea con un equipo de la versión
anterior se limite (una reposición como mucho cada 5 s), avise en pantalla y se cierre
sola cuando ese equipo se actualiza. Al final avisa (sin fallar) del problema conocido de
los `id` repetidos entre equipos.

### Si un equipo no sincroniza (revisión en 1 minuto)

> **Abrir el mismo enlace no basta.** El enlace comparte la *app*; los *datos*
> los comparte la **cuenta**. Dos equipos con el mismo enlace pero sin sesión
> iniciada son dos islas: cada navegador guarda en su propio almacén y no se
> hablan entre sí, aunque la app se vea idéntica. Si tuviste que pasar los datos
> a mano con un respaldo JSON, esa es la señal: no había nube conectada.

Si un equipo no comparte datos, ahora lo avisa con una **franja roja** debajo de
la cabecera, en cualquier pantalla. Además, junto al icono de nube:

- **etiqueta roja "Sin sesión"** → ese equipo no comparte nada. Entra en
  Ajustes → Nube con la misma cuenta que usas en el otro.
- **punto verde, sin etiqueta** → conectado.
- **"Error"** → el detalle está en Ajustes → Nube.

Y dentro de Ajustes → Nube, el desplegable **Diagnóstico de sincronización**
muestra en texto: versión de los archivos cargados, cuenta, **uid**, si la
escucha en tiempo real está activa, cuándo fue la última sincronización, el
sello del último borrado total, **qué equipo escribió por última vez en la
nube** (Windows, Android…) y cuántos registros hay en ese equipo.

Dos cosas que conviene comparar entre los dos equipos:

1. **El uid corto debe ser el mismo.** Si difiere, cada equipo está en una
   cuenta distinta y nunca compartirán datos, hagas lo que hagas.
2. **La versión cargada debe ser la actual.** Si un equipo muestra una versión
   vieja, quedó con JavaScript antiguo en la caché: pulsa **Actualizar la app**
   (descarga la última versión y reinicia; no borra datos).

Un equipo puede seguir funcionando sin conexión: lo que haga se sube al
reconectar.

## Conformidad del servicio (en el sitio)

La conformidad se recoge siempre **en el sitio**, con el cliente delante y firmando en
tu celular. No hay enlaces ni páginas públicas: así el servicio queda cerrado en la
misma visita y no queda nada pendiente.

1. En el informe, marca **✅ Conforme** o **⚠️ No conforme (Observaciones pendientes)**.
2. Si hace falta, escribe la **observación** (obligatoria cuando es *No conforme*).
3. Escribe el **nombre y cargo del responsable** del cliente y pasa el celular para que
   **firme con el dedo**. La firma del cliente es obligatoria; la del técnico es opcional.
4. Al guardar, el informe queda emitido con su número correlativo y el PDF/listado para
   WhatsApp ya sale con la firma.

Detalles que conviene saber:

- **El informe no cobra**: no pide ni imprime monto. Es solo el documento técnico (novedad,
  trabajo realizado, repuestos y firmas); el importe se establece al cerrar el servicio,
  en el campo *Costo de mano de obra / servicio*, y se resume en el módulo **Costos**.
  Los informes antiguos que ya tenían monto guardado conservan su cifra.

- **Las quejas no se pierden**: si el cliente firma *No conforme* o deja una observación,
  se abre automáticamente un caso en el **Centro de soluciones** para resolverlo y dejar
  constancia de qué se hizo.
- **No hace falta internet**: la firma y el guardado funcionan sin conexión; si hay sesión
  iniciada, todo se sube a la nube al reconectar.
- **Informes antiguos**: los que se emitieron con la versión anterior como *Conformidad
  pendiente* se siguen abriendo y se muestran como **PENDIENTE**; basta **Editar informe**
  para dejar la conformidad firmada en el sitio.

## Comportamiento de la app

- **Vuelve solo al inicio**: si nadie usa la app durante **5 minutos**, la pantalla vuelve
  sola a la portada. Así no queda a la vista el trabajo del cliente anterior cuando el
  equipo se comparte o se queda en el taller.
- **Aviso de actualización**: al abrir la app (escritorio o móvil) se comprueba si hay una
  versión más nueva publicada y, si la hay, se ofrece actualizarla al momento (limpia la
  caché, actualiza el service worker y recarga).

## Uso local

```bash
python -m http.server 8765 --bind 127.0.0.1
```

Abre `http://127.0.0.1:8765` en el navegador.

## Instalar en el celular (Android)

1. Abre la dirección publicada en Chrome.
2. Menú (⋮) → **Agregar a pantalla de inicio**.
3. Se abre a pantalla completa como una app y funciona sin conexión.

## Documentación del proyecto

- `modelo-de-datos-servitech.md` — modelo de datos completo (fichas y campos).
- `plantilla-servitech.xlsx` — plantilla de ejemplo de las fichas.

## Estructura

```
index.html            shell de la app (SPA)
css/app.css           estilos (tema moderno)
js/store.js           capa de datos (localStorage)
js/cloud.js           sincronización con Firebase (auth + Firestore)
js/firebase-config.js configuración pública del proyecto Firebase
js/app.js             vistas, rutas y lógica
sw.js                 service worker (offline; solo en https)
manifest.webmanifest  manifest de la PWA (en la raíz, para que sus rutas resuelvan bien)
firestore.rules       reglas de seguridad de Firestore (deben estar publicadas)
assets/               íconos
```

Nota: GitHub Pages solo sirve archivos estáticos, así que no hay backend: toda la
app funciona en el navegador (datos, PDF y firma) y la conformidad se firma en el
sitio del cliente.


> **Al publicar una versión nueva** hay que subir el número en cuatro sitios, o algún
> equipo se quedará con el JavaScript viejo en la caché del navegador: la cabecera de
> `index.html` (`.app-ver`), las URLs de los assets de `index.html` (`?v=…`), la lista
> `ASSETS` de `sw.js` y el nombre de `CACHE` de `sw.js`. Las suites de pruebas comprueban
> que los cuatro vayan a la par. La app avisa sola cuando detecta una versión más nueva
> publicada y ofrece actualizarse al momento.
sitio del cliente.
