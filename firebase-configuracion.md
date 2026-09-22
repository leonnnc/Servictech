# Configuración de Firebase para Servitech (sincronización en la nube)

Objetivo: que los datos de la app (empresas, equipos, tareas, repuestos e informes) se guarden también en la nube y se **sincronicen solos** entre tu PC y tu celular.

- Tiempo estimado: 10–15 minutos.
- Costo: **gratis** (plan Spark de Firebase: 1 GiB de almacenamiento, 50.000 lecturas y 20.000 escrituras al día).
- Solo tú puedes hacer estos pasos: requieren entrar con tu cuenta de Google.

---

## Paso 1 — Crear el proyecto

1. Entra a **https://console.firebase.google.com** con tu cuenta de Google.
2. Clic en **Crear un proyecto** (o "Agregar proyecto").
3. Nombre del proyecto: `servitech` → **Continuar**.
4. Google Analytics: puedes **desactivarlo** (no lo necesitas) → **Crear proyecto** → espera y **Continuar**.

## Paso 2 — Registrar la app web y copiar la configuración

1. En la pantalla del proyecto, clic en el ícono **`</>`** (Web).
2. Apodo de la app: `Servitech web` → **Registrar app**.
3. Aparecerá un bloque llamado `firebaseConfig` con 6 valores. **Cópialo completo**, se ve así:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "servitech-xxxx.firebaseapp.com",
  projectId: "servitech-xxxx",
  storageBucket: "servitech-xxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};
```

> Este bloque **no es secreto** (en Firebase la web lo necesita a la vista). Puedes pegármelo sin problema. Lo que nunca se comparte es la contraseña del usuario.

## Paso 3 — Activar el acceso con correo y contraseña

1. Menú lateral: **Compilación → Authentication** → **Comenzar**.
2. Pestaña **Sign-in method** (Método de acceso) → **Correo electrónico/contraseña** → palanca **Habilitar** → **Guardar**.
3. Pestaña **Users** (Usuarios) → **Agregar usuario**:
   - Correo: tu correo (por ejemplo `leonnnc@gmail.com`)
   - Contraseña: la que quieras para la app, **mínimo 6 caracteres** (no tiene que ser la de tu Gmail).
4. **La contraseña la escribes tú directamente en la app** (pantalla "Nube") — no me la envíes.

## Paso 4 — Crear la base de datos (Firestore)

1. Menú lateral: **Compilación → Firestore Database** → **Crear base de datos**.
2. Modo: **Producción** → **Siguiente**.
3. Ubicación: elige la más cercana (`southamerica-west1` si aparece; si no, `us-central1`). **Ojo: no se puede cambiar después** → **Habilitar**.

## Paso 5 — Poner las reglas de seguridad

> **Este paso es obligatorio y es el que más se olvida.** Si las reglas quedan
> como vienen por defecto, Firestore responde *"Missing or insufficient
> permissions"* incluso para tu propio usuario, y **nada se sincroniza**
> (queda todo solo en el dispositivo, como si la nube no existiera).

1. Dentro de Firestore, pestaña **Reglas** (Rules).
2. Borra lo que hay y pega exactamente el contenido del archivo
   [`firestore.rules`](firestore.rules) del proyecto:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

3. Clic en **Publicar**.

> Importante: la app guarda en `users/{uid}/app/main` (una **subcolección**). El comodín `{document=**}` es obligatorio para que la regla alcance también a las subcolecciones; con solo `match /users/{uid}` la app daría "Permiso denegado".

### Cómo comprobar que quedaron bien

Desde la carpeta del proyecto:

```powershell
powershell -ExecutionPolicy Bypass -File pruebas\verificar-sincronizacion.ps1
```

El script crea un usuario de prueba, escribe y lee un documento con la misma
forma que usa la app, e intenta (debiendo fallar) tocar datos de otro usuario.
Si las reglas están bien, verás `RESULTADO: 4 correctas, 0 fallidas`.


Con esto, **solo tu usuario** puede leer y escribir tus datos; nadie más, aunque conozca el enlace.

## Paso 6 — Autorizar el dominio de tu app publicada

1. **Authentication → Settings → Authorized domains** (Dominios autorizados).
2. **Agregar dominio** → escribe: `leonnnc.github.io`
3. (`localhost` y `127.0.0.1` ya vienen autorizados por defecto, sirven para probar en tu PC.)

## Paso 7 — Avisarme

Pégame en el chat únicamente:

1. El bloque completo `firebaseConfig` (los 6 valores).
2. El correo con el que creaste el usuario.

Con eso yo hago el resto: agrego la pantalla **"Nube"** en Ajustes (donde pegas la configuración y escribes tu contraseña), la sincronización automática al guardar cualquier cambio, los botones **Subir ahora / Bajar ahora** y el indicador de estado ("Conectado · última sincronización 10:32").

---

## Cómo va a funcionar después

- Guardas una tarea en el celular → se sube sola a la nube (si no hay señal, queda en cola y sube al reconectar).
- Abres la app en la PC → baja los datos actualizados.
- Como los datos ahora viven también en la nube, sirve como respaldo automático (además del respaldo JSON manual que ya existe).

## Notas

- Si algún día quieres entrar con **tu cuenta de Google** en vez de correo/contraseña, se puede cambiar (avísame).
- Un documento de Firestore admite hasta 1 MB; tus datos pesan mucho menos (ojo solo si acumulas cientos de informes con firmas: ahí conviene separar los informes en documentos individuales y te lo ajusto).
- Alternativa a Firebase: Supabase (similar). Si prefieres esa, dímelo antes de crear el proyecto.
