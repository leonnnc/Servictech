<?php
/* ============================================================
   Servitech - configuracion del endpoint de envio
   ------------------------------------------------------------
   COMO USARLO
   1. Copia este archivo y renombra la copia como  config.php
      (en el mismo directorio que enviar.php).
   2. Rellena todo lo marcado con  CAMBIAR  (o «CAMBIA ESTO»).
   3. Sube enviar.php y config.php a tu hosting.

   config.php se queda en tu hosting y NO se sube a GitHub
   (esta en .gitignore), porque lleva la clave del correo.
   ============================================================ */

return [

  /* ---- Firebase ----
     Estos dos valores son PUBLIICOS: ya viajan dentro de la app.
     (La proteccion real son las reglas de Firestore.) */
  'firebase_proyecto' => 'servictech-84304',
  'firebase_api_key'  => 'AIzaSyCGHQT5lftIuibTtONSozcouQbxge7kpas',

  /* ---- Quien puede llamar a este endpoint ----
     Deja solo los origenes desde los que de verdad usas la app. */
  'origenes' => [
    'https://leonnnc.github.io',
    'http://127.0.0.1:8765',
    'http://localhost:8000',
  ],

  /* ---- Remitente del correo ----
     Debe ser la MISMA direccion que pongas en smtp.usuario mas abajo. */
  'remitente'        => 'CAMBIAR-por-tu-correo@gmail.com',
  'remitente_nombre' => 'Servicio Tecnico',

  /* ---- Servidor de correo saliente (SMTP) ----
     Gmail NO acepta tu contrasena normal desde un programa:
     hay que crear una "contrasena de aplicacion" de 16 caracteres.
     Ver INSTALACION.md, paso 2. */
  'smtp' => [
    'host'      => 'smtp.gmail.com',
    'puerto'    => 587,
    'seguridad' => 'tls',                                     // tls (587) | ssl (465) | ninguna
    'usuario'   => 'CAMBIAR-por-tu-correo@gmail.com',
    'clave'     => 'CAMBIAR-por-la-contrasena-de-aplicacion',  // 16 caracteres, sin espacios
  ],

  /* Si el SMTP falla, intenta enviar con mail() del propio hosting.
     En muchos hostings mail() esta bloqueado: por eso el SMTP primero. */
  'usar_mail_como_respaldo' => true,

  /* ---- Limites y diagnostico ---- */
  'limite_por_dia' => 30,                  // envios por IP y por dia

  /* Ponlo en true SOLO si tu hosting esta detras de un proxy/CDN de confianza
     (por ejemplo Cloudflare). Con false se usa la IP real de la conexion, que
     no se puede falsificar: es lo correcto en un hosting normal. */
  'confiar_en_proxy' => false,

  'carpeta_datos'  => __DIR__ . '/datos',  // donde se guarda el contador (debe poder escribir)
  'clave_prueba'   => 'CAMBIAR-por-una-clave-larga-y-rara',
  'email_prueba'   => 'CAMBIAR-por-tu-correo@gmail.com',
];
