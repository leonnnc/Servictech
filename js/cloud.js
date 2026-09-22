/* =========================================================
   Servitech - sincronización con la nube (Firebase)
   - Auth con correo/contraseña (la sesión queda guardada)
   - Firestore con caché offline: si no hay señal, encola
   - Un documento por usuario: users/{uid}/app/main
   - Escucha en tiempo real (onSnapshot): el PC y el celular se
     ven casi al instante, sin esperar.
   - Nunca se borran registros del otro equipo: si los dos
     cambiaron a la vez, se combinan por id (unión).

   IMPORTANTE: la sincronización entre dos dispositivos exige
   entrar con LA MISMA cuenta (correo/contraseña) en ambos.
   ========================================================= */
window.Cloud = (function () {
  var VERSION = 'v1.0';
  var CDN = 'https://www.gstatic.com/firebasejs/10.12.2/';
  var LS_CFG = 'servitech_fbcfg_v1';
  var LS_META = 'servitech_cloud_meta_v1';
  var POLL_MS = 60000;
  var COLS = ['empresas', 'equipos', 'tareas', 'repuestos', 'informes'];

  var st = {
    ready: false, loading: false, user: null, lastSync: 0, error: '', errorCode: '',
    pending: false, auto: true, live: false, merged: 0, lastMerge: 0
  };
  var fb = { app: null, auth: null, db: null, mod: null };
  var timer = null, pushTimer = null, unsub = null, listeners = [];
  var pushing = false, pushQueued = false;
  var _initPromise = null;

  /* ---------- almacenamiento de configuración/meta ---------- */
  function cfg() {
    try { var c = JSON.parse(localStorage.getItem(LS_CFG) || 'null'); if (c && c.apiKey && c.projectId) return c; } catch (e) { }
    return window.FIREBASE_CONFIG || null;
  }
  function setConfig(json) { localStorage.setItem(LS_CFG, typeof json === 'string' ? json : JSON.stringify(json)); }
  function clearConfig() { localStorage.removeItem(LS_CFG); }
  function meta() { try { return JSON.parse(localStorage.getItem(LS_META) || '{}'); } catch (e) { return {}; } }
  function setMeta(o) { var m = meta(); for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) m[k] = o[k]; } localStorage.setItem(LS_META, JSON.stringify(m)); }
  function configured() { var c = cfg(); return !!(c && c.apiKey && c.projectId); }
  function deviceName() {
    var u = navigator.userAgent || '';
    if (/Android/i.test(u)) return 'Android';
    if (/iPhone|iPad/i.test(u)) return 'iPhone/iPad';
    if (/Windows/i.test(u)) return 'Windows';
    if (/Macintosh/i.test(u)) return 'Mac';
    return 'Dispositivo';
  }

  /* ---------- estado ---------- */
  function emit() { listeners.forEach(function (f) { try { f(status()); } catch (e) { } }); }
  function onChange(fn) { if (listeners.indexOf(fn) < 0) listeners.push(fn); }
  function status() {
    var m = meta();
    return {
      configured: configured(),
      ready: st.ready,
      loading: st.loading,
      connected: !!st.user,
      user: st.user ? st.user.email : (m.email || ''),
      lastSync: st.lastSync || m.lastSync || 0,
      error: st.error,
      errorCode: st.errorCode,
      pending: st.pending,
      auto: st.auto,
      live: st.live,
      merged: st.merged,
      lastMerge: st.lastMerge,
      project: (cfg() || {}).projectId || '',
      uid: st.user ? st.user.uid : ''
    };
  }

  /* ---------- inicialización (carga diferida del SDK) ---------- */
  function init() {
    if (!configured()) return Promise.resolve(null);
    if (st.ready) return Promise.resolve(st);
    if (_initPromise) return _initPromise;
    _initPromise = (async function () {
      st.loading = true; emit();
      try {
        var appMod = await import(CDN + 'firebase-app.js');
        var authMod = await import(CDN + 'firebase-auth.js');
        var fsMod = await import(CDN + 'firebase-firestore.js');
        fb.mod = { appMod: appMod, authMod: authMod, fsMod: fsMod };
        fb.app = appMod.getApps && appMod.getApps().length ? appMod.getApps()[0] : appMod.initializeApp(cfg());
        fb.auth = authMod.getAuth(fb.app);
        try { await authMod.setPersistence(fb.auth, authMod.browserLocalPersistence); } catch (e) { }
        try {
          fb.db = fsMod.initializeFirestore(fb.app, { localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }) });
        } catch (e) { fb.db = fsMod.getFirestore(fb.app); }
        st.ready = true; st.loading = false;
        authMod.onAuthStateChanged(fb.auth, async function (u) {
          st.user = (u && !u.isAnonymous) ? u : null;
          if (st.user) {
            setMeta({ email: st.user.email || '' });
            st.error = '';
            // Sin esto, la primera petición puede salir antes de que el token
            // de sesión llegue a Firestore y responder "permiso denegado"
            // aunque las reglas estén correctas.
            await refrescarToken();
            startAuto();
            startListener();
            pull(false);
          } else {
            // Sin sesión: NO se sincroniza nada. Cada dispositivo guarda
            // localmente hasta que entres con tu cuenta en Ajustes → Nube.
            stopAuto();
            stopListener();
          }
          emit();
        });
        emit();
        return st;
      } catch (err) {
        st.loading = false;
        st.error = msg(err);
        emit();
        _initPromise = null;
        throw err;
      }
    })();
    return _initPromise;
  }

  /* ---------- referencia al documento ---------- */
  function docRef() { return fb.mod.fsMod.doc(fb.db, 'users', st.user.uid, 'app', 'main'); }

  /* Fuerza un token fresco ANTES de tocar Firestore. Si la primera lectura se
     lanza sin token, Firestore responde "permiso denegado" sin que las reglas
     tengan nada que ver, y el aviso se queda fijo en pantalla. */
  async function refrescarToken() {
    try {
      if (fb.auth && fb.mod && fb.mod.authMod && fb.mod.authMod.getIdToken && fb.auth.currentUser) {
        await fb.mod.authMod.getIdToken(fb.auth.currentUser, true);
      }
    } catch (e) { }
  }

  /* ---------- combinar dos bases (unión por id, gana lo remoto) ---------- */
  function mergeDB(local, remote) {
    var out = JSON.parse(JSON.stringify(remote || {}));
    var added = 0;
    COLS.forEach(function (col) {
      var rlist = Array.isArray(out[col]) ? out[col] : [];
      var llist = Array.isArray(local && local[col]) ? local[col] : [];
      var seen = {};
      rlist.forEach(function (r) { if (r && r.id != null) seen[String(r.id)] = true; });
      llist.forEach(function (r) {
        if (r && r.id != null && !seen[String(r.id)]) { rlist.push(r); added++; }
      });
      out[col] = rlist;
    });
    var lm = (local && local.meta) || {}, rm = out.meta || (out.meta = {});
    var lseq = lm.seq || {}, rseq = rm.seq || (rm.seq = {});
    ['emp', 'equ', 'tar', 'rep', 'inf'].forEach(function (k) {
      rseq[k] = Math.max(Number(lseq[k] || 0), Number(rseq[k] || 0));
    });
    rm.nextInf = Math.max(Number(lm.nextInf || 1), Number(rm.nextInf || 1));
    rm.year = rm.year || lm.year || new Date().getFullYear();
    if (!rm.tecnico) rm.tecnico = lm.tecnico || '';
    if (!rm.currency) rm.currency = lm.currency || 'S/ ';
    out.v = out.v || (local && local.v) || 1;
    return { db: out, added: added };
  }

  function backupPrev() {
    try { localStorage.setItem('servitech_prev_db_v1', JSON.stringify({ cuando: Date.now(), db: Store.db })); } catch (e) { }
  }

  function tieneDatos(db) {
    if (!db) return false;
    for (var i = 0; i < COLS.length; i++) {
      if (Array.isArray(db[COLS[i]]) && db[COLS[i]].length) return true;
    }
    return false;
  }

  /* ---------- subir ---------- */
  async function push(silent) {
    if (!st.user) return false;
    if (pushing) { pushQueued = true; return false; }
    pushing = true;
    st.pending = true; emit();
    var upd = Date.now();
    try {
      var payload = JSON.parse(JSON.stringify(Store.db));
      payload.meta = payload.meta || {};
      delete payload.meta.syncedAt;         // dato local, no se comparte
      payload.meta.updatedAt = upd;
      await fb.mod.fsMod.setDoc(docRef(), {
        payload: payload, updatedAt: upd, device: deviceName(), email: st.user.email || ''
      });
      // La base remota quedó en esta versión: es nuestra nueva referencia.
      Store.db.meta.syncedAt = upd;
      Store.save(true, true);
      st.lastSync = upd; setMeta({ lastSync: upd });
      st.error = ''; st.pending = false; resetReintento(); emit();
      if (!silent) toast('Datos subidos a la nube');
      return true;
    } catch (e) {
      st.pending = false; st.error = msg(e); emit();
      fallo(e);
      if (!silent) toast('No se pudo subir: ' + st.error);
      return false;
    } finally {
      pushing = false;
      if (pushQueued) { pushQueued = false; setTimeout(function () { push(true); }, 300); }
    }
  }

  /* ---------- aplicar un documento remoto ---------- */
  async function applySnap(snap, force) {
    if (!snap.exists()) {
      // Nube vacía: subimos lo de este dispositivo.
      return await push(true);
    }
    var d = snap.data() || {};
    var payload = d.payload || null;
    if (!payload || !payload.v) return false;
    var rUpd = Number(d.updatedAt || (payload.meta && payload.meta.updatedAt) || 0);

    var m = Store.db.meta || {};
    var base = Number(m.syncedAt || 0);     // versión que ya teníamos
    var lUpd = Number(m.updatedAt || 0);    // última edición local
    var dirty = lUpd > base;                // hay cambios locales sin subir

    if (force) {
      backupPrev();
      Store.importJSON(JSON.stringify(payload), true);
      Store.db.meta.updatedAt = rUpd;
      Store.db.meta.syncedAt = rUpd;
      Store.save(true, true);
      st.lastSync = Date.now(); setMeta({ lastSync: st.lastSync });
      st.error = ''; emit();
      rerender();
      toast('Datos reemplazados por los de la nube');
      return true;
    }

    if (rUpd <= base) {
      // La nube no tiene nada nuevo (o venía de nosotros mismos).
      if (dirty || (tieneDatos(Store.db) && !tieneDatos(payload))) return await push(true);
      markSync();
      return true;
    }

    // Protección: la nube está vacía y este dispositivo sí tiene datos.
    if (tieneDatos(Store.db) && !tieneDatos(payload)) return await push(true);

    if (!dirty) {
      // Solo cambió la nube: la adoptamos.
      backupPrev();
      Store.importJSON(JSON.stringify(payload), true);
      Store.db.meta.updatedAt = rUpd;
      Store.db.meta.syncedAt = rUpd;
      Store.save(true, true);
      markSync();
      rerender();
      toast('Datos actualizados desde la nube');
      return true;
    }

    // Los dos lados cambiaron: combinamos para no perder nada.
    var res = mergeDB(Store.db, payload);
    if (res.added > 0) {
      backupPrev();
      Store.importJSON(JSON.stringify(res.db), true);
      Store.db.meta.updatedAt = Date.now();
      Store.db.meta.syncedAt = rUpd;
      Store.save(true, true);
      st.merged += res.added; st.lastMerge = Date.now();
      rerender();
      toast('Se combinaron ' + res.added + ' registro(s) del otro equipo');
    } else {
      backupPrev();
      Store.importJSON(JSON.stringify(payload), true);
      Store.db.meta.updatedAt = rUpd;
      Store.db.meta.syncedAt = rUpd;
      Store.save(true, true);
      rerender();
    }
    return await push(true);
  }

  function markSync() {
    st.lastSync = Date.now(); setMeta({ lastSync: st.lastSync }); st.error = ''; emit();
  }

  function rerender() {
    if (typeof route !== 'function') return;
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag && ['INPUT', 'TEXTAREA', 'SELECT'].indexOf(tag) >= 0) return;  // no interrumpir si está escribiendo
    try { route(); } catch (e) { }
  }

  /* ---------- bajar (consulta puntual) ---------- */
  async function pull(force) {
    if (!st.user) return false;
    try {
      var snap = await fb.mod.fsMod.getDoc(docRef());
      resetReintento();
      return await applySnap(snap, !!force);
    } catch (e) {
      st.error = msg(e); emit();
      fallo(e);
      return false;
    }
  }

  /* ---------- reintentos cortos ----------
     Un fallo puntual (por ejemplo el token aún no propagado) se recupera
     en segundos. Antes había que esperar hasta 60 s mirando el error. */
  var retryTimer = null, retryN = 0;
  function fallo(e) { if (esTransitorio(e)) planReintento(); }
  function esTransitorio(e) {
    var c = codigo(e);
    return c === 'permission-denied' || c === 'unauthenticated' ||
      c === 'unavailable' || c === 'deadline-exceeded' || c === 'failed-precondition';
  }
  function planReintento() {
    if (!st.user || retryN >= 3) return;
    var ms = [1500, 5000, 15000][retryN] || 15000;
    retryN++;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(function () {
      retryTimer = null;
      if (st.user) pull(false);
    }, ms);
  }
  function resetReintento() {
    retryN = 0;
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  }
  /* Reintento a mano desde el botón de la pantalla. */
  function retry() { resetReintento(); return pull(false); }

  /* ---------- escucha en tiempo real ---------- */
  function startListener() {
    stopListener();
    if (!st.user) return;
    try {
      unsub = fb.mod.fsMod.onSnapshot(docRef(), function (snap) {
        // Ignoramos lo que nosotros mismos acabamos de escribir (aún en cola).
        if (snap.metadata && snap.metadata.hasPendingWrites) return;
        if (!st.user) return;
        applySnap(snap, false).catch(function () { });
      }, function (err) {
        st.error = msg(err); emit();
        fallo(err);
      });
      st.live = true; emit();
    } catch (e) {
      st.live = false;
    }
  }
  function stopListener() {
    if (unsub) { try { unsub(); } catch (e) { } unsub = null; }
    st.live = false;
  }

  /* ---------- sesión ---------- */
  async function signIn(email, pass) {
    await init();
    if (!st.ready) throw new Error('Firebase no está configurado');
    try {
      var r = await fb.mod.authMod.signInWithEmailAndPassword(fb.auth, email, pass);
      setMeta({ email: email }); st.user = r.user; st.error = ''; st.errorCode = '';
      await refrescarToken();
      startAuto(); startListener();
      await pull(false); emit();
      return r.user;
    } catch (e) {
      st.error = msg(e); st.errorCode = codigo(e); emit(); throw e;
    }
  }

  async function signUp(email, pass) {
    await init();
    if (!st.ready) throw new Error('Firebase no está configurado');
    try {
      var r = await fb.mod.authMod.createUserWithEmailAndPassword(fb.auth, email, pass);
      setMeta({ email: email }); st.user = r.user; st.error = ''; st.errorCode = '';
      await refrescarToken();
      startAuto(); startListener();
      await pull(false); emit();
      return r.user;
    } catch (e) {
      st.error = msg(e); st.errorCode = codigo(e); emit(); throw e;
    }
  }

  /* Un solo camino, sin adivinar qué botón pulsar:
       1) intenta entrar;
       2) si Firebase responde "correo o contraseña incorrectos", prueba a
          CREAR la cuenta con esos mismos datos;
       3) si al crearla dice que el correo ya existe, entonces el problema
          es la contraseña, y eso sí se puede explicar claro.

     Firebase devuelve el MISMO error genérico (invalid-credential) tanto si
     la cuenta no existe como si la contraseña está mal; intentar crearla es
     la única forma de distinguir los dos casos.                        */
  async function connect(email, pass) {
    await init();
    if (!st.ready) throw new Error('Firebase no está configurado');
    try {
      var r = await fb.mod.authMod.signInWithEmailAndPassword(fb.auth, email, pass);
      setMeta({ email: email }); st.user = r.user; st.error = ''; st.errorCode = '';
      await refrescarToken();
      startAuto(); startListener();
      await pull(false); emit();
      return { accion: 'conectado' };
    } catch (e) {
      var c = codigo(e);
      if (c !== 'auth/invalid-credential' && c !== 'auth/invalid-login-credentials' && c !== 'auth/user-not-found') {
        st.error = msg(e); st.errorCode = c; emit(); throw e;
      }
    }
    try {
      var r2 = await fb.mod.authMod.createUserWithEmailAndPassword(fb.auth, email, pass);
      setMeta({ email: email }); st.user = r2.user; st.error = ''; st.errorCode = '';
      await refrescarToken();
      startAuto(); startListener();
      await pull(false); emit();
      return { accion: 'creado' };
    } catch (e2) {
      var c2 = codigo(e2);
      if (c2 === 'auth/email-already-in-use') {
        var err = new Error('cuenta-existe');
        err.code = 'cuenta-existe';
        st.error = 'La cuenta ' + email + ' ya existe en la nube, pero la contraseña no coincide. Escribe la contraseña EXACTA con la que la creaste.';
        st.errorCode = 'cuenta-existe';
        emit();
        throw err;
      }
      st.error = msg(e2); st.errorCode = c2; emit(); throw e2;
    }
  }

  async function signOut() {
    try { await init(); if (fb.auth) await fb.mod.authMod.signOut(fb.auth); } catch (e) { }
    st.user = null; st.error = ''; stopAuto(); stopListener(); setMeta({ email: '' }); emit();
  }

  /* ---------- automático ---------- */
  function startAuto() { stopAuto(); if (!st.auto) return; timer = setInterval(function () { if (st.user) pull(false); }, POLL_MS); }
  function stopAuto() { if (timer) { clearInterval(timer); timer = null; } }
  function setAuto(v) { st.auto = !!v; if (!st.auto) stopAuto(); else if (st.user) startAuto(); emit(); }
  function notifyChange() {
    if (!st.user) return;                       // sin sesión: solo local
    if (!st.auto) { st.pending = true; emit(); return; }
    if (pushTimer) clearTimeout(pushTimer);
    st.pending = true; emit();
    pushTimer = setTimeout(function () { push(true); }, 2500);
  }
  function syncNow() { return pull(false); }

  /* ---------- mensajes de error legibles ---------- */
  /* Código de error de Firebase (para decidir qué ofrecer después). */
  function codigo(e) {
    var c = (e && e.code) || '';
    if (!c && e && e.message) {
      var m = String(e.message).match(/\((auth\/[a-z-]+)\)/i);
      if (m) c = m[1];
    }
    return c;
  }

  function msg(e) {
    var c = codigo(e);
    var map = {
      'auth/invalid-credential': 'Ese correo no tiene cuenta en la nube todavía (o la contraseña no coincide). Si es la primera vez, pulsa "Crear cuenta".',
      'auth/wrong-password': 'Contraseña incorrecta. Revisa que sea exactamente la misma que usaste en el otro equipo.',
      'auth/invalid-login-credentials': 'Ese correo no tiene cuenta en la nube todavía (o la contraseña no coincide). Si es la primera vez, pulsa "Crear cuenta".',
      'auth/user-not-found': 'Ese correo no tiene cuenta todavía: usa "Crear cuenta" para crearla',
      'auth/email-already-in-use': 'Ese correo ya tiene cuenta: usa "Conectar" en vez de "Crear cuenta"',
      'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres',
      'auth/invalid-email': 'El correo no es válido',
      'auth/operation-not-allowed': 'Falta habilitar "Correo electrónico/contraseña" en Firebase → Authentication → Método de acceso',
      'auth/configuration-not-found': 'Authentication aún no está habilitada en el proyecto',
      'auth/invalid-api-key': 'La apiKey no corresponde a este proyecto',
      'auth/network-request-failed': 'Sin conexión a internet',
      'permission-denied': 'Permiso denegado al leer tus datos. Si ya publicaste las reglas en Firebase → Firestore → Reglas, pulsa "Reintentar": suele ser un fallo pasajero de la sesión.',
      'unavailable': 'Firestore no disponible (verifica que creaste la base de datos)',
      'not-found': 'No se encontró la base de datos de Firestore',
      'failed-precondition': 'Firestore necesita crearse o habilitarse'
    };
    if (map[c]) return map[c];
    var raw = (e && (e.message || e.code)) || 'Error desconocido';
    if (/CONFIGURATION_NOT_FOUND/i.test(raw)) return 'Authentication aún no está habilitada en el proyecto';
    if (/Missing or insufficient permissions/i.test(raw)) return 'Permiso denegado: publica las reglas de Firestore (Firebase → Firestore → Reglas)';
    return raw;
  }

  /* ---------- diagnóstico legible ---------- */
  function diagnostics() {
    var m = meta();
    var dm = (Store.db && Store.db.meta) || {};
    var counts = {};
    COLS.forEach(function (c) {
      counts[c] = (Store.db && Array.isArray(Store.db[c])) ? Store.db[c].length : 0;
    });
    var ver = '';
    try { var el = document.querySelector('.app-ver'); ver = el ? String(el.textContent).trim() : ''; } catch (e) { }
    var total = COLS.reduce(function (a, c) { return a + counts[c]; }, 0);
    var veredicto = !st.ready
      ? 'Firebase no se ha inicializado todavía'
      : (!st.user
        ? 'SIN SESIÓN: este equipo guarda solo en su propio navegador y no comparte nada'
        : (st.error ? ('Con sesión, pero con error: ' + st.error)
          : 'Con sesión y compartiendo datos'));
    return {
      indexHtml: ver,
      cloudJs: VERSION,
      dispositivo: deviceName(),
      proyecto: (cfg() || {}).projectId || '',
      conSesion: !!st.user,
      cuenta: st.user ? (st.user.email || '(sin correo)') : (m.email ? ('ninguna ahora · recordaba ' + m.email) : 'ninguna'),
      uid: st.user ? st.user.uid : '',
      uidCorto: st.user ? String(st.user.uid).slice(0, 8) : '',
      escuchaTiempoReal: st.live,
      ultimaSinc: st.lastSync || m.lastSync || 0,
      pendienteDeSubir: !!st.pending,
      error: st.error || '',
      registros: counts,
      total: total,
      updatedAt: dm.updatedAt || 0,
      syncedAt: dm.syncedAt || 0,
      veredicto: veredicto
    };
  }

  function diagnosticsText() {
    var d = diagnostics();
    var l = [];
    l.push('SERVITECH — DIAGNÓSTICO DE SINCRONIZACIÓN');
    l.push('Fecha: ' + new Date().toLocaleString());
    l.push('Archivos cargados: index.html ' + (d.indexHtml || '?') + ' · cloud.js ' + d.cloudJs);
    l.push('Dispositivo: ' + d.dispositivo);
    l.push('Proyecto Firebase: ' + d.proyecto);
    l.push('');
    l.push('ESTADO: ' + d.veredicto);
    l.push('Cuenta: ' + d.cuenta);
    l.push('uid (identificador de la cuenta): ' + (d.uid || '— sin sesión —'));
    l.push('uid corto: ' + (d.uidCorto || '-'));
    l.push('Escucha en tiempo real: ' + (d.escuchaTiempoReal ? 'SÍ' : 'NO'));
    l.push('Última sincronización: ' + (d.ultimaSinc ? new Date(d.ultimaSinc).toLocaleString() : 'nunca'));
    l.push('Cambios pendientes de subir: ' + (d.pendienteDeSubir ? 'SÍ' : 'no'));
    l.push('Error: ' + (d.error || 'ninguno'));
    l.push('');
    l.push('DATOS EN ESTE DISPOSITIVO:');
    l.push('  Empresas: ' + d.registros.empresas + ' · Equipos: ' + d.registros.equipos +
      ' · Tareas: ' + d.registros.tareas + ' · Repuestos: ' + d.registros.repuestos +
      ' · Informes: ' + d.registros.informes);
    l.push('  Total: ' + d.total);
    l.push('  updatedAt (último cambio local): ' + d.updatedAt);
    l.push('  syncedAt (versión que se sincronizó): ' + d.syncedAt);
    return l.join('\n');
  }

  /* ---------- al volver a la app (celular) ---------- */
  document.addEventListener('visibilitychange', function () {
    if (!st.user) return;
    if (document.visibilityState === 'hidden') {
      // El celular suele irse a segundo plano: empujamos lo pendiente ya.
      if (st.pending) push(true);
    } else {
      pull(false);
    }
  });
  window.addEventListener('online', function () { if (st.user) pull(false); });

  /* =========================================================
     CONFORMIDAD DEL CLIENTE
     Van aparte del documento principal, en dos subcolecciones,
     porque el cliente tiene que poder responder SIN sesión:
       users/{uid}/envios/{token}      lo lee el cliente con el token
       users/{uid}/respuestas/{token}  lo crea el cliente una sola vez
     Lo que se permite exactamente lo fija firestore.rules.
     ========================================================= */

  async function fsListo() {
    await init();
    if (!fb.mod || !fb.db) throw new Error('nube-no-configurada');
    return fb.mod.fsMod;
  }

  /* Lee un envío. Funciona también SIN sesión: la regla deja leerlo
     a quien conozca el token exacto (es la llave del enlace). */
  async function leerEnvio(uid, token) {
    if (!uid || !token) return null;
    var fsMod = await fsListo();
    var snap = await fsMod.getDoc(fsMod.doc(fb.db, 'users', uid, 'envios', token));
    return snap.exists() ? snap.data() : null;
  }

  /* Crea o reemplaza el envío. Requiere sesión: es tu propio espacio. */
  async function crearEnvio(token, datos) {
    if (!st.user) throw new Error('sin-sesion');
    if (!token) throw new Error('token-vacio');
    var fsMod = await fsListo();
    await refrescarToken();
    await fsMod.setDoc(fsMod.doc(fb.db, 'users', st.user.uid, 'envios', token), datos);
    return true;
  }

  /* Cambia el estado del envío (pendiente / respondido). No es crítico:
     si falla, el circuito sigue funcionando. */
  async function actualizarEnvio(token, campos) {
    if (!st.user || !token) return false;
    try {
      var fsMod = await fsListo();
      await refrescarToken();
      await fsMod.updateDoc(fsMod.doc(fb.db, 'users', st.user.uid, 'envios', token), campos);
      return true;
    } catch (e) { return false; }
  }

  /* Respuesta del cliente. Se llama SIN sesión, desde su celular. */
  async function crearRespuesta(uid, token, datos) {
    if (!uid || !token) throw new Error('datos-incompletos');
    var fsMod = await fsListo();
    await fsMod.setDoc(fsMod.doc(fb.db, 'users', uid, 'respuestas', token), datos);
    return true;
  }

  /* Lee la respuesta del cliente (solo el dueño: ver reglas). */
  async function leerRespuesta(token) {
    if (!st.user || !token) return null;
    var fsMod = await fsListo();
    await refrescarToken();
    var snap = await fsMod.getDoc(fsMod.doc(fb.db, 'users', st.user.uid, 'respuestas', token));
    return snap.exists() ? snap.data() : null;
  }

  return {
    init: init, signIn: signIn, signUp: signUp, connect: connect, signOut: signOut,
    push: push, pull: pull, syncNow: syncNow, retry: retry,
    status: status, onChange: onChange, notifyChange: notifyChange,
    configured: configured, setConfig: setConfig, clearConfig: clearConfig,
    setAuto: setAuto, meta: meta,
    leerEnvio: leerEnvio, crearEnvio: crearEnvio, actualizarEnvio: actualizarEnvio,
    crearRespuesta: crearRespuesta, leerRespuesta: leerRespuesta,
    diagnostics: diagnostics, diagnosticsText: diagnosticsText, version: VERSION
  };
})();
