# Servitech v0.3 — App de soporte técnico

PWA (web app instalable) para trabajo de soporte técnico en campo: **empresas, equipos, banco de tareas, costos de servicios, repuestos e informes con firma y PDF**.

Hecha en HTML/CSS/JavaScript puro (sin frameworks ni build), con los datos guardados en el propio dispositivo (localStorage), sincronización transparente con Firebase Cloud Firestore y respaldo manual en JSON.

## Funciones

- **Portada** tipo carpeta e inicio "En servicio" con las empresas con trabajo abierto y resumen del día.
- **Empresas**: ficha editable (razón social, RUC, dirección, contacto, notas) e historial.
- **Equipos**: registrados por empresa (tipo, marca, modelo, N° de serie, ubicación).
- **Tareas**: agrupadas por fecha/jornada con estados (Pendiente, En curso, Esperando repuestos, Completada, Cancelada), novedad, trabajo realizado y solución.
- **Costos**: listado completo de tareas con edición directa de precios, filtros rápidos por fechas (Hoy, 7 días, Este mes, Rango), subtotales por jornada, cálculo dinámico de tareas seleccionadas y **generación de liquidación en PDF para envío directo por WhatsApp y descarga**.
- **Repuestos / compras**: estados *Por comprar → Pedido → Recibido → Cambiado*.
- **Informes de servicio**: emisión consolidada por empresa y fecha de jornada, numeración correlativa anual, repuestos usados, **firma del responsable y del técnico**, descarga directa en PDF y envío directo en PDF por WhatsApp.
- **Ajustes**: sincronización Firebase con **inicio de sesión por correo/contraseña** (usa la misma cuenta en todos tus equipos para ver los mismos datos), botones *Subir este dispositivo* y *Bajar desde la nube*, copia automática de seguridad antes de reemplazar datos, respaldo/restauración JSON, nombre del técnico y moneda.

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
4. Antes de reemplazar datos se guarda una copia, recuperable en Ajustes →
   "Restaurar copia anterior".

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
