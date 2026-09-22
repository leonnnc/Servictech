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
js/app.js             vistas, rutas y lógica
sw.js                 service worker (offline; solo en https)
assets/               manifest e íconos
```
