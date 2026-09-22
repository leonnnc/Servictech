# Endpoint de envío de correo (conformidad del cliente)

Este es el único trozo de Servitech que **no** vive en GitHub Pages, porque
GitHub Pages solo sirve archivos estáticos y no ejecuta PHP. Son dos archivos
que van a **tu hosting**, en una carpeta propia.

- Tiempo estimado: 15 minutos.
- Costo: **0** (usa tu hosting y tu correo actuales).

## Qué hace exactamente

1. La app le manda `{ uid, token }`.
2. Este archivo consulta Firestore y lee el documento del envío.
3. Toma **de ahí** el correo del cliente, el resumen y el enlace.
4. Envía el correo por SMTP.

La consecuencia importante: **el destinatario nunca viene del navegador**.
Aunque alguien descubriera la dirección de este archivo, no puede usarlo para
mandar correo a terceros: solo puede disparar un correo a una dirección que ya
esté registrada en un envío pendiente tuyo. Además hay un límite de envíos por
IP y por día (`limite_por_dia`).

## Paso 1 — Copiar la configuración

1. En tu hosting, crea una carpeta. Por ejemplo: `public_html/servitech/`.
2. Sube el archivo `enviar.php` (este mismo directorio).
3. Copia `config.example.php` y renómbrala a **`config.php`**.
4. Súbela junto a `enviar.php`.

Al final, en el hosting tienes:

```
servitech/
├── enviar.php
└── config.php
```

> `config.php` **nunca** se sube a GitHub: está en `.gitignore` porque lleva la
> clave de tu correo. No me la mandes por chat.

## Paso 2 — La contraseña de aplicación de Gmail

Gmail no acepta tu contraseña normal desde un programa. Hay que crear una
contraseña de aplicación de 16 caracteres:

1. Entra en **https://myaccount.google.com/security** con tu cuenta de Google.
2. Activa la **Verificación en dos pasos** (si no la tienes ya). Sin esto no
   aparece la opción siguiente.
3. Ve a **https://myaccount.google.com/apppasswords**.
4. Nombre de la app: escribe `Servitech` → **Crear**.
5. Google te muestra 16 caracteres (algo como `abcd efgh ijkl mnop`).
   **Cópialos sin espacios**: `abcdefghijklmnop`.
6. Pega eso en `config.php`:

```php
'remitente' => 'tu-correo@gmail.com',
'smtp' => [
  'host'      => 'smtp.gmail.com',
  'puerto'    => 587,
  'seguridad' => 'tls',
  'usuario'   => 'tu-correo@gmail.com',
  'clave'     => 'abcdefghijklmnop',   // los 16 caracteres, sin espacios
],
```

Si tu hosting te da un correo propio (por ejemplo `soporte@tudominio.com`),
también sirve: usa su SMTP y sus credenciales, y pon esa dirección en
`remitente` y en `smtp.usuario`.

## Paso 3 — Probar que el correo sale

En `config.php`, cambia estas dos líneas:

```php
'clave_prueba' => 'una-clave-larga-y-rara-que-solo-sepas-tu',
'email_prueba' => 'tu-correo@gmail.com',
```

Ahora abre en el navegador:

```
https://TU-DOMINIO/servitech/enviar.php?probar=1&clave=una-clave-larga-y-rara-que-solo-sepas-tu
```

Debe responder algo así:

```json
{"ok":true,"mensaje":"Correo de prueba enviado a tu-correo@gmail.com","metodo":"smtp","detalle":"enviado por SMTP smtp.gmail.com:587","php":"8.1.2"}
```

Si `ok` es `true` y el correo llega, el endpoint funciona. Si no llega, revisa
spam antes de tocar nada.

## Paso 4 — Enlazarlo con la app

1. Abre la app → **Ajustes** → sección **Correo de conformidad**.
2. Pega la dirección completa del endpoint, por ejemplo:
   `https://TU-DOMINIO/servitech/enviar.php`
3. Guarda.

A partir de ahí, en cualquier informe aparecerá el botón
**Pedir conformidad al cliente**.

> Si todavía no has configurado el endpoint, ese botón avisa de que falta. Aun
> así puedes **copiar el enlace** y enviarlo tú a mano (por WhatsApp o por tu
> correo) para probar todo el circuito: el cliente firma igual y la respuesta
> vuelve igual.

## Si algo falla

| Lo que ves | Qué pasa | Qué hacer |
|---|---|---|
| `{"ok":false,"error":"Falta config.php..."}` | No subiste la configuración | Sube `config.php` junto a `enviar.php` |
| `Autenticacion rechazada` | Usuario o contraseña de aplicación mal | Vuelve al paso 2: 16 caracteres, sin espacios, y `smtp.usuario` igual que `remitente` |
| `No se pudo conectar a smtp...` | El hosting bloquea la salida al puerto 587 | Prueba `'puerto' => 465, 'seguridad' => 'ssl'`. Si tampoco, pregúntale a tu hosting por el correo saliente |
| `Firestore respondio HTTP 403` | Las reglas nuevas no están publicadas | Publica `firestore.rules` en la consola de Firebase (ver `firebase-configuracion.md`, paso 5) |
| `Ese enlace no existe o fue retirado` | El token no corresponde a ningún envío | Genera el envío otra vez desde el informe |
| `Ese enlace ya no esta pendiente` | El cliente ya respondió | Revisa la respuesta en el informe |
| Llega pero a **spam** | Normal al principio | Marca "No es spam" en el primer correo; ayuda a que los siguientes lleguen bien |
| `Limite diario de envios alcanzado` | Pasaste `limite_por_dia` desde esa conexión | Espera al día siguiente o sube el límite |

## Comprobar el PHP antes de subirlo (opcional)

Si tienes PHP instalado en tu PC:

```bash
php -l enviar.php
```

Debe decir `No syntax errors detected`.

## Requisitos del hosting

- PHP **7.4 o superior** (cualquier hosting normal de los últimos años).
- Extensión `openssl` (para SMTP cifrado) y `curl`. Ambos vienen de serie en
  casi todos los hostings; si `curl` no estuviera, el error lo dirá.
- Permiso de escritura en la carpeta para el contador de envíos. Si no lo hay,
  el envío funciona igual: solo se pierde el límite por IP.
- Si tu hosting está detrás de un **proxy o CDN** (por ejemplo Cloudflare),
  pon `'confiar_en_proxy' => true` en `config.php` para que el límite diario
  cuente la IP real de quien visita y no la del proxy. En un hosting normal
  déjalo en `false`: las cabeceras de proxy las puede falsificar cualquiera.
