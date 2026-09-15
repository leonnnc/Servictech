/* =========================================================
   Servitech - sincronización con la nube (Firebase)
   - Auth con correo/contraseña (la sesión queda guardada)
   - Firestore con caché offline: si no hay señal, encola
   - Un documento: users/{uid}/app/main
   ========================================================= */
window.Cloud = (function () {
  var CDN = 'https://www.gstatic.com/firebasejs/10.12.2/';
  var LS_CFG = 'servitech_fbcfg_v1';
  var LS_META = 'servitech_cloud_meta_v1';

  var st = { ready: false, loading: false, user: null, lastSync: 0, error: '', pending: false, auto: true };
  var fb = { app: null, auth: null, db: null, mod: null };
  var timer = null, pushTimer = null, listeners = [];

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
      pending: st.pending,
      auto: st.auto,
      project: (cfg() || {}).projectId || ''
    };
  }

  /* ---------- inicialización (carga diferida del SDK) ---------- */
  var _initPromise = null;
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
        authMod.onAuthStateChanged(fb.auth, function (u) {
          st.user = u || null;
          if (u) { setMeta({ email: u.email }); startAuto(); pull(false); } else { stopAuto(); }
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

  /* ---------- subir ---------- */
  async function push(silent) {
    if (!st.user) return false;
    st.pending = true; emit();
    var upd = Date.now();
    try {
      var payload = JSON.parse(JSON.stringify(Store.db));
      payload.meta.updatedAt = upd;
      await fb.mod.fsMod.setDoc(docRef(), {
        payload: payload, updatedAt: upd, device: deviceName(), email: st.user.email
      });
      if (Store.db && Store.db.meta) Store.db.meta.updatedAt = upd;
      Store.save(true);
      st.lastSync = upd; setMeta({ lastSync: upd }); st.error = ''; st.pending = false; emit();
      if (!silent) toast('Datos subidos a la nube');
      return true;
    } catch (e) {
      st.pending = false; st.error = msg(e); emit();
      if (!silent) toast('No se pudo subir: ' + st.error);
      return false;
    }
  }

  /* ---------- bajar ---------- */
  async function pull(force) {
    if (!st.user) return false;
    try {
      var snap = await fb.mod.fsMod.getDoc(docRef());
      if (!snap.exists()) { return await push(true); }
      var d = snap.data() || {};
      var rUpd = Number(d.updatedAt || 0);
      var lUpd = Number((Store.db.meta || {}).updatedAt || 0);
      if (force || rUpd > lUpd) {
        Store.importJSON(JSON.stringify(d.payload), true);
        st.lastSync = Date.now(); setMeta({ lastSync: st.lastSync }); st.error = ''; emit();
        var activeTag = document.activeElement && document.activeElement.tagName;
        if (!activeTag || !['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) {
          route();
        }
        toast('Datos actualizados desde la nube');
        return true;
      }
      if (lUpd > rUpd) { return await push(true); }
      st.lastSync = Date.now(); setMeta({ lastSync: st.lastSync }); emit();
      return true;
    } catch (e) {
      st.error = msg(e); emit();
      return false;
    }
  }

  /* ---------- sesión ---------- */
  async function signIn(email, pass) {
    await init();
    if (!st.ready) throw new Error('Firebase no está configurado');
    try {
      var r = await fb.mod.authMod.signInWithEmailAndPassword(fb.auth, email, pass);
      setMeta({ email: email }); st.user = r.user; st.error = '';
      await pull(false); emit();
      return r.user;
    } catch (e) {
      st.error = msg(e); emit(); throw e;
    }
  }
  async function signOut() {
    try { await init(); if (fb.auth) await fb.mod.authMod.signOut(fb.auth); } catch (e) { }
    st.user = null; st.error = ''; stopAuto(); setMeta({ email: '' }); emit();
  }

  /* ---------- automático ---------- */
  function startAuto() { stopAuto(); if (!st.auto) return; timer = setInterval(function () { if (st.user) pull(false); }, 60000); }
  function stopAuto() { if (timer) { clearInterval(timer); timer = null; } }
  function setAuto(v) { st.auto = !!v; if (!st.auto) stopAuto(); else if (st.user) startAuto(); emit(); }
  function notifyChange() {
    if (!st.user) return;
    if (!st.auto) { st.pending = true; emit(); return; }
    if (pushTimer) clearTimeout(pushTimer);
    st.pending = true; emit();
    pushTimer = setTimeout(function () { push(true); }, 2500);
  }
  function syncNow() { return pull(false); }

  /* ---------- mensajes de error legibles ---------- */
  function msg(e) {
    var c = (e && e.code) || '';
    var map = {
      'auth/invalid-credential': 'Correo o contraseña incorrectos',
      'auth/wrong-password': 'Contraseña incorrecta',
      'auth/invalid-login-credentials': 'Correo o contraseña incorrectos',
      'auth/user-not-found': 'Ese usuario no existe en Firebase (créalo en Authentication → Users)',
      'auth/invalid-email': 'El correo no es válido',
      'auth/operation-not-allowed': 'Falta habilitar "Correo electrónico/contraseña" en Authentication',
      'auth/configuration-not-found': 'Authentication aún no está habilitada en el proyecto',
      'auth/invalid-api-key': 'La apiKey no corresponde a este proyecto',
      'auth/network-request-failed': 'Sin conexión a internet',
      'permission-denied': 'Permiso denegado: revisa las reglas de Firestore',
      'unavailable': 'Firestore no disponible (verifica que creaste la base de datos)',
      'not-found': 'No se encontró la base de datos de Firestore',
      'failed-precondition': 'Firestore necesita crearse o habilitarse'
    };
    if (map[c]) return map[c];
    var raw = (e && (e.message || e.code)) || 'Error desconocido';
    if (/CONFIGURATION_NOT_FOUND/i.test(raw)) return 'Authentication aún no está habilitada en el proyecto';
    return raw;
  }

  return {
    init: init, signIn: signIn, signOut: signOut,
    push: push, pull: pull, syncNow: syncNow,
    status: status, onChange: onChange, notifyChange: notifyChange,
    configured: configured, setConfig: setConfig, clearConfig: clearConfig,
    setAuto: setAuto, meta: meta
  };
})();
