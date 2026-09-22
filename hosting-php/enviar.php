<?php
/**
 * ============================================================
 *  Servitech - endpoint de envio del correo de conformidad
 * ============================================================
 *
 *  Que hace
 *  --------
 *  Recibe del navegador (la app) dos datos: { uid, token }.
 *  Con ellos consulta Firestore y LEE el documento de envio
 *  (users/{uid}/envios/{token}), que es de lectura publica
 *  precisamente para permitir esta comprobacion.
 *
 *  El destinatario NO se acepta del navegador: se toma del
 *  propio documento de envio. Asi este archivo NO puede usarse
 *  como rele abierto para mandar correo a terceros.
 *
 *  Requisitos
 *  ----------
 *  - PHP 7.4 o superior con las extensiones openssl (SMTP) y
 *    json. Casi todos los hostings las traen.
 *  - Un archivo config.php junto a este (ver config.example.php).
 *
 *  Comprobar que funciona
 *  ----------------------
 *  Abre en el navegador:
 *     https://TU-DOMINIO/enviar.php?probar=1&clave=TU_CLAVE_PRUEBA
 *  Si dice "ok", el correo de prueba salio bien.
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '0');   // los errores se devuelven como JSON

$origen = $_SERVER['HTTP_ORIGIN'] ?? '';

// Sin configuracion no sabemos que origenes estan permitidos, pero hay que
// devolver igual la cabecera CORS: sin ella el navegador oculta el mensaje y
// el problema se vuelve invisible ("Failed to fetch" en vez de la causa real).
if (!file_exists(__DIR__ . '/config.php')) {
    header('Content-Type: application/json; charset=utf-8');
    if ($origen !== '') {
        header('Access-Control-Allow-Origin: ' . $origen);
        header('Vary: Origin');
    }
    responder(500, ['ok' => false, 'error' => 'Falta config.php (copia config.example.php y rellena tus datos).']);
}
$CFG = require __DIR__ . '/config.php';

/* ---------------- CORS ---------------- */
if ($origen !== '' && in_array($origen, $CFG['origenes'], true)) {
    header('Access-Control-Allow-Origin: ' . $origen);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

/* ---------------- Modo prueba (GET) ---------------- */
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    $clave = (string)($_GET['clave'] ?? '');
    if (isset($_GET['probar']) && $clave !== '' && hash_equals((string)$CFG['clave_prueba'], $clave)) {
        $destino = (string)$CFG['email_prueba'];
        if (!filter_var($destino, FILTER_VALIDATE_EMAIL)) {
            responder(400, ['ok' => false, 'error' => 'email_prueba de config.php no es un correo valido.']);
        }
        $asunto = 'Prueba de Servitech';
        $texto  = "Si estas leyendo esto, el envio de correo de Servitech funciona correctamente.";
        $html   = '<p>' . htmlspecialchars($texto, ENT_QUOTES, 'UTF-8') . '</p>';
        $r = enviar_correo($CFG, $destino, '', $asunto, $html, $texto);
        responder($r['ok'] ? 200 : 500, [
            'ok'        => $r['ok'],
            'mensaje'   => $r['ok'] ? 'Correo de prueba enviado a ' . $destino : 'Fallo al enviar',
            'metodo'    => $r['metodo'],
            'detalle'   => $r['detalle'],
            'php'       => PHP_VERSION,
        ]);
    }
    responder(400, ['ok' => false, 'error' => 'Falta ?probar=1&clave=... o la clave no coincide.']);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    responder(405, ['ok' => false, 'error' => 'Solo se acepta POST.']);
}

/* ---------------- Datos de entrada ---------------- */
$entrada = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($entrada)) {
    responder(400, ['ok' => false, 'error' => 'El cuerpo no es JSON valido.']);
}

$uid   = (string)($entrada['uid'] ?? '');
$token = (string)($entrada['token'] ?? '');

// Formato estricto: evita inyecciones y rutas raras en la llamada a Firestore.
if (!preg_match('/^[A-Za-z0-9]{6,64}$/', $uid) || !preg_match('/^[A-Za-z0-9]{20,64}$/', $token)) {
    responder(400, ['ok' => false, 'error' => 'uid o token con formato invalido.']);
}

/* ---------------- Limite por IP ---------------- */
$limite = (int)($CFG['limite_por_dia'] ?? 30);
$dir    = (string)($CFG['carpeta_datos'] ?? (__DIR__ . '/datos'));
if ($limite > 0) {
    if (!is_dir($dir)) { @mkdir($dir, 0755, true); }
    $f    = $dir . '/limite-' . substr(hash('sha256', ip_del_cliente($CFG)), 0, 24) . '.json';
    $hoy  = date('Y-m-d');
    $uso  = ['dia' => $hoy, 'n' => 0];
    if (is_file($f)) {
        $previo = json_decode((string)@file_get_contents($f), true);
        if (is_array($previo) && ($previo['dia'] ?? '') === $hoy) { $uso = $previo; }
    }
    if (!isset($uso['n'])) { $uso['n'] = 0; }
    if ((int)$uso['n'] >= $limite) {
        responder(429, ['ok' => false, 'error' => 'Limite diario de envios alcanzado desde esta conexion.']);
    }
    $uso['n'] = (int)$uso['n'] + 1;
    @file_put_contents($f, json_encode($uso), LOCK_EX);
}

/* ---------------- Leer el envio en Firestore ---------------- */
$envio = leer_envio($CFG, $uid, $token);
if (!$envio['ok']) {
    responder($envio['codigo'], ['ok' => false, 'error' => $envio['error']]);
}
$d = $envio['datos'];

// El estado tiene que seguir siendo 'pendiente'.
if (($d['estado'] ?? '') !== 'pendiente') {
    responder(409, ['ok' => false, 'error' => 'Ese enlace ya no esta pendiente (estado: ' . ($d['estado'] ?? 'desconocido') . ').']);
}

// El destinatario sale del documento, NUNCA del navegador.
$destino = trim((string)($d['email'] ?? ''));
if (!filter_var($destino, FILTER_VALIDATE_EMAIL)) {
    responder(400, ['ok' => false, 'error' => 'El envio no tiene un correo de cliente valido.']);
}

$enlace  = (string)($d['enlace'] ?? '');
if ($enlace === '' || strpos($enlace, 'http') !== 0) {
    responder(400, ['ok' => false, 'error' => 'El envio no tiene enlace de conformidad.']);
}

/* ---------------- Armar y enviar el correo ---------------- */
$empresa  = (string)($d['empresa'] ?? '');
$codigo   = (string)($d['codigo'] ?? '');
$fecha    = (string)($d['fecha_servicio'] ?? '');
$resumen  = (string)($d['resumen'] ?? '');
$monto    = (string)($d['monto_txt'] ?? '');
$tecnico  = (string)($d['tecnico'] ?? '');
$contacto = (string)($d['contacto'] ?? '');

$asunto = 'Conformidad del servicio' . ($codigo !== '' ? ' ' . $codigo : '') . ($empresa !== '' ? ' - ' . $empresa : '');

[$asunto, $html, $texto] = plantilla_correo([
    'empresa' => $empresa, 'codigo' => $codigo, 'fecha' => $fecha,
    'resumen' => $resumen, 'monto' => $monto, 'tecnico' => $tecnico,
    'contacto' => $contacto, 'enlace' => $enlace, 'asunto' => $asunto,
]);

$r = enviar_correo($CFG, $destino, $contacto, $asunto, $html, $texto);

responder($r['ok'] ? 200 : 500, [
    'ok'      => $r['ok'],
    'mensaje' => $r['ok'] ? 'Correo enviado a ' . $destino : 'No se pudo enviar el correo',
    'metodo'  => $r['metodo'],
    'detalle' => $r['detalle'],
]);

/* ============================================================
   Funciones
   ============================================================ */

function responder(int $codigo, array $cuerpo): void
{
    http_response_code($codigo);
    echo json_encode($cuerpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * IP de quien llama, para el limite diario.
 * Por defecto se usa la IP real de la conexion (REMOTE_ADDR), porque las
 * cabeceras de proxy las puede falsificar cualquiera: si no, se podria evadir
 * el limite e incluso gastar la cuota diaria de otra IP.
 * Solo se miran esas cabeceras si tu hosting esta de verdad detras de un
 * proxy, activando 'confiar_en_proxy' => true en config.php.
 */
function ip_del_cliente(array $CFG): string
{
    if (!empty($CFG['confiar_en_proxy'])) {
        foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR'] as $k) {
            if (!empty($_SERVER[$k])) {
                $partes = explode(',', (string)$_SERVER[$k]);
                return trim($partes[0]);
            }
        }
    }
    return (string)($_SERVER['REMOTE_ADDR'] ?? 'desconocida');
}

/**
 * Lee users/{uid}/envios/{token} con la API REST de Firestore.
 * La lectura es publica por reglas (allow get), asi que basta la clave web.
 */
function leer_envio(array $CFG, string $uid, string $token): array
{
    $url = 'https://firestore.googleapis.com/v1/projects/' . rawurlencode($CFG['firebase_proyecto'])
        . '/databases/(default)/documents/users/' . rawurlencode($uid)
        . '/envios/' . rawurlencode($token)
        . '?key=' . rawurlencode($CFG['firebase_api_key']);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_HTTPHEADER     => ['Accept: application/json'],
    ]);
    $res  = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);

    if ($res === false || $res === '') {
        return ['ok' => false, 'codigo' => 502, 'error' => 'No se pudo consultar Firestore: ' . ($err !== '' ? $err : 'sin respuesta')];
    }
    if ($http === 404) {
        return ['ok' => false, 'codigo' => 404, 'error' => 'Ese enlace no existe o fue retirado.'];
    }
    if ($http !== 200) {
        return ['ok' => false, 'codigo' => 502, 'error' => 'Firestore respondio HTTP ' . $http . '. Revisa que las reglas esten publicadas.'];
    }

    $doc = json_decode($res, true);
    if (!is_array($doc) || !isset($doc['fields'])) {
        return ['ok' => false, 'codigo' => 502, 'error' => 'Respuesta de Firestore inesperada.'];
    }

    return ['ok' => true, 'datos' => aplanar_campos($doc['fields'])];
}

/** Convierte el formato de Firestore ({tipo:valor}) en un array simple. */
function aplanar_campos(array $campos): array
{
    $out = [];
    foreach ($campos as $clave => $v) {
        if (isset($v['stringValue'])) {
            $out[$clave] = (string)$v['stringValue'];
        } elseif (isset($v['integerValue'])) {
            $out[$clave] = (string)$v['integerValue'];
        } elseif (isset($v['doubleValue'])) {
            $out[$clave] = (string)$v['doubleValue'];
        } elseif (isset($v['booleanValue'])) {
            $out[$clave] = $v['booleanValue'] ? 'true' : 'false';
        } else {
            $out[$clave] = '';
        }
    }
    return $out;
}

/** Texto del correo (versiones HTML y texto plano). */
function plantilla_correo(array $x): array
{
    $e = static fn(string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    $saludo = $x['contacto'] !== '' ? ('Estimado/a ' . $x['contacto'] . ':') : 'Estimado/a cliente:';

    $lineas = [];
    $lineas[] = $saludo;
    $lineas[] = '';
    $lineas[] = 'Le escribimos para que confirme el servicio tecnico realizado' . ($x['empresa'] !== '' ? ' en ' . $x['empresa'] : '') . ($x['codigo'] !== '' ? ' (informe ' . $x['codigo'] . ')' : '') . '.';
    if ($x['fecha'] !== '') { $lineas[] = 'Fecha de atencion: ' . $x['fecha']; }
    if ($x['resumen'] !== '') { $lineas[] = ''; $lineas[] = 'Trabajo realizado:'; $lineas[] = $x['resumen']; }
    if ($x['monto'] !== '') { $lineas[] = ''; $lineas[] = 'Monto del servicio: ' . $x['monto']; }
    $lineas[] = '';
    $lineas[] = 'Para confirmar, abra este enlace en su celular:';
    $lineas[] = $x['enlace'];
    $lineas[] = '';
    $lineas[] = 'En el enlace solo tiene que marcar si el servicio quedo conforme, anotar cualquier observacion y firmar con el dedo. Toma menos de un minuto.';
    $lineas[] = '';
    $lineas[] = 'Si el enlace no abre, copielo y peguelo en el navegador de su celular.';
    $lineas[] = '';
    $lineas[] = 'Gracias por su tiempo' . ($x['tecnico'] !== '' ? '.' : '.');
    $lineas[] = $x['tecnico'] !== '' ? $x['tecnico'] : 'Servicio tecnico';
    $texto = implode("\n", $lineas);

    $html = '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1F2933;max-width:560px">'
        . '<p>' . $e($saludo) . '</p>'
        . '<p>Le escribimos para que confirme el servicio tecnico realizado'
        . ($x['empresa'] !== '' ? ' en <b>' . $e($x['empresa']) . '</b>' : '')
        . ($x['codigo'] !== '' ? ' (informe <b>' . $e($x['codigo']) . '</b>)' : '') . '.</p>';

    $filas = '';
    if ($x['fecha'] !== '') {
        $filas .= '<tr><td style="padding:4px 12px 4px 0;color:#6B7A80">Fecha de atencion</td><td style="padding:4px 0"><b>' . $e($x['fecha']) . '</b></td></tr>';
    }
    if ($x['monto'] !== '') {
        $filas .= '<tr><td style="padding:4px 12px 4px 0;color:#6B7A80">Monto del servicio</td><td style="padding:4px 0"><b>' . $e($x['monto']) . '</b></td></tr>';
    }
    if ($filas !== '') { $html .= '<table style="border-collapse:collapse;margin:10px 0">' . $filas . '</table>'; }

    if ($x['resumen'] !== '') {
        $html .= '<p style="margin-bottom:4px"><b>Trabajo realizado</b></p>'
            . '<div style="background:#F4FAF7;border-left:3px solid #0F766E;padding:10px 12px;border-radius:6px;white-space:pre-wrap">' . $e($x['resumen']) . '</div>';
    }

    $html .= '<p style="margin-top:20px">Para confirmar, pulse el boton:</p>'
        . '<p><a href="' . $e($x['enlace']) . '" style="display:inline-block;background:#0F766E;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:700">Confirmar y firmar</a></p>'
        . '<p style="font-size:13px;color:#6B7A80">Solo tiene que marcar si el servicio quedo conforme, anotar cualquier observacion y firmar con el dedo. Toma menos de un minuto.</p>'
        . '<p style="font-size:12px;color:#9AA5A8;word-break:break-all">Si el boton no funciona, copie este enlace en el navegador de su celular:<br>' . $e($x['enlace']) . '</p>'
        . '<p style="margin-top:18px">Gracias por su tiempo,<br><b>' . $e($x['tecnico'] !== '' ? $x['tecnico'] : 'Servicio tecnico') . '</b></p>'
        . '</div>';

    return [$x['asunto'], $html, $texto];
}

/** Envia por SMTP si hay configuracion, con mail() como respaldo. */
function enviar_correo(array $CFG, string $destino, string $nombre, string $asunto, string $html, string $texto): array
{
    $de      = (string)$CFG['remitente'];
    $deNombre = (string)($CFG['remitente_nombre'] ?? 'Servitech');

    if (!empty($CFG['smtp']['host'])) {
        $r = smtp_enviar($CFG, $destino, $nombre, $asunto, $html, $texto);
        if ($r['ok']) { return $r; }
        $fallo = $r['detalle'];
    } else {
        $fallo = 'SMTP no configurado';
    }

    // Respaldo: mail() del propio hosting.
    if (!empty($CFG['usar_mail_como_respaldo'])) {
        $borde = 'b' . bin2hex(random_bytes(12));
        $cab   = [];
        $cab[] = 'MIME-Version: 1.0';
        $cab[] = 'From: ' . envolver($deNombre) . ' <' . $de . '>';
        $cab[] = 'Reply-To: ' . $de;
        $cab[] = 'Content-Type: multipart/alternative; boundary="' . $borde . '"';
        $cuerpo = "--$borde\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n$texto\r\n\r\n"
            . "--$borde\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n$html\r\n\r\n--$borde--";
        $ok = @mail($destino, '=?UTF-8?B?' . base64_encode($asunto) . '?=', $cuerpo, implode("\r\n", $cab), '-f' . $de);
        return [
            'ok'      => (bool)$ok,
            'metodo'  => 'mail()',
            'detalle' => $ok ? 'enviado con mail() del hosting' : ('mail() fallo. Antes: ' . $fallo),
        ];
    }

    return ['ok' => false, 'metodo' => 'smtp', 'detalle' => $fallo];
}

function envolver(string $s): string
{
    return '=?UTF-8?B?' . base64_encode($s) . '?=';
}

/**
 * Cliente SMTP minimo (sin dependencias): STARTTLS o SSL + AUTH LOGIN.
 */
function smtp_enviar(array $CFG, string $destino, string $nombre, string $asunto, string $html, string $texto): array
{
    $c        = $CFG['smtp'];
    $host     = (string)$c['host'];
    $puerto   = (int)($c['puerto'] ?? 587);
    $seguro   = strtolower((string)($c['seguridad'] ?? 'tls'));   // tls | ssl | ninguna
    $usuario  = (string)($c['usuario'] ?? '');
    $clave    = (string)($c['clave'] ?? '');
    $de       = (string)$CFG['remitente'];
    $deNombre = (string)($CFG['remitente_nombre'] ?? 'Servitech');
    $timeout  = 20;

    $prefijo = $seguro === 'ssl' ? 'ssl://' : '';
    $fp = @stream_socket_client($prefijo . $host . ':' . $puerto, $errno, $errstr, $timeout, STREAM_CLIENT_CONNECT);
    if (!$fp) {
        return ['ok' => false, 'metodo' => 'smtp', 'detalle' => "No se pudo conectar a $host:$puerto ($errstr)"];
    }
    stream_set_timeout($fp, $timeout);

    $leer = static function () use ($fp): string {
        $datos = '';
        while (($linea = fgets($fp, 2048)) !== false) {
            $datos .= $linea;
            if (strlen($linea) < 4 || $linea[3] !== '-') { break; }
        }
        return $datos;
    };
    $decir = static function (string $t) use ($fp): void { fwrite($fp, $t . "\r\n"); };

    $saludo = $leer();
    if (strpos($saludo, '220') !== 0) {
        fclose($fp);
        return ['ok' => false, 'metodo' => 'smtp', 'detalle' => 'Saludo inesperado: ' . trim($saludo)];
    }

    $decir('EHLO ' . ($_SERVER['HTTP_HOST'] ?? 'servitech'));
    $leer();

    if ($seguro === 'tls') {
        $decir('STARTTLS');
        $resp = $leer();
        if (strpos($resp, '220') !== 0) {
            fclose($fp);
            return ['ok' => false, 'metodo' => 'smtp', 'detalle' => 'STARTTLS rechazado: ' . trim($resp)];
        }
        if (!@stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            fclose($fp);
            return ['ok' => false, 'metodo' => 'smtp', 'detalle' => 'No se pudo iniciar el cifrado TLS.'];
        }
        $decir('EHLO ' . ($_SERVER['HTTP_HOST'] ?? 'servitech'));
        $leer();
    }

    if ($usuario !== '') {
        $decir('AUTH LOGIN');
        $leer();
        $decir(base64_encode($usuario));
        $leer();
        $decir(base64_encode($clave));
        $auth = $leer();
        if (strpos($auth, '235') !== 0) {
            fclose($fp);
            return ['ok' => false, 'metodo' => 'smtp', 'detalle' => 'Autenticacion rechazada: ' . trim($auth)];
        }
    }

    $decir('MAIL FROM:<' . $de . '>');
    $r1 = $leer();
    if (strpos($r1, '250') !== 0) { fclose($fp); return ['ok' => false, 'metodo' => 'smtp', 'detalle' => 'MAIL FROM rechazado: ' . trim($r1)]; }

    $decir('RCPT TO:<' . $destino . '>');
    $r2 = $leer();
    if (strpos($r2, '250') !== 0 && strpos($r2, '251') !== 0) { fclose($fp); return ['ok' => false, 'metodo' => 'smtp', 'detalle' => 'Destinatario rechazado: ' . trim($r2)]; }

    $decir('DATA');
    $r3 = $leer();
    if (strpos($r3, '354') !== 0) { fclose($fp); return ['ok' => false, 'metodo' => 'smtp', 'detalle' => 'DATA rechazado: ' . trim($r3)]; }

    $borde  = 'b' . bin2hex(random_bytes(12));
    $cabec  = [];
    $cabec[] = 'Date: ' . date('r');
    $cabec[] = 'From: ' . envolver($deNombre) . ' <' . $de . '>';
    $cabec[] = 'To: ' . ($nombre !== '' ? envolver($nombre) . ' <' . $destino . '>' : '<' . $destino . '>');
    $cabec[] = 'Subject: ' . envolver($asunto);
    $cabec[] = 'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . preg_replace('/[^A-Za-z0-9.\-]/', '', $host) . '>';
    $cabec[] = 'Reply-To: ' . $de;
    $cabec[] = 'MIME-Version: 1.0';
    $cabec[] = 'Content-Type: multipart/alternative; boundary="' . $borde . '"';

    $cuerpo = implode("\r\n", $cabec) . "\r\n\r\n"
        . "--$borde\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
        . chunk_split(base64_encode($texto), 76, "\r\n") . "\r\n"
        . "--$borde\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
        . chunk_split(base64_encode($html), 76, "\r\n") . "\r\n"
        . "--$borde--";

    // Puntualizacion: una linea que empieza con punto se escapa.
    $cuerpo = preg_replace('/^\./m', '..', $cuerpo);
    fwrite($fp, $cuerpo . "\r\n.\r\n");
    $fin = $leer();

    $decir('QUIT');
    fclose($fp);

    if (strpos($fin, '250') !== 0) {
        return ['ok' => false, 'metodo' => 'smtp', 'detalle' => 'El servidor no acepto el mensaje: ' . trim($fin)];
    }
    return ['ok' => true, 'metodo' => 'smtp', 'detalle' => 'enviado por SMTP ' . $host . ':' . $puerto];
}
