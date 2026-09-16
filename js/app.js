/* =========================================================
   Servitech - lógica de la app (parte 1: base + empresas)
   ========================================================= */
'use strict';

/* ---------- utilidades ---------- */
function $(s, el) { return (el || document).querySelector(s); }
function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function money(n) {
  var sym = Store.db.meta.currency || 'S/ ';
  var num = Number(n || 0);
  return sym + num.toFixed(2);
}

function pl(n, sing, plur) {
  n = Number(n || 0);
  return n === 1 ? '1 ' + sing : n + ' ' + plur;
}

function fmtDate(iso) {
  if (!iso) return '';
  var d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d)) return iso;
  var p = function (n) { return String(n).padStart(2, '0'); };
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
}

function fmtDT(iso) {
  if (!iso) return '';
  return fmtDate(iso.slice(0, 10)) + ' ' + iso.slice(11, 16);
}

function dayLabel(isoDate) {
  if (!isoDate) return 'Sin fecha';
  var t = Store.today();
  var dIso = isoDate.slice(0, 10);
  if (dIso === t) return 'Hoy (' + fmtDate(dIso) + ')';
  var yest = new Date();
  yest.setDate(yest.getDate() - 1);
  var yIso = yest.toISOString().slice(0, 10);
  if (dIso === yIso) return 'Ayer (' + fmtDate(dIso) + ')';
  return fmtDate(dIso);
}

var EST_TAREA = { 'Pendiente': 'warn', 'En curso': 'info', 'Esperando repuestos': 'warn2', 'Completada': 'ok', 'Cancelada': 'mute' };
var EST_REP = { 'Por comprar': 'warn', 'Pedido': 'info', 'Recibido': 'info', 'Cambiado': 'ok' };
var TIPOS_TAREA = ['Correctivo', 'Preventivo', 'Instalación', 'Retiro', 'Otro'];
var PRIORIDAD = ['Baja', 'Media', 'Alta', 'Urgente'];
var TIPOS_EQUIPO = ['UPS', 'Computadora', 'Laptop', 'Impresora', 'Red / WiFi', 'CCTV', 'Punto de venta', 'Servidor', 'Otro'];
var RUBROS = ['Oficina', 'Clínica', 'Restaurante', 'Retail', 'Industrial', 'Educación', 'Servicios', 'Otro'];
var ESTADOS_TAREA_LIST = ['Pendiente', 'En curso', 'Esperando repuestos', 'Completada', 'Cancelada'];
var ESTADOS_REP_LIST = ['Por comprar', 'Pedido', 'Recibido', 'Cambiado'];

function badge(estado, map) {
  var cls = (map || {})[estado] || 'mute';
  return '<span class="badge ' + cls + '">' + esc(estado || '') + '</span>';
}

function empName(id) {
  var e = Store.get('empresas', id);
  return e ? e.razon_social : '—';
}
function eqLabel(q) {
  if (!q) return 'Sin equipo';
  return [q.tipo_equipo, q.marca, q.modelo].filter(Boolean).join(' ') || ('Equipo #' + q.id);
}
function eqName(id) {
  return eqLabel(Store.get('equipos', id));
}
function optList(arr, val, all) {
  var s = '';
  if (all !== undefined) s += '<option value="' + esc(all) + '">' + esc(all) + '</option>';
  arr.forEach(function (o) {
    s += '<option value="' + esc(o) + '"' + (String(val) === String(o) ? ' selected' : '') + '>' + esc(o) + '</option>';
  });
  return s;
}
function optEmpresas(sel, soloActivas) {
  var s = '<option value="">— Seleccionar empresa —</option>';
  Store.coll('empresas').forEach(function (e) {
    if (soloActivas && e.activo === 'No') return;
    s += '<option value="' + esc(e.id) + '"' + (String(sel) === String(e.id) ? ' selected' : '') + '>' + esc(e.razon_social) + ' (RUC ' + esc(e.ruc) + ')</option>';
  });
  return s;
}
function optEquipos(empId, sel) {
  if (!empId) return '<option value="">— Primero elige empresa —</option>';
  var list = Store.coll('equipos').filter(function (q) { return String(q.id_empresa) === String(empId); });
  if (!list.length) return '<option value="">— Sin equipos para esta empresa —</option>';
  var s = '<option value="">— Sin equipo específico —</option>';
  list.forEach(function (q) {
    var extra = [];
    if (q.usuario) extra.push('Usuario: ' + q.usuario);
    if (q.ubicacion_empresa) extra.push(q.ubicacion_empresa);
    if (q.ubicacion) extra.push(q.ubicacion);
    var extraTxt = extra.length ? ' (' + extra.join(' - ') + ')' : '';
    s += '<option value="' + esc(q.id) + '"' + (String(sel) === String(q.id) ? ' selected' : '') + '>' + esc(eqLabel(q) + extraTxt) + '</option>';
  });
  return s;
}

/* ---------- chrome (título, toast, confirmación) ---------- */
var _confirmCb = null;
function setTitle(t) { $('#appTitle').textContent = t || 'Servitech'; }
function setNew(html) {
  var b = $('#newSlot');
  if (html) { b.innerHTML = html; b.hidden = false; } else { b.hidden = true; b.innerHTML = ''; }
}
var toastTimer = null;
function toast(msg) {
  var t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
}
function confirmBox(title, msg, onOk, okLabel, danger) {
  _confirmCb = onOk;
  var ov = document.createElement('div');
  ov.className = 'ov';
  ov.innerHTML =
    '<div class="modal" role="dialog">' +
    '<h3>' + esc(title) + '</h3>' +
    '<p>' + esc(msg) + '</p>' +
    '<div class="modal-actions">' +
    '<button class="btn ghost" data-c="no">Cancelar</button>' +
    '<button class="btn ' + (danger === false ? 'primary' : 'danger') + '" data-c="yes">' + esc(okLabel || 'Eliminar') + '</button>' +
    '</div></div>';
  ov.addEventListener('click', function (e) {
    var b = e.target.closest('[data-c]');
    if (!b) return;
    document.body.removeChild(ov);
    if (b.dataset.c === 'yes' && _confirmCb) _confirmCb();
    _confirmCb = null;
  });
  document.body.appendChild(ov);
}

/* ---------- enrutador ---------- */
function route() {
  var raw = location.hash || '#/intro';
  if (raw === '#' || raw === '') raw = '#/intro';
  var rest = raw.slice(1);
  var qi = rest.indexOf('?');
  var path = qi >= 0 ? rest.slice(0, qi) : rest;
  var qs = qi >= 0 ? new URLSearchParams(rest.slice(qi + 1)) : new URLSearchParams();
  var parts = path.split('/').filter(Boolean);

  window.scrollTo(0, 0);
  var seg = parts[0] || 'intro';
  document.body.classList.toggle('cover', seg === 'intro');
  var tab = seg;
  if (seg === 'inicio') tab = 'empresas';
  if (seg === 'empresa' || seg === 'empresa-form') tab = 'empresas';
  if (seg === 'equipos' || seg === 'equipo-form') tab = 'equipos';
  if (seg === 'tarea' || seg === 'tarea-form') tab = 'tareas';
  if (seg === 'repuesto-form') tab = 'compras';
  if (seg === 'informe' || seg === 'informe-form') tab = 'informes';
  if (seg === 'costos') tab = 'costos';
  $$('#tabbar .tab').forEach(function (t) { t.classList.toggle('active', t.dataset.tab === tab); });

  try {
    if (seg === 'intro') vIntro();
    else if (seg === 'inicio') vInicio();
    else if (seg === 'empresas') vEmpresas(qs);
    else if (seg === 'empresa' && parts[1]) vEmpresa(parts[1]);
    else if (seg === 'empresa-form') vEmpresaForm(qs);
    else if (seg === 'equipos') vEquipos(qs);
    else if (seg === 'equipo-form') vEquipoForm(qs);
    else if (seg === 'tareas') vTareas(qs);
    else if (seg === 'tarea' && parts[1]) vTarea(parts[1]);
    else if (seg === 'tarea-form') vTareaForm(qs);
    else if (seg === 'compras') vCompras(qs);
    else if (seg === 'repuesto-form') vRepuestoForm(qs);
    else if (seg === 'informes') vInformes();
    else if (seg === 'informe-form') vInformeForm(qs);
    else if (seg === 'informe' && parts[1]) vInforme(parts[1]);
    else if (seg === 'costos') vCostos(qs);
    else if (seg === 'ajustes') vAjustes();
    else { location.hash = '#/empresas'; }
  } catch (err) {
    console.error(err);
    $('#view').innerHTML = '<div class="card pad"><h3>Error inesperado</h3><p>' + esc(err.message) + '</p><a class="btn ghost" href="#/empresas">Volver al inicio</a></div>';
  }
}

/* =========================================================
   EMPRESAS
   ========================================================= */
function cardBack(href) {
  return '<a class="btn ghost sm" href="' + (href || '#/empresas') + '">← Volver</a>';
}

/* =========================================================
   PORTADA (intro) y CARPETA DE TRABAJO (inicio)
   ========================================================= */
function vIntro() {
  setTitle('Servitech');
  setNew(null);
  $('#view').innerHTML =
    '<div class="intro">' +
      '<div class="glow g1"></div><div class="glow g2"></div><div class="glow g3"></div>' +
      '<div class="intro-in">' +
        '<span class="brand-mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg></span>' +
        '<div class="folder-wrap">' +
          '<span class="folder-ring"></span>' +
          '<svg class="folder" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/></svg>' +
        '</div>' +
        '<h1>Servitech</h1>' +
        '<p class="tag">Tu carpeta de soporte técnico<br>en campo</p>' +
        '<a class="btn-open" href="#/inicio">Abrir carpeta de trabajo<span class="arr">→</span></a>' +
        '<div class="intro-pills"><span>Empresas</span><span>Equipos</span><span>Tareas</span><span>Repuestos</span><span>Informes</span></div>' +
      '</div>' +
    '</div>';
}

function openCount(empId) {
  return Store.db.tareas.filter(function (t) {
    return String(t.id_empresa) === String(empId) && t.estado !== 'Completada' && t.estado !== 'Cancelada';
  }).length;
}

function vInicio() {
  var db = Store.db;
  var m = db.meta;
  setTitle('En servicio');
  setNew('<a class="btn primary sm" href="#/tarea-form">+ Tarea</a>');
  var name = (m && m.tecnico) ? m.tecnico : 'técnico';
  var tareasAbiertas = db.tareas.filter(function (t) { return t.estado !== 'Completada' && t.estado !== 'Cancelada'; });
  var comprar = db.repuestos.filter(function (r) { return r.estado_pedido !== 'Cambiado'; });
  var activas = db.empresas.filter(function (e) { return e.activo !== 'No'; });
  var enServicio = db.empresas.filter(function (e) { return openCount(e.id) > 0; });
  enServicio.sort(function (a, b) { return openCount(b.id) - openCount(a.id); });

  var html = '<div class="stack">' +
    '<div class="welcome"><div class="hey">Hola, ' + esc(name) + '</div>' +
    '<p>Esto es lo que tienes en marcha hoy.</p></div>' +

    '<div class="stats">' +
    '<a class="stat hero" href="#/tareas">' +
    '<span class="lab">Tareas abiertas</span><span class="num">' + tareasAbiertas.length + '</span>' +
    '<span class="sub">pendientes y en curso</span></a>' +
    '<a class="stat" href="#/compras">' +
    '<span class="lab">Repuestos por comprar</span><span class="num">' + comprar.length + '</span>' +
    '<span class="sub">por comprar · pedido · recibido</span></a>' +
    '<a class="stat" href="#/empresas">' +
    '<span class="lab">Empresas</span><span class="num">' + activas.length + '</span>' +
    '<span class="sub">clientes activos</span></a>' +
    '<a class="stat" href="#/empresas">' +
    '<span class="lab">Equipos</span><span class="num">' + db.equipos.length + '</span>' +
    '<span class="sub">registrados</span></a>' +
    '</div>' +

    '<h2 class="sec">En servicio ahora</h2>';
  if (!enServicio.length) {
    html += '<div class="empty"><p>No hay empresas con trabajo abierto.<br>Crea una tarea o registra una empresa nueva.</p>' +
      '<div class="btnrow" style="justify-content:center"><a class="btn primary sm" href="#/tarea-form">+ Nueva tarea</a>' +
      '<a class="btn secondary sm" href="#/empresa-form">+ Empresa</a></div></div>';
  }
  enServicio.forEach(function (e) {
    var n = openCount(e.id);
    html += '<a class="card row enserv" href="#/empresa/' + esc(e.id) + '">' +
      '<span class="serv-dot"></span>' +
      '<div class="row-main"><div class="t">' + esc(e.razon_social) + '</div>' +
      '<div class="s">RUC ' + esc(e.ruc || '—') + ' · ' + pl(n, 'tarea abierta', 'tareas abiertas') + '</div></div>' +
      '<div class="row-meta"><span class="badge warn2">' + pl(n, 'abierta', 'abiertas') + '</span></div></a>';
  });
  if (enServicio.length) {
    html += '<a class="btn ghost sm" href="#/empresas">Ver todas las empresas →</a>';
  }
  html += '</div>';
  $('#view').innerHTML = html;
}

function empListHtml(q) {
  var db = Store.db;
  q = (q || '').toLowerCase();
  var list = db.empresas.slice().sort(function (a, b) { return (b.fecha_alta || '').localeCompare(a.fecha_alta || ''); });
  if (q) list = list.filter(function (e) {
    return (e.razon_social + ' ' + e.ruc + ' ' + (e.rubro || '')).toLowerCase().indexOf(q) >= 0;
  });
  var html = '';
  if (!db.empresas.length) {
    html = '<div class="empty"><p>No hay empresas registradas.</p><a class="btn primary" href="#/empresa-form">Registrar mi primera empresa</a></div>';
  } else if (!list.length) {
    html = '<div class="empty"><p>Sin resultados para tu búsqueda.</p></div>';
  }
  list.forEach(function (e) {
    var eqs = db.equipos.filter(function (x) { return String(x.id_empresa) === String(e.id); });
    var tars = db.tareas.filter(function (x) { return String(x.id_empresa) === String(e.id); });
    var abiertas = tars.filter(function (x) { return x.estado !== 'Completada' && x.estado !== 'Cancelada'; }).length;
    html +=
      '<a class="card row" href="#/empresa/' + esc(e.id) + '">' +
      '<div class="row-main">' +
      '<div class="t">' + esc(e.razon_social) + (e.activo === 'No' ? ' <span class="badge mute">Inactiva</span>' : '') + '</div>' +
      '<div class="s">RUC ' + esc(e.ruc || '—') + (e.rubro ? ' · ' + esc(e.rubro) : '') + '</div>' +
      '<div class="s">' + esc(e.direccion || 'Sin dirección') + '</div>' +
      '</div>' +
      '<div class="row-meta">' +
      '<span class="cnt">' + pl(eqs.length, 'equipo', 'equipos') + '</span>' +
      '<span class="cnt' + (abiertas ? ' warn2' : '') + '">' + pl(abiertas, 'abierta', 'abiertas') + '</span>' +
      '</div></a>';
  });
  return html;
}

function vEmpresas(qs) {
  setTitle('Empresas');
  setNew('<a class="btn primary sm" href="#/empresa-form">+ Nueva</a>');
  var html = '<div class="search"><input id="busEmp" placeholder="Buscar por nombre o RUC…" value="' + esc(qs.get('q') || '') + '"></div>' +
    '<div id="listWrap"></div>';
  $('#view').innerHTML = html;
  var inp = $('#busEmp');
  function fill() { $('#listWrap').innerHTML = empListHtml(inp.value); }
  fill();
  inp.addEventListener('input', fill);
}

function vEmpresa(id) {
  var e = Store.get('empresas', id);
  if (!e) { location.hash = '#/empresas'; return; }
  setTitle(e.razon_social);
  setNew(null);
  var db = Store.db;
  var eqs = db.equipos.filter(function (x) { return String(x.id_empresa) === String(id); });
  var tars = db.tareas.filter(function (x) { return String(x.id_empresa) === String(id); })
    .sort(function (a, b) { return (b.fecha_creacion || '').localeCompare(a.fecha_creacion || ''); });
  var infs = db.informes.filter(function (x) { return tars.some(function (t) { return String(t.id) === String(x.id_tarea); }); });

  var html = '<div class="stack">' + cardBack() +
    '<div class="card pad">' +
    '<div class="kv"><span>RUC</span><b>' + esc(e.ruc || '—') + '</b></div>' +
    '<div class="kv"><span>Dirección</span><b>' + esc(e.direccion || '—') + '</b></div>' +
    '<div class="kv"><span>Teléfono</span><b>' + esc(e.telefono || '—') + '</b></div>' +
    '<div class="kv"><span>Email</span><b>' + esc(e.email || '—') + '</b></div>' +
    '<div class="kv"><span>Contacto</span><b>' + esc(e.persona_contacto || '—') + (e.cargo_contacto ? ' (' + esc(e.cargo_contacto) + ')' : '') + '</b></div>' +
    '<div class="kv"><span>Móvil contacto</span><b>' + esc(e.telefono_contacto || '—') + '</b></div>' +
    '<div class="kv"><span>Rubro</span><b>' + esc(e.rubro || '—') + '</b></div>' +
    (e.notas ? '<div class="kv"><span>Notas</span><b>' + esc(e.notas) + '</b></div>' : '') +
    '<div class="kv"><span>Cliente desde</span><b>' + fmtDate(e.fecha_alta) + '</b></div>' +
    '<div class="btnrow">' +
    '<a class="btn ghost sm" href="#/empresa-form?edit=' + esc(e.id) + '">Editar ficha</a>' +
    '<button class="btn danger sm" data-act="del-emp" data-id="' + esc(e.id) + '">Eliminar</button>' +
    '</div></div>';

  html += '<h2 class="sec">Equipos (' + eqs.length + ')</h2>';
  eqs.forEach(function (q, idx) {
    var fReg = q.fecha_registro ? fmtDate(q.fecha_registro) : '';
    var metaArr = ['Serie ' + esc(q.nro_serie || '—')];
    if (q.usuario) metaArr.push('👤 ' + esc(q.usuario));
    if (q.ubicacion_empresa) metaArr.push('🏢 ' + esc(q.ubicacion_empresa));
    if (q.ubicacion) metaArr.push('📍 ' + esc(q.ubicacion));
    if (fReg) metaArr.push('Reg: ' + esc(fReg));

    html += '<div class="card row">' +
      '<span class="item-num">#' + (idx + 1) + '</span>' +
      '<div class="row-main">' +
      '<div class="t">' + esc(eqLabel(q)) + '</div>' +
      '<div class="s">' + metaArr.join(' · ') + '</div>' +
      '</div>' +
      '<div class="row-meta"><a class="btn ghost sm" href="#/equipo-form?empresa=' + esc(e.id) + '&edit=' + esc(q.id) + '">Editar</a>' +
      '<button class="btn danger sm" data-act="del-equipo" data-id="' + esc(q.id) + '">Quitar</button></div></div>';
  });
  html += '<a class="btn secondary sm" href="#/equipo-form?empresa=' + esc(e.id) + '">+ Registrar equipo</a>';

  html += '<div class="line" style="margin-top:18px;margin-bottom:6px;"><h2 class="sec" style="margin:0;">Jornadas y tareas (' + tars.length + ')</h2>' +
    '<a class="btn primary sm" href="#/tarea-form?empresa=' + esc(e.id) + '">+ Nueva tarea</a></div>';

  var dayGroups = Store.getTareasPorFecha(id);
  if (!dayGroups.length) {
    html += '<div class="empty sm"><p>Sin tareas todavía.</p><a class="btn secondary sm" href="#/tarea-form?empresa=' + esc(e.id) + '">+ Registrar primera tarea</a></div>';
  } else {
    dayGroups.forEach(function (group) {
      var dFmt = dayLabel(group.fecha);
      var infExistente = infs.find(function (inf) {
        return inf.fecha_servicio === group.fecha || (inf.fecha_emision && inf.fecha_emision.slice(0, 10) === group.fecha);
      });
      html += '<div class="day-card">' +
        '<div class="day-head">' +
        '<div class="day-title"><span>📅 ' + esc(dFmt) + '</span><span class="day-badge">' + pl(group.tareas.length, 'tarea', 'tareas') + '</span></div>' +
        '<div class="day-actions">' +
        (infExistente ?
          '<a class="btn ghost sm" style="font-size:11.5px;padding:3px 8px;" href="#/informe/' + esc(infExistente.id) + '">Ver informe ' + esc(infExistente.codigo) + '</a>' :
          '<a class="btn secondary sm" style="font-size:11.5px;padding:3px 8px;" href="#/informe-form?empresa=' + esc(e.id) + '&fecha=' + esc(group.fecha) + '">📝 Informe del día</a>'
        ) +
        '<a class="btn ghost sm" style="font-size:11.5px;padding:3px 8px;" href="#/tarea-form?empresa=' + esc(e.id) + '&fecha=' + esc(group.fecha) + '">+ Tarea</a>' +
        '</div></div>' +
        '<div class="day-items">';
      group.tareas.forEach(function (t, tIdx) {
        html += '<a class="card row" href="#/tarea/' + esc(t.id) + '">' +
          '<span class="item-num">#' + (tIdx + 1) + '</span>' +
          '<div class="row-main"><div class="t">' + esc(t.descripcion_trabajo || eqName(t.id_equipo)) + '</div>' +
          '<div class="s">' + esc(eqName(t.id_equipo)) + (t.tipo_tarea ? ' · ' + esc(t.tipo_tarea) : '') + '</div></div>' +
          '<div class="row-meta">' + badge(t.estado, EST_TAREA) + '</div></a>';
      });
      html += '</div></div>';
    });
  }

  if (infs.length) {
    html += '<h2 class="sec" style="margin-top:20px;">Informes emitidos (' + infs.length + ')</h2>';
    infs.forEach(function (x) {
      html += '<a class="card row" href="#/informe/' + esc(x.id) + '"><div class="row-main"><div class="t">' + esc(x.codigo) + '</div><div class="s">' + fmtDT(x.fecha_emision) + ' · ' + esc(x.nombre_responsable || 'sin firma') + '</div></div><div class="row-meta">PDF</div></a>';
    });
  }
  html += '</div>';
  $('#view').innerHTML = html;
}

function field(label, name, value, type, ph, required) {
  type = type || 'text';
  return '<label class="fld"><span>' + esc(label) + (required ? ' *' : '') + '</span>' +
    '<input type="' + type + '" name="' + name + '" value="' + esc(value) + '" placeholder="' + esc(ph || '') + '"' + (required ? ' required' : '') + '></label>';
}
function fieldArea(label, name, value, ph) {
  return '<label class="fld"><span>' + esc(label) + '</span><textarea name="' + name + '" rows="3" placeholder="' + esc(ph || '') + '">' + esc(value) + '</textarea></label>';
}
function fieldSel(label, name, optsHtml) {
  return '<label class="fld"><span>' + esc(label) + '</span><select name="' + name + '">' + optsHtml + '</select></label>';
}

function vEmpresaForm(qs) {
  var e = qs.get('edit') ? Store.get('empresas', qs.get('edit')) : null;
  setTitle(e ? 'Editar empresa' : 'Nueva empresa');
  setNew(null);
  var v = function (k) { return e ? e[k] : ''; };
  $('#view').innerHTML =
    '<div class="stack">' + cardBack() +
    '<form class="card pad" data-f="emp" data-id="' + (e ? esc(e.id) : '') + '">' +
    '<div class="row2">' +
    field('Razón social', 'razon_social', v('razon_social'), 'text', 'Ej: Clínica San Martín S.A.C.', true) +
    field('RUC', 'ruc', v('ruc'), 'text', 'Número de RUC', true) +
    '</div>' +
    field('Dirección', 'direccion', v('direccion')) +
    '<div class="row2">' +
    field('Teléfono', 'telefono', v('telefono'), 'tel') +
    field('Email', 'email', v('email'), 'email') +
    '</div>' +
    '<div class="row2">' +
    field('Persona de contacto', 'persona_contacto', v('persona_contacto')) +
    field('Cargo', 'cargo_contacto', v('cargo_contacto')) +
    '</div>' +
    '<div class="row2">' +
    field('Móvil de contacto', 'telefono_contacto', v('telefono_contacto'), 'tel') +
    fieldSel('Rubro', 'rubro', optList(RUBROS, v('rubro'), '')) +
    '</div>' +
    fieldArea('Notas (accesos, horarios…)', 'notas', v('notas')) +
    fieldSel('Estado', 'activo', '<option value="Si">Activa</option><option value="No"' + (v('activo') === 'No' ? ' selected' : '') + '>Inactiva</option>') +
    '<button class="btn primary block" type="submit">Guardar empresa</button>' +
    '</form></div>';
}

function readForm(form) {
  var out = {};
  $$('input,select,textarea', form).forEach(function (i) {
    if (!i.name) return;
    if (i.type === 'radio') {
      if (i.checked) out[i.name] = i.value;
    } else if (i.type === 'checkbox') {
      out[i.name] = i.checked;
    } else {
      out[i.name] = i.value;
    }
  });
  return out;
}

function saveEmpresa(form) {
  var d = readForm(form);
  var id = form.dataset.id;
  if (id) { Store.upd('empresas', id, d); toast('Empresa actualizada'); }
  else { var row = Store.add('empresas', d); id = row.id; toast('Empresa registrada'); }
  location.hash = '#/empresa/' + id;
}

/* =========================================================
   EQUIPOS (Registro general de equipos)
   ========================================================= */
function eqListHtml(q, idEmp) {
  var db = Store.db;
  q = (q || '').toLowerCase();
  var list = db.equipos.slice().sort(function (a, b) {
    return (b.fecha_registro || '').localeCompare(a.fecha_registro || '');
  });
  if (idEmp) {
    list = list.filter(function (x) { return String(x.id_empresa) === String(idEmp); });
  }
  if (q) {
    list = list.filter(function (x) {
      var full = (eqLabel(x) + ' ' + (x.nro_serie || '') + ' ' + (x.usuario || '') + ' ' + (x.ubicacion_empresa || '') + ' ' + (x.ubicacion || '') + ' ' + empName(x.id_empresa)).toLowerCase();
      return full.indexOf(q) >= 0;
    });
  }
  if (!db.equipos.length) {
    return '<div class="empty"><p>No hay equipos registrados en el sistema.</p><a class="btn primary" href="#/equipo-form">+ Registrar primer equipo</a></div>';
  }
  if (!list.length) {
    return '<div class="empty"><p>Sin equipos para los filtros aplicados.</p></div>';
  }

  var html = '';
  list.forEach(function (eq, idx) {
    var emp = Store.get('empresas', eq.id_empresa);
    var fReg = eq.fecha_registro ? fmtDate(eq.fecha_registro) : '';
    var tars = db.tareas.filter(function (t) { return String(t.id_equipo) === String(eq.id); });
    var tarsPend = tars.filter(function (t) { return t.estado !== 'Completada' && t.estado !== 'Cancelada'; }).length;

    var extraMeta = [];
    if (eq.usuario) extraMeta.push('👤 <b>Usuario:</b> ' + esc(eq.usuario));
    if (eq.ubicacion_empresa) extraMeta.push('🏢 ' + esc(eq.ubicacion_empresa));
    if (eq.ubicacion) extraMeta.push('📍 ' + esc(eq.ubicacion));
    if (fReg) extraMeta.push('Reg: ' + esc(fReg));

    html += '<div class="card row">' +
      '<span class="item-num">#' + (idx + 1) + '</span>' +
      '<div class="row-main">' +
      '<div class="t">' + esc(eqLabel(eq)) + '</div>' +
      '<div class="s"><b>Cliente:</b> ' + (emp ? esc(emp.razon_social) : '—') + '</div>' +
      '<div class="s">Serie: ' + esc(eq.nro_serie || '—') + (extraMeta.length ? ' · ' + extraMeta.join(' · ') : '') + '</div>' +
      '</div>' +
      '<div class="row-meta" style="display:flex; flex-direction:column; gap:4px; align-items:flex-end;">' +
      '<span class="cnt' + (tarsPend ? ' warn2' : '') + '">' + pl(tarsPend, 'pendiente', 'pendientes') + '</span>' +
      '<div class="btnrow" style="margin-top:2px;">' +
      '<a class="btn ghost sm" style="padding:2px 7px;font-size:11px;" href="#/equipo-form?edit=' + esc(eq.id) + '">Editar</a>' +
      '<a class="btn secondary sm" style="padding:2px 7px;font-size:11px;" href="#/tarea-form?empresa=' + esc(eq.id_empresa) + '&equipo=' + esc(eq.id) + '">+ Tarea</a>' +
      '</div>' +
      '</div></div>';
  });
  return html;
}

function vEquipos(qs) {
  setTitle('Equipos');
  setNew('<a class="btn primary sm" href="#/equipo-form">+ Registrar equipo</a>');
  var empSel = qs.get('empresa') || '';
  var qText = qs.get('q') || '';

  var html = '<div class="stack">' +
    '<div class="search"><input id="busEq" placeholder="Buscar por tipo, modelo, serie o cliente…" value="' + esc(qText) + '"></div>' +
    '<div class="card pad" style="padding:8px 12px; margin-bottom:2px;">' +
    '<div class="kv" style="align-items:center;"><span>Filtrar por empresa:</span>' +
    '<select id="selEmpEq" style="max-width:240px; padding:6px 8px; border-radius:8px; border:1px solid var(--line);">' +
    '<option value="">— Todas las empresas —</option>';
  Store.coll('empresas').forEach(function (e) {
    html += '<option value="' + esc(e.id) + '"' + (String(empSel) === String(e.id) ? ' selected' : '') + '>' + esc(e.razon_social) + '</option>';
  });
  html += '</select></div></div>' +
    '<div id="listWrapEq"></div>' +
    '</div>';
  $('#view').innerHTML = html;

  var inp = $('#busEq');
  var sel = $('#selEmpEq');
  function fill() {
    $('#listWrapEq').innerHTML = eqListHtml(inp.value, sel.value);
  }
  fill();
  inp.addEventListener('input', fill);
  sel.addEventListener('change', fill);
}

function vEquipoForm(qs) {
  var empId = qs.get('empresa');
  var eq = qs.get('edit') ? Store.get('equipos', qs.get('edit')) : null;
  if (eq) empId = eq.id_empresa;
  if (!empId && qs.get('empresa')) { /* nada */ }
  setTitle(eq ? 'Editar equipo' : 'Nuevo equipo');
  setNew(null);
  var v = function (k) { return eq ? eq[k] : ''; };
  var back = eq ? '#/empresa/' + esc(eq.id_empresa) : (empId ? '#/empresa/' + esc(empId) : '#/empresas');
  $('#view').innerHTML =
    '<div class="stack">' + '<a class="btn ghost sm" href="' + back + '">← Volver</a>' +
    '<form class="card pad" data-f="equ" data-id="' + (eq ? esc(eq.id) : '') + '">' +
    '<input type="hidden" name="id_empresa" value="' + esc(empId || '') + '">' +
    fieldSel('Empresa', 'id_empresa_sel', optEmpresas(empId, false)) +
    '<div class="row2">' +
    '<label class="fld"><span>Tipo de equipo</span><input name="tipo_equipo" list="dlTipo" value="' + esc(v('tipo_equipo')) + '"></label>' +
    field('Marca', 'marca', v('marca')) +
    '</div>' +
    '<datalist id="dlTipo">' + TIPOS_EQUIPO.map(function (o) { return '<option value="' + esc(o) + '">'; }).join('') + '</datalist>' +
    '<div class="row2">' +
    field('Modelo', 'modelo', v('modelo')) +
    field('N° de serie', 'nro_serie', v('nro_serie')) +
    '</div>' +
    '<div class="row2">' +
    field('Usuario del equipo', 'usuario', v('usuario'), 'text', 'Ej: Juan Pérez / Recepción') +
    field('Ubicación de la empresa (sede / sucursal)', 'ubicacion_empresa', v('ubicacion_empresa'), 'text', 'Ej: Sede Principal, Sucursal Norte…') +
    '</div>' +
    field('Ubicación interna (piso, oficina…)', 'ubicacion', v('ubicacion'), 'text', 'Ej: Piso 3, Oficina 302, Sala de servidores…') +
    field('Fecha de registro', 'fecha_registro', v('fecha_registro') || Store.today(), 'date', '', true) +
    fieldArea('Notas del equipo', 'notas_equipo', v('notas_equipo')) +
    '<button class="btn primary block" type="submit">Guardar equipo</button>' +
    '</form></div>';

  var sel = $('select[name=id_empresa_sel]');
  sel.addEventListener('change', function () {
    // Actualizar campo oculto sin recargar la vista (preserva los datos ya escritos)
    var hid = $('input[name=id_empresa]');
    if (hid) hid.value = sel.value;
  });
}

function saveEquipo(form) {
  var d = readForm(form);
  d.id_empresa = d.id_empresa_sel || d.id_empresa;
  delete d.id_empresa_sel;
  if (!d.id_empresa) { toast('Elige la empresa'); return; }
  d.fecha_registro = d.fecha_registro || Store.today();
  var id = form.dataset.id;
  if (id) { Store.upd('equipos', id, d); toast('Equipo actualizado'); }
  else { var row = Store.add('equipos', d); id = row.id; toast('Equipo registrado'); }
  location.hash = '#/empresa/' + d.id_empresa;
}

/* =========================================================
   TAREAS (banco de tareas)
   ========================================================= */
function tarListHtml(q, est) {
  var db = Store.db;
  q = (q || '').toLowerCase();
  var list = db.tareas.slice();
  if (est) list = list.filter(function (t) { return t.estado === est; });
  if (q) list = list.filter(function (t) {
    return (empName(t.id_empresa) + ' ' + eqName(t.id_equipo) + ' ' + (t.descripcion_trabajo || '')).toLowerCase().indexOf(q) >= 0;
  });
  if (!list.length) {
    return '<div class="empty"><p>' + (db.tareas.length ? 'Sin tareas para este filtro.' : 'No hay tareas. Crea una desde el botón + Nueva.') + '</p></div>';
  }

  // Agrupar por fecha
  var groups = {};
  list.forEach(function (t) {
    var f = t.fecha_trabajo || t.fecha_programada || t.fecha_creacion || Store.today();
    if (!groups[f]) groups[f] = [];
    groups[f].push(t);
  });
  var sortedDates = Object.keys(groups).sort(function (a, b) { return b.localeCompare(a); });

  var html = '';
  sortedDates.forEach(function (f) {
    var dFmt = dayLabel(f);
    html += '<div class="day-card">' +
      '<div class="day-head">' +
      '<div class="day-title"><span>📅 ' + esc(dFmt) + '</span><span class="day-badge">' + pl(groups[f].length, 'tarea', 'tareas') + '</span></div>' +
      '</div>' +
      '<div class="day-items">';
    groups[f].forEach(function (t, idx) {
      var cod = 'T-' + String(t.id).padStart(4, '0');
      html += '<a class="card row" href="#/tarea/' + esc(t.id) + '">' +
        '<span class="item-num">#' + (idx + 1) + '</span>' +
        '<div class="row-main">' +
        '<div class="t">' + esc(t.descripcion_trabajo || '(sin descripción)') + '</div>' +
        '<div class="s">' + esc(empName(t.id_empresa)) + ' · ' + esc(eqName(t.id_equipo)) + '</div>' +
        '<div class="s">' + cod + (t.prioridad ? ' · ' + esc(t.prioridad) : '') + '</div>' +
        '</div><div class="row-meta">' + badge(t.estado, EST_TAREA) + '</div></a>';
    });
    html += '</div></div>';
  });
  return html;
}

function vTareas(qs) {
  setTitle('Tareas');
  setNew('<a class="btn primary sm" href="#/tarea-form">+ Nueva</a>');
  var est = qs.get('est') || '';
  var chips = '<div class="chips">';
  chips += '<a class="chip' + (!est ? ' on' : '') + '" href="#/tareas">Todas</a>';
  ESTADOS_TAREA_LIST.forEach(function (s) {
    chips += '<a class="chip' + (est === s ? ' on' : '') + '" href="#/tareas?est=' + encodeURIComponent(s) + '">' + esc(s) + '</a>';
  });
  chips += '</div>';
  var html = chips +
    '<div class="search"><input id="busTar" placeholder="Buscar por empresa o equipo…" value="' + esc(qs.get('q') || '') + '"></div>' +
    '<div id="listWrap"></div>';
  $('#view').innerHTML = html;
  var inp = $('#busTar');
  function fill() { $('#listWrap').innerHTML = tarListHtml(inp.value, est); }
  fill();
  inp.addEventListener('input', fill);
}

function vTareaForm(qs) {
  var t = qs.get('edit') ? Store.get('tareas', qs.get('edit')) : null;
  setTitle(t ? 'Editar tarea' : 'Nueva tarea');
  setNew(null);
  var v = function (k) { return t ? t[k] : ''; };
  var defEmp = qs.get('empresa') || (t ? t.id_empresa : '');
  var defEqu = qs.get('equipo') || (t ? t.id_equipo : '');
  var _backTarUrl = t ? '#/tarea/' + esc(t.id) : (defEmp ? '#/empresa/' + esc(defEmp) : '#/tareas');
  $('#view').innerHTML =
    '<div class="stack">' + cardBack(_backTarUrl) +
    '<form class="card pad" data-f="tar" data-id="' + (t ? esc(t.id) : '') + '">' +
    fieldSel('Empresa', 'id_empresa_sel', optEmpresas(defEmp, false)) +
    fieldSel('Equipo', 'id_equipo_sel', optEquipos(defEmp, defEqu)) +
    '<div class="row2">' +
    fieldSel('Tipo', 'tipo_tarea', optList(TIPOS_TAREA, v('tipo_tarea') || 'Correctivo', '')) +
    fieldSel('Prioridad', 'prioridad', optList(PRIORIDAD, v('prioridad') || 'Media', '')) +
    '</div>' +
    fieldSel('Estado', 'estado', optList(ESTADOS_TAREA_LIST, v('estado') || 'Pendiente', '')) +
    fieldArea('Descripción del trabajo / pedido del cliente', 'descripcion_trabajo', v('descripcion_trabajo'), 'Ej: No enciende, error de red…', true) +
    fieldArea('Trabajo realizado', 'trabajo_realizado', v('trabajo_realizado')) +
    fieldArea('Solución / estado final', 'solucion', v('solucion')) +
    '<div class="row2">' +
    fieldSel('¿Equipo operativo?', 'equipo_operativo', '<option value=""></option><option value="Sí"' + (v('equipo_operativo') === 'Sí' ? ' selected' : '') + '>Sí</option><option value="No"' + (v('equipo_operativo') === 'No' ? ' selected' : '') + '>No</option>') +
    fieldSel('Estado del informe', 'informe_emitido', '<option value="false">Sin informe</option><option value="true"' + (v('informe_emitido') === true || v('informe_emitido') === 'true' ? ' selected' : '') + '>Emitido</option>') +
    '</div>' +
    fieldArea('Recomendaciones', 'recomendaciones', v('recomendaciones')) +
    '<div class="row2">' +
    field('Fecha del trabajo (día)', 'fecha_trabajo', v('fecha_trabajo') || qs.get('fecha') || Store.today(), 'date', '', true) +
    field('Costo de mano de obra / servicio (' + (Store.db.meta.currency || 'S/ ') + ')', 'costo', v('costo') != null && v('costo') !== '' ? v('costo') : '', 'number', '0.00') +
    '</div>' +
    field('Técnico responsable', 'tecnico_responsable', v('tecnico_responsable') || Store.db.meta.tecnico || '', 'text', 'Tu nombre') +
    '<button class="btn primary block" type="submit">' + (t ? 'Guardar cambios' : 'Crear tarea') + '</button>' +
    '</form></div>';

  var sEmp = $('select[name=id_empresa_sel]');
  var sEqu = $('select[name=id_equipo_sel]');
  sEmp.addEventListener('change', function () {
    sEqu.innerHTML = optEquipos(sEmp.value, '');
  });
}

function saveTarea(form) {
  var d = readForm(form);
  d.id_empresa = d.id_empresa_sel; delete d.id_empresa_sel;
  d.id_equipo = d.id_equipo_sel; delete d.id_equipo_sel;
  if (!d.id_empresa) { toast('Elige la empresa'); return; }
  if (!d.descripcion_trabajo.trim()) { toast('Escribe una descripción'); return; }
  d.fecha_trabajo = d.fecha_trabajo || Store.today();
  d.informe_emitido = (d.informe_emitido === 'true');
  if (d.costo !== undefined && d.costo !== '') d.costo = parseFloat(d.costo) || 0;
  var id = form.dataset.id;
  if (id) { Store.upd('tareas', id, d); toast('Tarea actualizada'); }
  else { d.fecha_creacion = Store.today(); var row = Store.add('tareas', d); id = row.id; toast('Tarea creada'); }
  location.hash = '#/tarea/' + id;
}

function vTarea(id) {
  var t = Store.get('tareas', id);
  if (!t) { location.hash = '#/tareas'; return; }
  setTitle('Tarea T-' + String(id).padStart(4, '0'));
  setNew(null);
  var db = Store.db;
  var reps = db.repuestos.filter(function (r) { return String(r.id_tarea) === String(id); });
  var inf = db.informes.find(function (x) { return String(x.id_tarea) === String(id); });
  var html = '<div class="stack">' + cardBack('#/tareas') +
    '<div class="card pad">' +
    '<div class="line"><span class="big">' + esc(empName(t.id_empresa)) + '</span>' + badge(t.estado, EST_TAREA) + '</div>' +
    (function () {
      var q = t.id_equipo ? Store.get('equipos', t.id_equipo) : null;
      var qHtml = '<div class="kv"><span>Equipo</span><b>' + esc(eqName(t.id_equipo)) + '</b></div>';
      if (q) {
        if (q.usuario) qHtml += '<div class="kv"><span>Usuario del equipo</span><b>' + esc(q.usuario) + '</b></div>';
        if (q.ubicacion_empresa) qHtml += '<div class="kv"><span>Sede / Sucursal</span><b>' + esc(q.ubicacion_empresa) + '</b></div>';
        if (q.ubicacion) qHtml += '<div class="kv"><span>Ubicación interna</span><b>' + esc(q.ubicacion) + '</b></div>';
      }
      return qHtml;
    })() +
    '<div class="kv"><span>Tipo / prioridad</span><b>' + esc(t.tipo_tarea || '—') + ' · ' + esc(t.prioridad || '—') + '</b></div>' +
    '<div class="kv"><span>Descripción</span><b>' + esc(t.descripcion_trabajo || '—') + '</b></div>' +
    (t.costo != null && t.costo !== '' ? '<div class="kv"><span>Costo de servicio</span><b>' + money(Number(t.costo) || 0) + '</b></div>' : '') +
    (t.novedad ? '<div class="kv"><span>Novedad (encontrado)</span><b>' + esc(t.novedad) + '</b></div>' : '') +
    (t.trabajo_realizado ? '<div class="kv"><span>Trabajo realizado</span><b>' + esc(t.trabajo_realizado) + '</b></div>' : '') +
    (t.solucion ? '<div class="kv"><span>Solución</span><b>' + esc(t.solucion) + '</b></div>' : '') +
    (t.recomendaciones ? '<div class="kv"><span>Recomendaciones</span><b>' + esc(t.recomendaciones) + '</b></div>' : '') +
    '<div class="kv"><span>Creada</span><b>' + fmtDate(t.fecha_creacion) + '</b>' +
    (t.fecha_programada ? ' · programada: ' + fmtDate(t.fecha_programada) : '') +
    (t.fecha_inicio ? ' · inicio: ' + fmtDT(t.fecha_inicio) : '') +
    (t.fecha_fin ? ' · fin: ' + fmtDT(t.fecha_fin) : '') + '</div>' +
    '<div class="btnrow">' +
    '<a class="btn ghost sm" href="#/tarea-form?edit=' + esc(id) + '">Editar</a>' +
    '<button class="btn danger sm" data-act="del-tarea" data-id="' + esc(id) + '">Eliminar</button>' +
    '</div></div>';

  /* cambio rápido de estado */
  html += '<div class="card pad"><label class="fld"><span>Cambiar estado</span><select id="estSel">' +
    optList(ESTADOS_TAREA_LIST, t.estado, '') + '</select></label></div>';

  html += '<h2 class="sec">Repuestos (' + reps.length + ')</h2>';
  reps.forEach(function (r) {
    html += '<div class="card row">' +
      '<div class="row-main"><div class="t">' + esc(r.descripcion_pieza) + '</div>' +
      '<div class="s">x' + esc(r.cantidad) + ' · ' + money(r.precio_unitario) + (r.proveedor ? ' · ' + esc(r.proveedor) : '') + '</div></div>' +
      '<div class="row-meta"><span class="badge ' + (EST_REP[r.estado_pedido] || 'mute') + '">' + esc(r.estado_pedido) + '</span>' +
      '<button class="btn danger sm" data-act="del-rep" data-id="' + esc(r.id) + '">Quitar</button></div></div>';
  });
  html += '<a class="btn secondary sm" href="#/repuesto-form?tarea=' + esc(id) + '">+ Agregar repuesto</a>';

  html += '<h2 class="sec">Cierre e informe</h2>';
  if (t.estado === 'Completada' && inf) {
    html += '<a class="btn primary block" href="#/informe/' + esc(inf.id) + '">Ver informe emitido</a>';
  } else {
    html += '<a class="btn primary block" href="#/informe-form?tarea=' + esc(id) + '">Generar informe y firmar</a>' +
      '<p class="hint">Al generar el informe con firma, la tarea pasará a Completada.</p>';
  }
  html += '</div>';
  $('#view').innerHTML = html;

  var sel = $('#estSel');
  if (sel) sel.addEventListener('change', function () {
    Store.upd('tareas', id, { estado: sel.value });
    toast('Estado: ' + sel.value);
    route();
  });
}

/* =========================================================
   REPUESTOS / COMPRAS
   ========================================================= */
function repRow(r, extra) {
  var ctx = '';
  if (r.id_tarea) ctx += '<div class="s">Tarea: ' + esc(empName(Store.get('tareas', r.id_tarea) && Store.get('tareas', r.id_tarea).id_empresa)) + ' — ' + esc((Store.get('tareas', r.id_tarea) || {}).descripcion_trabajo || 'T-' + r.id_tarea) + '</div>';
  return '<div class="card row">' +
    '<div class="row-main"><div class="t">' + esc(r.descripcion_pieza) + (r.referencia ? ' <span class="mono">[' + esc(r.referencia) + ']</span>' : '') + '</div>' +
    ctx +
    '<div class="s">x' + esc(r.cantidad) + ' · ' + money(Number(r.precio_unitario || 0) * Number(r.cantidad || 1)) + (r.proveedor ? ' · ' + esc(r.proveedor) : '') + '</div></div>' +
    '<div class="row-meta"><select class="est-rep" data-id="' + esc(r.id) + '">' + optList(ESTADOS_REP_LIST, r.estado_pedido, '') + '</select>' +
    '<button class="btn danger sm" data-act="del-rep" data-id="' + esc(r.id) + '">Quitar</button></div>' +
    (extra || '') + '</div>';
}

function vCompras(qs) {
  setTitle('Compras / Repuestos');
  setNew('<a class="btn primary sm" href="#/repuesto-form">+ Nuevo</a>');
  var filtro = qs.get('est') || '';
  var reps = Store.coll('repuestos').slice().sort(function (a, b) { return String(a.id).localeCompare(String(b.id), undefined, { numeric: true }); });
  if (filtro) reps = reps.filter(function (r) { return r.estado_pedido === filtro; });
  var pend = reps.filter(function (r) { return r.estado_pedido !== 'Cambiado'; });
  var hechos = reps.filter(function (r) { return r.estado_pedido === 'Cambiado'; });
  var chips = '<div class="chips"><a class="chip' + (!filtro ? ' on' : '') + '" href="#/compras">Todas</a>';
  ESTADOS_REP_LIST.forEach(function (s) {
    chips += '<a class="chip' + (filtro === s ? ' on' : '') + '" href="#/compras?est=' + encodeURIComponent(s) + '">' + esc(s) + '</a>';
  });
  chips += '</div>';
  var html = chips;
  html += '<h2 class="sec">Pendientes (' + pend.length + ')</h2>';
  if (!pend.length) html += '<div class="empty sm"><p>Nada por comprar ni recibir.</p></div>';
  pend.forEach(function (r) { html += repRow(r); });
  html += '<h2 class="sec">Ya cambiados (' + hechos.length + ')</h2>';
  if (!hechos.length) html += '<div class="empty sm"><p>Aún no hay repuestos cambiados.</p></div>';
  hechos.forEach(function (r) { html += repRow(r); });
  $('#view').innerHTML = html;
}

function vRepuestoForm(qs) {
  var r = qs.get('edit') ? Store.get('repuestos', qs.get('edit')) : null;
  setTitle(r ? 'Editar repuesto' : 'Nuevo repuesto');
  setNew(null);
  var v = function (k) { return r ? r[k] : ''; };
  var defTarea = qs.get('tarea') || (r ? r.id_tarea : '');
  var defEqu = qs.get('equipo') || (r ? r.id_equipo : '');
  var tareaObj = defTarea ? Store.get('tareas', defTarea) : null;
  var defEmp = tareaObj ? tareaObj.id_empresa : '';
  var back = (defTarea ? '#/tarea/' + esc(defTarea) : '#/compras');
  $('#view').innerHTML =
    '<div class="stack">' + '<a class="btn ghost sm" href="' + back + '">← Volver</a>' +
    '<form class="card pad" data-f="rep" data-id="' + (r ? esc(r.id) : '') + '">' +
    '<input type="hidden" name="id_empresa_h" value="' + esc(defEmp) + '">' +
    fieldSel('Tarea (opcional)', 'id_tarea_sel', '<option value="">— Compra independiente —</option>' + Store.coll('tareas').map(function (t) {
      return '<option value="' + esc(t.id) + '"' + (String(defTarea) === String(t.id) ? ' selected' : '') + '>' + esc(empName(t.id_empresa)) + ' — ' + esc(t.descripcion_trabajo || 'T-' + t.id) + '</option>';
    }).join('')) +
    field('Pieza / descripción', 'descripcion_pieza', v('descripcion_pieza'), 'text', 'Ej: Fuente de poder 500W', true) +
    '<div class="row2">' +
    field('Referencia', 'referencia', v('referencia')) +
    field('Cantidad', 'cantidad', v('cantidad') || 1, 'number') +
    '</div>' +
    '<div class="row2">' +
    field('Precio unitario', 'precio_unitario', v('precio_unitario'), 'number') +
    field('Proveedor', 'proveedor', v('proveedor')) +
    '</div>' +
    fieldSel('Estado', 'estado_pedido', optList(ESTADOS_REP_LIST, v('estado_pedido') || 'Por comprar', '')) +
    '<div class="row2">' +
    field('Fecha de pedido', 'fecha_pedido', v('fecha_pedido'), 'date') +
    field('Fecha de llegada', 'fecha_llegada', v('fecha_llegada'), 'date') +
    '</div>' +
    fieldArea('Notas', 'notas_repuesto', v('notas_repuesto')) +
    '<button class="btn primary block" type="submit">Guardar repuesto</button>' +
    '</form></div>';

  var sTar = $('select[name=id_tarea_sel]');
  sTar.addEventListener('change', function () {
    // Actualizar campo oculto sin recargar (preserva los datos ya escritos)
    var _t = sTar.value ? Store.get('tareas', sTar.value) : null;
    var hid = $('input[name=id_empresa_h]');
    if (hid) hid.value = _t ? _t.id_empresa : '';
  });
}

function saveRepuesto(form) {
  var d = readForm(form);
  d.id_tarea = d.id_tarea_sel; delete d.id_tarea_sel;
  delete d.id_empresa_h;
  var t = d.id_tarea ? Store.get('tareas', d.id_tarea) : null;
  d.id_equipo = d.id_equipo || (t ? t.id_equipo : '');
  if (!d.descripcion_pieza.trim()) { toast('Escribe la pieza'); return; }
  d.cantidad = Number(d.cantidad || 1);
  d.precio_unitario = Number(d.precio_unitario || 0);
  var id = form.dataset.id;
  if (id) { Store.upd('repuestos', id, d); toast('Repuesto actualizado'); }
  else { var row = Store.add('repuestos', d); id = row.id; toast('Repuesto guardado'); }
  location.hash = d.id_tarea ? '#/tarea/' + d.id_tarea : '#/compras';
}

/* =========================================================
   INFORMES DE SERVICIO
   ========================================================= */
function vInformes() {
  setTitle('Informes');
  setNew('<a class="btn primary sm" href="#/informe-form">+ Nuevo</a>');
  var db = Store.db;
  var list = db.informes.slice().sort(function (a, b) { return (b.fecha_emision || '').localeCompare(a.fecha_emision || ''); });
  var html = '';
  if (!list.length) html += '<div class="empty"><p>Aún no hay informes emitidos.</p><a class="btn primary" href="#/informe-form">Crear informe por empresa y fecha</a></div>';
  list.forEach(function (x) {
    var fServ = x.fecha_servicio ? fmtDate(x.fecha_servicio) : fmtDate((x.fecha_emision || '').slice(0, 10));
    var confBadge = x.conformidad === 'No conforme'
      ? '<span class="badge danger">⚠️ No conforme</span>'
      : '<span class="badge ok">✅ Conforme</span>';
    html += '<a class="card row" href="#/informe/' + esc(x.id) + '">' +
      '<div class="row-main"><div class="t">Informe ' + esc(x.codigo) + ' · ' + esc((x.empresa || {}).razon_social || '') + '</div>' +
      '<div class="s">Jornada: <b>' + esc(fServ) + '</b> · Emitido: ' + fmtDT(x.fecha_emision) + '</div>' +
      '<div class="s">Responsable: ' + esc(x.nombre_responsable || 'sin firma') + '</div></div>' +
      '<div class="row-meta" style="display:flex; flex-direction:column; gap:4px; align-items:flex-end;">' +
      confBadge +
      (x.firma_responsable ? '<span class="badge ok">Firmado</span>' : '<span class="badge warn">Sin firma</span>') +
      '</div></a>';
  });
  $('#view').innerHTML = html;
}

function initPad(id) {
  var cv = document.getElementById(id);
  if (!cv) return null;
  var drawing = false;
  cv._drawn = false;
  var ctx = cv.getContext('2d');

  function getPoint(ev) {
    var r = cv.getBoundingClientRect();
    var clientX = ev.clientX;
    var clientY = ev.clientY;
    if (ev.touches && ev.touches.length > 0) {
      clientX = ev.touches[0].clientX;
      clientY = ev.touches[0].clientY;
    } else if (ev.changedTouches && ev.changedTouches.length > 0) {
      clientX = ev.changedTouches[0].clientX;
      clientY = ev.changedTouches[0].clientY;
    }
    // Escalar al tamaño interno del canvas
    var scaleX = cv.width / (r.width || 1);
    var scaleY = cv.height / (r.height || 1);
    return {
      x: (clientX - r.left) * scaleX,
      y: (clientY - r.top) * scaleY
    };
  }

  function setupCanvas() {
    var rect = cv.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var w = Math.round(rect.width || cv.clientWidth || 400);
    var h = Math.round(rect.height || cv.clientHeight || 150);

    cv.width = w * dpr;
    cv.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  setupCanvas();

  function onStart(ev) {
    if (ev.cancelable) ev.preventDefault();
    drawing = true;
    cv._drawn = true;
    try {
      if (ev.pointerId !== undefined && cv.setPointerCapture) {
        cv.setPointerCapture(ev.pointerId);
      }
    } catch (e) {}
    var p = getPoint(ev);
    // Ajustar por dpr inverso porque ctx.scale ya está aplicado
    var dpr = window.devicePixelRatio || 1;
    ctx.beginPath();
    ctx.moveTo(p.x / dpr, p.y / dpr);
  }

  function onMove(ev) {
    if (!drawing) return;
    if (ev.cancelable) ev.preventDefault();
    var p = getPoint(ev);
    var dpr = window.devicePixelRatio || 1;
    ctx.lineTo(p.x / dpr, p.y / dpr);
    ctx.stroke();
  }

  function onEnd(ev) {
    if (!drawing) return;
    drawing = false;
    try {
      if (ev && ev.pointerId !== undefined && cv.releasePointerCapture) {
        cv.releasePointerCapture(ev.pointerId);
      }
    } catch (e) {}
  }

  // Pointer events
  cv.addEventListener('pointerdown', onStart, { passive: false });
  cv.addEventListener('pointermove', onMove, { passive: false });
  cv.addEventListener('pointerup', onEnd);
  cv.addEventListener('pointercancel', onEnd);
  cv.addEventListener('pointerleave', onEnd);

  // Fallback touch events para navegadores móviles estrictos
  cv.addEventListener('touchstart', onStart, { passive: false });
  cv.addEventListener('touchmove', onMove, { passive: false });
  cv.addEventListener('touchend', onEnd);
  cv.addEventListener('touchcancel', onEnd);

  return {
    clear: function () {
      cv._drawn = false;
      setupCanvas();
    },
    isDrawn: function () {
      return !!cv._drawn;
    },
    fromDataURL: function (dataUrl) {
      if (!dataUrl) return;
      var img = new Image();
      img.onload = function () {
        var rect = cv.getBoundingClientRect();
        var w = Math.round(rect.width || cv.clientWidth || 400);
        var h = Math.round(rect.height || cv.clientHeight || 150);
        ctx.drawImage(img, 0, 0, w, h);
        cv._drawn = true;
      };
      img.src = dataUrl;
    },
    dataURL: function () {
      return cv._drawn ? cv.toDataURL('image/png') : '';
    }
  };
}

function vInformeForm(qs) {
  var editId = qs.get('edit');
  var infExistente = editId ? Store.get('informes', editId) : null;
  var tid = qs.get('tarea');
  var empId = qs.get('empresa') || (infExistente ? infExistente.id_empresa : null);
  var fechaServicio = qs.get('fecha') || (infExistente ? infExistente.fecha_servicio : Store.today());
  var db = Store.db;
  var t = tid ? Store.get('tareas', tid) : null;
  if (t) {
    empId = t.id_empresa;
    fechaServicio = t.fecha_trabajo || t.fecha_programada || t.fecha_creacion || fechaServicio;
  }

  // PASO 1: Si no hay empresa ni edición, mostrar selector de empresa únicamente
  if (!empId && !infExistente) {
    setTitle('Nuevo informe');
    setNew(null);
    var empList = Store.coll('empresas').filter(function (e) { return e.activo !== 'No'; });
    var html1 = '<div class="stack">' + cardBack('#/informes') +
      '<div class="card pad">' +
      '<h2 class="sec">Crear informe — Paso 1</h2>' +
      '<p class="hint">Selecciona la empresa para ver las jornadas de servicio y su estado de informe.</p>' +
      '</div>';
    if (!empList.length) {
      html1 += '<div class="empty"><p>No hay empresas registradas.</p><a class="btn primary" href="#/empresa-form">Registrar empresa</a></div>';
    }
    empList.forEach(function (e) {
      var tars = db.tareas.filter(function (t) { return String(t.id_empresa) === String(e.id); });
      var infs = db.informes.filter(function (x) { return String(x.id_empresa) === String(e.id); });
      var pendFechas = Store.getTareasPorFecha(e.id).filter(function (g) {
        return !infs.some(function (x) { return x.fecha_servicio === g.fecha; });
      }).length;
      html1 += '<a class="card row" href="#/informe-form?empresa=' + esc(e.id) + '">' +
        '<div class="row-main">' +
        '<div class="t">' + esc(e.razon_social) + '</div>' +
        '<div class="s">RUC ' + esc(e.ruc || '—') + (e.rubro ? ' · ' + esc(e.rubro) : '') + '</div>' +
        '</div>' +
        '<div class="row-meta" style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;">' +
        '<span class="cnt">' + pl(tars.length, 'jornada', 'jornadas') + '</span>' +
        (pendFechas ? '<span class="badge warn">' + pendFechas + ' sin informe</span>' : '<span class="badge ok">Al día</span>') +
        '</div></a>';
    });
    html1 += '</div>';
    $('#view').innerHTML = html1;
    return;
  }

  var emp = Store.get('empresas', empId);
  if (!emp) { toast('Empresa no encontrada'); location.hash = '#/informes'; return; }

  // PASO 2: Si hay empresa pero no fecha y no es edición, mostrar lista de jornadas con estado de informe
  if (!qs.get('fecha') && !tid && !infExistente) {
    setTitle('Jornadas — ' + emp.razon_social);
    setNew(null);
    var dayGroups = Store.getTareasPorFecha(empId);
    var infsEmp = db.informes.filter(function (x) { return String(x.id_empresa) === String(empId); });

    var html2 = '<div class="stack">' + cardBack('#/informe-form') +
      '<div class="card pad">' +
      '<div class="kv"><span>Empresa</span><b>' + esc(emp.razon_social) + '</b></div>' +
      '<div class="kv"><span>RUC</span><b>' + esc(emp.ruc || '—') + '</b></div>' +
      '</div>' +
      '<div class="card pad">' +
      '<h2 class="sec">Paso 2 — Selecciona la jornada</h2>' +
      '<p class="hint">Jornadas de servicio registradas. Las que ya tienen informe emitido están marcadas en verde.</p>' +
      '</div>';

    if (!dayGroups.length) {
      html2 += '<div class="empty"><p>No hay tareas/jornadas registradas para esta empresa.</p>' +
        '<a class="btn secondary" href="#/tarea-form?empresa=' + esc(empId) + '">+ Registrar tarea</a></div>';
    }

    dayGroups.forEach(function (group) {
      var infJornada = infsEmp.find(function (x) { return x.fecha_servicio === group.fecha; });
      var dFmt = dayLabel(group.fecha);
      var tasksPend = group.tareas.filter(function (t) { return t.estado !== 'Completada' && t.estado !== 'Cancelada'; }).length;

      if (infJornada) {
        // Jornada ya tiene informe
        html2 += '<div class="day-card" style="border-left:4px solid #059669;">' +
          '<div class="day-head">' +
          '<div class="day-title">📅 ' + esc(dFmt) + ' <span class="day-badge">' + pl(group.tareas.length, 'tarea', 'tareas') + '</span></div>' +
          '<div class="day-actions">' +
          '<span class="badge ok">✅ ' + esc(infJornada.codigo) + '</span>' +
          '<a class="btn ghost sm" style="font-size:11px;padding:3px 8px;" href="#/informe/' + esc(infJornada.id) + '">Ver</a>' +
          '<a class="btn secondary sm" style="font-size:11px;padding:3px 8px;" href="#/informe-form?edit=' + esc(infJornada.id) + '">✏️ Editar</a>' +
          '</div></div>';
      } else {
        // Jornada pendiente de informe
        html2 += '<div class="day-card" style="border-left:4px solid #D97706;">' +
          '<div class="day-head">' +
          '<div class="day-title">📅 ' + esc(dFmt) + ' <span class="day-badge">' + pl(group.tareas.length, 'tarea', 'tareas') + '</span></div>' +
          '<div class="day-actions">' +
          (tasksPend > 0 ? '<span class="badge warn">' + tasksPend + ' pendientes</span>' : '') +
          '<a class="btn secondary sm" style="font-size:11.5px;padding:4px 10px;" href="#/informe-form?empresa=' + esc(empId) + '&fecha=' + esc(group.fecha) + '">📝 Crear informe</a>' +
          '</div></div>';
      }

      // Mostrar tareas de la jornada
      html2 += '<div class="day-items">';
      group.tareas.forEach(function (t, tIdx) {
        var eq = t.id_equipo ? Store.get('equipos', t.id_equipo) : null;
        html2 += '<div class="card row" style="pointer-events:none;opacity:.85;">' +
          '<span class="item-num">#' + (tIdx + 1) + '</span>' +
          '<div class="row-main">' +
          '<div class="t">' + esc(t.descripcion_trabajo || 'Sin descripción') + '</div>' +
          '<div class="s">' + (eq ? esc(eqLabel(eq)) + ' · ' : '') + '<span class="badge ' + (EST_TAREA[t.estado] || 'mute') + '">' + esc(t.estado) + '</span></div>' +
          '</div></div>';
      });
      html2 += '</div></div>';
    });

    html2 += '</div>';
    $('#view').innerHTML = html2;
    return;
  }

  setTitle(infExistente ? ('Editar ' + infExistente.codigo) : ('Informe: ' + emp.razon_social));
  setNew(null);

  // Obtener todas las tareas de esta empresa correspondientes a esta fecha (o la tarea puntual si viene por tid o por informe existente)
  var taskIdsFromInf = (infExistente && infExistente.task_ids) ? infExistente.task_ids : [];
  var dayTasks = db.tareas.filter(function (x) {
    if (String(x.id_empresa) !== String(empId)) return false;
    if (infExistente && taskIdsFromInf.indexOf(x.id) >= 0) return true;
    if (tid && String(x.id) === String(tid)) return true;
    var xf = x.fecha_trabajo || x.fecha_programada || x.fecha_creacion || '';
    return xf === fechaServicio;
  });

  // Consolidar novedad, trabajo y solución de las tareas del día si no están en la tarea puntual
  var defaultNovedad = infExistente ? (infExistente.novedad || '') : '';
  var defaultTrabajo = infExistente ? (infExistente.trabajo_realizado || '') : '';
  var defaultSolucion = infExistente ? (infExistente.solucion || '') : '';
  var defaultRecom = infExistente ? (infExistente.recomendaciones || '') : '';
  var taskIds = [];
  var taskDescList = [];

  dayTasks.forEach(function (tk, idx) {
    taskIds.push(tk.id);
    var prefix = dayTasks.length > 1 ? '(' + (idx + 1) + ') ' : '';
    if (tk.descripcion_trabajo) taskDescList.push(prefix + tk.descripcion_trabajo);
    if (!infExistente) {
      var motivo = tk.novedad || tk.descripcion_trabajo;
      if (motivo) defaultNovedad += (defaultNovedad ? '\n' : '') + prefix + motivo;
      if (tk.trabajo_realizado) defaultTrabajo += (defaultTrabajo ? '\n' : '') + prefix + tk.trabajo_realizado;
      if (tk.solucion) defaultSolucion += (defaultSolucion ? '\n' : '') + prefix + tk.solucion;
      if (tk.recomendaciones) defaultRecom += (defaultRecom ? '\n' : '') + prefix + tk.recomendaciones;
    }
  });

  if (!infExistente && !defaultTrabajo && taskDescList.length) {
    defaultTrabajo = taskDescList.join('\n');
  }

  // Repuestos cambiados en las tareas de este día o en el informe
  var changed = [];
  if (infExistente && infExistente.repuestos && infExistente.repuestos.length) {
    changed = infExistente.repuestos.map(function (r) {
      return { descripcion_pieza: r.pieza, cantidad: r.cantidad, precio_unitario: r.precio };
    });
  } else {
    changed = db.repuestos.filter(function (r) {
      return taskIds.indexOf(r.id_tarea) >= 0 && r.estado_pedido === 'Cambiado';
    });
  }

  var eq = (t && t.id_equipo) ? Store.get('equipos', t.id_equipo) : null;
  if (!eq && infExistente && infExistente.equipo) {
    eq = {
      tipo_equipo: infExistente.equipo.tipo,
      marca: infExistente.equipo.marca,
      modelo: infExistente.equipo.modelo,
      nro_serie: infExistente.equipo.serie,
      ubicacion: infExistente.equipo.ubicacion
    };
  }

  var backUrl = infExistente ? ('#/informe/' + esc(infExistente.id)) : (tid ? '#/tarea/' + esc(tid) : '#/empresa/' + esc(empId));

  var isConforme = infExistente ? (infExistente.conformidad !== 'No conforme') : true;

  var html = '<div class="stack">' + cardBack(backUrl) +
    '<div class="card pad">' +
    '<div class="line"><span class="big">' + (infExistente ? ('Editar Informe ' + esc(infExistente.codigo)) : 'Informe de servicio técnico') + '</span></div>' +
    '<div class="kv"><span>Empresa</span><b>' + esc(emp.razon_social) + ' · RUC ' + esc(emp.ruc || '—') + '</b></div>' +
    '<div class="kv"><span>Fecha de atención</span><b>📅 ' + esc(dayLabel(fechaServicio)) + '</b></div>' +
    (eq ? '<div class="kv"><span>Equipo</span><b>' + esc(eqLabel(eq)) + ' · Serie ' + esc(eq.nro_serie || '—') + '</b></div>' : '') +
    '<div class="kv"><span>Labores del día (' + taskIds.length + ')</span><b>' + esc(taskDescList.join(' | ') || 'Servicio general') + '</b></div>' +
    '</div>' +
    '<form class="card pad" data-f="inf" data-id="' + (infExistente ? esc(infExistente.id) : '') + '" data-empresa="' + esc(empId) + '" data-fecha="' + esc(fechaServicio) + '" data-tasks="' + esc(taskIds.join(',')) + '">' +
    '<h2 class="sec">Contenido del informe</h2>' +
    fieldArea('1. Novedad: lo que se encontró', 'novedad', defaultNovedad, 'Diagnóstico en el sitio') +
    fieldArea('2. Trabajo realizado', 'trabajo_realizado', defaultTrabajo, 'Qué acciones se ejecutaron') +
    fieldArea('3. Solución / estado final', 'solucion', defaultSolucion, 'Equipo operativo, entrega conforme…') +
    fieldArea('4. Conclusiones y recomendaciones del técnico', 'recomendaciones', defaultRecom, 'Próximo mantenimiento, sugerencias de uso, precauciones…') +
    '<h2 class="sec">Repuestos utilizados</h2>';
  if (!changed.length) html += '<p class="hint">Sin repuestos cambiados en esta jornada.</p>';
  changed.forEach(function (r) {
    html += '<div class="kv"><span>' + esc(r.descripcion_pieza) + '</span><b>x' + esc(r.cantidad) + ' · ' + money(r.precio_unitario) + '</b></div>';
  });
  html += '<h2 class="sec">Conformidad del servicio</h2>' +
    '<p class="hint">Indica el resultado y satisfacción del cliente al recibir el equipo o servicio:</p>' +
    '<div class="conformidad-selector">' +
    '<label class="conf-opt"><input type="radio" name="conformidad" value="Conforme"' + (isConforme ? ' checked' : '') + '> <span>✅ Conforme (Servicio recibido a satisfacción)</span></label>' +
    '<label class="conf-opt opt-no"><input type="radio" name="conformidad" value="No conforme"' + (!isConforme ? ' checked' : '') + '> <span>⚠️ No conforme (Observaciones pendientes)</span></label>' +
    '</div>' +
    fieldArea('Observaciones de conformidad (opcional)', 'observaciones_conformidad', infExistente ? (infExistente.observaciones_conformidad || '') : '', 'Si es no conforme o requiere aclaración adicional') +
    '<h2 class="sec">Datos del responsable y firmas</h2>' +
    '<div class="row2">' +
    field('Nombre del responsable *', 'nombre_responsable', infExistente ? (infExistente.nombre_responsable || '') : (emp.persona_contacto || ''), 'text', 'Quien confirma en el cliente') +
    field('Cargo', 'cargo_responsable', infExistente ? (infExistente.cargo_responsable || '') : (emp.cargo_contacto || ''), 'text', 'Ej: Administrador') +
    '</div>' +
    '<div class="fld"><span>Firma del responsable (cliente) *</span>' +
    '<canvas id="padResp" class="sig"></canvas>' +
    '<button type="button" class="btn ghost sm" data-act="pad-clear" data-pad="padResp">Limpiar firma</button></div>' +
    '<div class="fld"><span>Firma del técnico</span>' +
    '<canvas id="padTec" class="sig"></canvas>' +
    '<button type="button" class="btn ghost sm" data-act="pad-clear" data-pad="padTec">Limpiar firma</button></div>' +
    '<button class="btn primary block" type="submit">' + (infExistente ? 'Actualizar informe' : 'Guardar informe y cerrar jornada') + '</button>' +
    '<p class="hint">' + (infExistente ? 'Los cambios se actualizarán manteniendo el código del informe.' : 'Al guardar, las tareas de esta fecha pasarán a Completadas y el informe quedará archivado.') + '</p>' +
    '</form></div>';
  $('#view').innerHTML = html;
  var padResp = initPad('padResp');
  var padTec = initPad('padTec');
  window._pads = { resp: padResp, tec: padTec };

  // Si estamos editando, precargar las firmas previas en el canvas
  if (infExistente) {
    if (infExistente.firma_responsable && padResp) padResp.fromDataURL(infExistente.firma_responsable);
    if (infExistente.firma_tecnico && padTec) padTec.fromDataURL(infExistente.firma_tecnico);
  }
}

function saveInforme(form) {
  var infId = form.dataset.id;
  var empId = form.dataset.empresa;
  var fechaServicio = form.dataset.fecha || Store.today();
  var taskIdsStr = form.dataset.tasks || '';
  var taskIds = taskIdsStr ? taskIdsStr.split(',').filter(Boolean) : [];

  var emp = Store.get('empresas', empId);
  if (!emp) { toast('Empresa no encontrada'); return; }

  var existingInf = infId ? Store.get('informes', infId) : null;
  var d = readForm(form);
  var pads = window._pads || {};
  if (!d.nombre_responsable.trim()) { toast('Escribe el nombre del responsable'); return; }

  var sigR = pads.resp ? pads.resp.dataURL() : '';
  if (!sigR && existingInf && existingInf.firma_responsable) {
    sigR = existingInf.firma_responsable;
  }
  if (!sigR) { toast('El responsable debe firmar con el dedo'); return; }

  var sigT = pads.tec ? pads.tec.dataURL() : '';
  if (!sigT && existingInf && existingInf.firma_tecnico) {
    sigT = existingInf.firma_tecnico;
  }

  // Repuestos cambiados en las tareas involucradas
  var changed = Store.coll('repuestos').filter(function (r) {
    return taskIds.indexOf(String(r.id_tarea)) >= 0 && r.estado_pedido === 'Cambiado';
  });
  if (!changed.length && existingInf && existingInf.repuestos && existingInf.repuestos.length) {
    changed = existingInf.repuestos.map(function (r) {
      return { descripcion_pieza: r.pieza, cantidad: r.cantidad, precio_unitario: r.precio };
    });
  }

  var primerTarea = taskIds.length ? Store.get('tareas', taskIds[0]) : null;
  var eq = (primerTarea && primerTarea.id_equipo) ? Store.get('equipos', primerTarea.id_equipo) : null;
  if (!eq && existingInf && existingInf.equipo) {
    eq = {
      tipo_equipo: existingInf.equipo.tipo,
      marca: existingInf.equipo.marca,
      modelo: existingInf.equipo.modelo,
      nro_serie: existingInf.equipo.serie,
      ubicacion: existingInf.equipo.ubicacion,
      usuario: existingInf.equipo.usuario,
      ubicacion_empresa: existingInf.equipo.ubicacion_empresa
    };
  }

  var repuestosData = changed.map(function (r) {
    return { pieza: r.descripcion_pieza, cantidad: r.cantidad, precio: r.precio_unitario };
  });

  if (infId && existingInf) {
    // MODO ACTUALIZACIÓN
    existingInf.novedad = d.novedad;
    existingInf.trabajo_realizado = d.trabajo_realizado;
    existingInf.solucion = d.solucion;
    existingInf.recomendaciones = d.recomendaciones || '';
    existingInf.conformidad = d.conformidad || 'Conforme';
    existingInf.observaciones_conformidad = d.observaciones_conformidad || '';
    existingInf.nombre_responsable = d.nombre_responsable;
    existingInf.cargo_responsable = d.cargo_responsable;
    if (sigR) existingInf.firma_responsable = sigR;
    if (sigT) existingInf.firma_tecnico = sigT;
    existingInf.fecha_modificacion = Store.nowLocal();

    Store.upd('informes', infId, existingInf);
    toast('Informe ' + existingInf.codigo + ' actualizado');
    location.hash = '#/informe/' + infId;
    return;
  }

  // MODO CREACIÓN NUEVA
  var row = {
    codigo: Store.nextInfCode(),
    id_empresa: empId,
    fecha_servicio: fechaServicio,
    task_ids: taskIds,
    id_tarea: taskIds[0] || '',
    fecha_emision: Store.nowLocal(),
    tecnico: (primerTarea && primerTarea.tecnico_responsable) || Store.db.meta.tecnico || '',
    empresa: { razon_social: emp.razon_social, ruc: emp.ruc, direccion: emp.direccion, contacto: emp.persona_contacto },
    equipo: eq ? { tipo: eq.tipo_equipo, marca: eq.marca, modelo: eq.modelo, serie: eq.nro_serie, ubicacion: eq.ubicacion, usuario: eq.usuario, ubicacion_empresa: eq.ubicacion_empresa } : null,
    novedad: d.novedad,
    trabajo_realizado: d.trabajo_realizado,
    solucion: d.solucion,
    recomendaciones: d.recomendaciones || '',
    repuestos: repuestosData,
    conformidad: d.conformidad || 'Conforme',
    observaciones_conformidad: d.observaciones_conformidad || '',
    nombre_responsable: d.nombre_responsable,
    cargo_responsable: d.cargo_responsable,
    firma_responsable: sigR,
    firma_tecnico: sigT,
    enviado_a: '',
    fecha_envio: ''
  };

  var nuevo = Store.add('informes', row);

  // Marcar todas las tareas de la jornada como completadas
  taskIds.forEach(function (tid) {
    Store.upd('tareas', tid, {
      estado: 'Completada',
      informe_emitido: true,
      fecha_fin: Store.nowLocal()
    });
  });

  toast('Informe ' + row.codigo + ' guardado');
  location.hash = '#/informe/' + nuevo.id;
}

function informeText(x) {
  var e = x.empresa || {};
  var eq = x.equipo;
  var L = [];
  L.push('INFORME DE SERVICIO TECNICO ' + (x.codigo || ''));
  if (x.fecha_servicio) L.push('Fecha de atencion / jornada: ' + fmtDate(x.fecha_servicio));
  L.push('Fecha de emision: ' + fmtDT(x.fecha_emision));
  L.push('');
  L.push('EMPRESA');
  L.push(e.razon_social || '');
  if (e.ruc) L.push('RUC: ' + e.ruc);
  if (e.direccion) L.push(e.direccion);
  L.push('');
  if (eq) {
    L.push('EQUIPO: ' + [eq.tipo, eq.marca, eq.modelo].filter(Boolean).join(' '));
    if (eq.serie) L.push('Serie: ' + eq.serie);
    if (eq.usuario) L.push('Usuario: ' + eq.usuario);
    if (eq.ubicacion_empresa) L.push('Sede: ' + eq.ubicacion_empresa);
    if (eq.ubicacion) L.push('Ubicacion: ' + eq.ubicacion);
    L.push('');
  }
  if (x.novedad) { L.push('LO QUE SE ENCONTRO'); L.push(x.novedad); L.push(''); }
  if (x.trabajo_realizado) { L.push('LO QUE SE HIZO'); L.push(x.trabajo_realizado); L.push(''); }
  if (x.repuestos && x.repuestos.length) {
    L.push('REPUESTOS'); x.repuestos.forEach(function (r) { L.push('- ' + r.pieza + ' x' + r.cantidad + ' (' + money(r.precio) + ')'); }); L.push('');
  }
  if (x.solucion) { L.push('SOLUCION / ESTADO FINAL'); L.push(x.solucion); L.push(''); }
  if (x.recomendaciones) { L.push('CONCLUSIONES Y RECOMENDACIONES DEL TECNICO'); L.push(x.recomendaciones); L.push(''); }
  var confText = x.conformidad === 'No conforme' ? '⚠️ NO CONFORME' : '✅ CONFORME';
  L.push('ESTADO DE CONFORMIDAD: ' + confText);
  if (x.observaciones_conformidad) L.push('Observaciones: ' + x.observaciones_conformidad);
  L.push('Conformidad del responsable: ' + (x.nombre_responsable || '') + (x.cargo_responsable ? ' (' + x.cargo_responsable + ')' : ''));
  if (x.tecnico) L.push('Tecnico: ' + x.tecnico);
  return L.join('\n');
}

function generateReportPdf(x, callback) {
  var printArea = document.getElementById('printArea');
  if (!printArea) {
    if (typeof callback === 'function') callback(new Error('No print area found'));
    return;
  }

  // Verificar si jsPDF y html2canvas están disponibles
  var jspdfLib = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;
  if (!window.html2canvas || !jspdfLib) {
    console.warn('Librerías PDF no disponibles en ventana');
    if (typeof callback === 'function') callback(new Error('PDF libraries not loaded'));
    return;
  }

  window.html2canvas(printArea, {
    scale: 2, // Buena resolución
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff'
  }).then(function (canvas) {
    try {
      var imgData = canvas.toDataURL('image/jpeg', 0.95);
      var pdf = new jspdfLib('p', 'mm', 'a4');
      var pdfWidth = pdf.internal.pageSize.getWidth();
      var pdfHeight = pdf.internal.pageSize.getHeight();

      var imgWidth = pdfWidth - 20; // 10mm márgenes
      var imgHeight = (canvas.height * imgWidth) / canvas.width;

      var xPos = 10;
      var yPos = 10;
      var heightLeft = imgHeight;
      var position = 10;

      pdf.addImage(imgData, 'JPEG', xPos, position, imgWidth, imgHeight);
      heightLeft -= (pdfHeight - 20);

      // Si el contenido excede una página A4, añadir páginas subsecuentes
      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 10;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', xPos, position, imgWidth, imgHeight);
        heightLeft -= (pdfHeight - 20);
      }

      if (typeof callback === 'function') callback(null, pdf);
    } catch (err) {
      console.error('Error generando documento PDF:', err);
      if (typeof callback === 'function') callback(err);
    }
  }).catch(function (err) {
    console.error('Error html2canvas:', err);
    if (typeof callback === 'function') callback(err);
  });
}

function vInforme(id) {
  var x = Store.get('informes', id);
  if (!x) { location.hash = '#/informes'; return; }
  setTitle('Informe ' + x.codigo);
  setNew('<a class="btn secondary sm" href="#/informe-form?edit=' + esc(id) + '">✏️ Editar</a>');
  var e = x.empresa || {};
  var eq = x.equipo;
  var fServ = x.fecha_servicio ? dayLabel(x.fecha_servicio) : fmtDate((x.fecha_emision || '').slice(0, 10));
  var isConforme = (x.conformidad !== 'No conforme');

  var totalRepuestos = 0;
  if (x.repuestos && x.repuestos.length) {
    x.repuestos.forEach(function (r) { totalRepuestos += (Number(r.cantidad) || 0) * (Number(r.precio) || 0); });
  }

  var html = '<div class="stack no-print">' + '<a class="btn ghost sm" href="#/informes">← Volver a Informes</a>' +
    '<div class="btnrow">' +
    '<a class="btn secondary sm" href="#/informe-form?edit=' + esc(id) + '">✏️ Editar informe</a>' +
    '<button class="btn primary sm" data-act="wa-share" data-id="' + esc(id) + '">📱 Enviar por WhatsApp (PDF)</button>' +
    '<button class="btn secondary sm" data-act="pdf-dl" data-id="' + esc(id) + '">📥 Descargar PDF</button>' +
    '<button class="btn ghost sm" data-act="print">🖨️ Imprimir</button>' +
    '<button class="btn danger sm" data-act="del-inf" data-id="' + esc(id) + '">Eliminar</button>' +
    '</div></div>';

  html += '<div class="report" id="printArea">' +
    '<div class="rep-head">' +
    '<div>' +
    '<div class="rep-brand"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg> SERVITECH SOPORTE TÉCNICO</div>' +
    '<div class="rep-t">INFORME DE SERVICIO TÉCNICO</div>' +
    '<div class="rep-sub">Jornada de atención: <b>' + esc(fServ) + '</b> · Emisión: ' + fmtDT(x.fecha_emision) + ' · Técnico: ' + esc(x.tecnico || '—') + '</div>' +
    '</div>' +
    '<div style="text-align:right">' +
    '<div class="rep-code">N° ' + esc(x.codigo) + '</div>' +
    '</div>' +
    '</div>' +

    /* Metadatos en cuadrícula */
    '<div class="rep-meta-grid">' +
    '<div class="rep-meta-card">' +
    '<div class="rep-meta-title">Cliente / Empresa</div>' +
    '<div class="rep-meta-val"><b>' + esc(e.razon_social || '—') + '</b>' +
    (e.ruc ? '<br>RUC: ' + esc(e.ruc) : '') +
    (e.direccion ? '<br>' + esc(e.direccion) : '') +
    (e.contacto ? '<br>Contacto: ' + esc(e.contacto) : '') +
    '</div></div>' +
    '<div class="rep-meta-card">' +
    '<div class="rep-meta-title">Atención y Equipo</div>' +
    '<div class="rep-meta-val">' +
    '<b>Fecha:</b> ' + esc(fServ) + '<br>' +
    (eq ? '<b>Equipo:</b> ' + esc([eq.tipo, eq.marca, eq.modelo].filter(Boolean).join(' ')) +
      (eq.serie ? '<br><b>Serie:</b> ' + esc(eq.serie) : '') +
      (eq.usuario ? '<br><b>Usuario:</b> ' + esc(eq.usuario) : '') +
      (eq.ubicacion_empresa ? '<br><b>Sede:</b> ' + esc(eq.ubicacion_empresa) : '') +
      (eq.ubicacion ? '<br><b>Ubicación:</b> ' + esc(eq.ubicacion) : '') : '<b>Atención general en sitio</b>') +
    '</div></div>' +
    '<div class="rep-meta-card">' +
    '<div class="rep-meta-title">Estado de conformidad</div>' +
    '<div class="rep-meta-val">' +
    (isConforme
      ? '<span class="rep-conformidad-badge rep-conf-si">✅ Servicio Conforme</span>'
      : '<span class="rep-conformidad-badge rep-conf-no">⚠️ No Conforme (Con Observación)</span>') +
    (x.observaciones_conformidad ? '<div style="margin-top:6px; font-size:12.5px; color:#556;"><b>Obs:</b> ' + esc(x.observaciones_conformidad) + '</div>' : '') +
    '</div></div>' +
    '</div>' +

    /* Sección 1: Lo que se encontró */
    '<div class="rep-sec-card rep-sec-novedad">' +
    '<div class="rep-sec-header">' +
    '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>' +
    '1. Lo que se encontró (Diagnóstico inicial / Novedad)' +
    '</div>' +
    '<div class="rep-sec-body">' + esc(x.novedad || 'No se registraron anomalías previas.') + '</div>' +
    '</div>' +

    /* Sección 2: Trabajo realizado */
    '<div class="rep-sec-card rep-sec-trabajo">' +
    '<div class="rep-sec-header">' +
    '<svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6-9.6 9.6a1 1 0 0 1-.7.3H4v-2a1 1 0 0 1 .3-.7l9.6-9.6 1.6 1.6a1 1 0 0 0 1.4-1.4l-2.3-2.3a1 1 0 0 0-1.4 0z"/></svg>' +
    '2. Trabajo realizado (Acciones técnicas ejecutadas)' +
    '</div>' +
    '<div class="rep-sec-body">' + esc(x.trabajo_realizado || 'Mantenimiento preventivo / correctivo general.') + '</div>' +
    '</div>';

  /* Sección 3: Repuestos */
  if (x.repuestos && x.repuestos.length) {
    html += '<div class="rep-sec-card rep-sec-repuestos">' +
      '<div class="rep-sec-header">' +
      '<svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>' +
      '3. Repuestos y piezas sustituidas' +
      '</div>' +
      '<div style="padding:10px 14px; overflow-x:auto;">' +
      '<table class="rep-tbl"><thead><tr><th>Descripción de la pieza</th><th style="text-align:center; width:70px;">Cant.</th><th style="text-align:right; width:110px;">P. Unit.</th><th style="text-align:right; width:120px;">Subtotal</th></tr></thead><tbody>';
    x.repuestos.forEach(function (r) {
      var cant = Number(r.cantidad) || 1;
      var pUni = Number(r.precio) || 0;
      var sub = cant * pUni;
      html += '<tr><td><b>' + esc(r.pieza) + '</b></td><td style="text-align:center;">' + esc(cant) + '</td><td style="text-align:right;">' + money(pUni) + '</td><td style="text-align:right;"><b>' + money(sub) + '</b></td></tr>';
    });
    html += '</tbody><tfoot><tr><td colspan="3" style="text-align:right;">Total repuestos:</td><td style="text-align:right;">' + money(totalRepuestos) + '</td></tr></tfoot></table>' +
      '</div></div>';
  }

  /* Sección 4: Solución y estado final del equipo */
  var solNum = (x.repuestos && x.repuestos.length) ? '4' : '3';
  html += '<div class="rep-sec-card rep-sec-solucion">' +
    '<div class="rep-sec-header">' +
    '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' +
    solNum + '. Solución y estado final en que queda el equipo' +
    '</div>' +
    '<div class="rep-sec-body">' + esc(x.solucion || 'Equipo operativo y probado conforme en presencia del cliente.') + '</div>' +
    '</div>';

  /* Sección 5: Conclusiones y recomendaciones del técnico */
  if (x.recomendaciones) {
    var recNum = (Number(solNum) + 1);
    html += '<div class="rep-sec-card rep-sec-recom">' +
      '<div class="rep-sec-header">' +
      '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7zM9 21a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1H9v1z"/></svg>' +
      recNum + '. Conclusiones y recomendaciones del técnico' +
      '</div>' +
      '<div class="rep-sec-body">' + esc(x.recomendaciones) + '</div>' +
      '</div>';
  }

  /* Firmas y conformidad */
  html += '<div class="rep-firmas">' +
    '<div class="firma">' +
    '<div class="firma-box">' + (x.firma_responsable ? '<img src="' + x.firma_responsable + '" alt="Firma">' : '<span>Sin firma</span>') + '</div>' +
    '<div class="firma-nombre">' + esc(x.nombre_responsable || 'Responsable de recepción') + (x.cargo_responsable ? '<br><small>' + esc(x.cargo_responsable) + '</small>' : '') + '</div>' +
    '<div class="firma-rol">Conformidad del cliente: ' + (isConforme ? '<b>CONFORME</b>' : '<b style="color:#B91C1C">NO CONFORME</b>') + '</div>' +
    '</div>' +
    '<div class="firma">' +
    '<div class="firma-box">' + (x.firma_tecnico ? '<img src="' + x.firma_tecnico + '" alt="Firma">' : '<span>Sin firma</span>') + '</div>' +
    '<div class="firma-nombre">' + esc(x.tecnico || 'Técnico asignado') + '</div>' +
    '<div class="firma-rol">Firma del técnico responsable</div>' +
    '</div>' +
    '</div>' +

    (x.enviado_a ? '<div class="rep-foot">Comprobante de envío: enviado vía ' + esc(x.enviado_a) + ' el ' + fmtDT(x.fecha_envio) + '</div>' : '') +
    '</div>';
  $('#view').innerHTML = html;
}

/* =========================================================
   COSTOS (módulo de costos por tarea, fechas y PDF WhatsApp)
   ========================================================= */

function buildCostosPdfHtml(selTasks) {
  var db = Store.db;
  var currSym = db.meta.currency || 'S/ ';
  var total = 0;
  var dates = [];
  var emps = new Set();

  selTasks.forEach(function (t) {
    var c = parseFloat(t.costo) || 0;
    total += c;
    var d = t.fecha_trabajo || t.fecha_creacion;
    if (d) dates.push(d);
    if (t.id_empresa) emps.add(empName(t.id_empresa));
  });

  dates.sort();
  var periodo = 'Todas las fechas';
  if (dates.length === 1) {
    periodo = fmtDate(dates[0]);
  } else if (dates.length > 1) {
    periodo = fmtDate(dates[0]) + ' al ' + fmtDate(dates[dates.length - 1]);
  }

  var empTexto = 'Múltiples clientes / servicios';
  if (emps.size === 1) {
    empTexto = Array.from(emps)[0];
  } else if (emps.size > 1) {
    empTexto = Array.from(emps).join(', ');
  }

  var rowsHtml = '';
  selTasks.forEach(function (t, idx) {
    var cod = 'T-' + String(t.id).padStart(4, '0');
    var emp = empName(t.id_empresa);
    var equ = eqName(t.id_equipo);
    var desc = t.descripcion_trabajo || '(Sin descripción)';
    var fDate = fmtDate(t.fecha_trabajo || t.fecha_creacion);
    var costo = parseFloat(t.costo) || 0;

    rowsHtml += '<tr style="border-bottom: 1px solid #E2EBE8;">' +
      '<td style="padding: 8px 6px; text-align: center; font-size: 11px; color: #526360;">' + (idx + 1) + '</td>' +
      '<td style="padding: 8px; font-weight: 700; font-size: 11px; color: #0F766E;">' + cod + '</td>' +
      '<td style="padding: 8px; font-size: 11px; color: #526360; white-space: nowrap;">' + esc(fDate) + '</td>' +
      '<td style="padding: 8px; font-size: 11px; font-weight: 600;">' + esc(emp) + (equ ? '<br><small style="color:#7C8A86;">' + esc(equ) + '</small>' : '') + '</td>' +
      '<td style="padding: 8px; font-size: 11px; color: #223330;">' + esc(desc) + '</td>' +
      '<td style="padding: 8px; text-align: center; font-size: 11px;">' + badge(t.estado, EST_TAREA) + '</td>' +
      '<td style="padding: 8px; text-align: right; font-weight: 700; font-size: 11.5px; color: #14201E;">' + money(costo) + '</td>' +
      '</tr>';
  });

  var docNum = 'LC-' + Store.today().replace(/-/g, '') + '-' + String(selTasks.length).padStart(2, '0');

  return '<div class="costos-pdf-doc" style="background:#fff; padding:24px; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; color:#14201E; border:1px solid #E1EBE8; border-radius:16px;">' +
    '<div class="rep-head" style="border-bottom: 2px solid #0F766E; padding-bottom: 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start;">' +
      '<div>' +
        '<div class="rep-brand" style="display:flex; align-items:center; gap:8px; font-weight:800; font-size:16px; color:#0F766E;">' +
          '<svg viewBox="0 0 24 24" style="width:22px; height:22px; fill:#0F766E;"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>' +
          'SERVITECH' +
        '</div>' +
        '<div class="rep-t" style="font-size:20px; font-weight:800; color:#0F766E; margin-top:4px;">LIQUIDACIÓN DE COSTOS DE SERVICIOS</div>' +
        '<div class="rep-sub" style="font-size:12px; color:#526360;">Resumen valorizado de tareas y servicios técnicos realizados</div>' +
      '</div>' +
      '<div style="text-align:right;">' +
        '<div style="display:inline-block; background:#E6F6F4; color:#0F766E; font-weight:800; font-size:12px; padding:4px 10px; border-radius:8px; border:1px solid rgba(15, 118, 110, .2);">' + docNum + '</div>' +
        '<div style="font-size:11.5px; color:#526360; margin-top:6px;">Emisión: <b>' + fmtDate(Store.today()) + '</b></div>' +
      '</div>' +
    '</div>' +

    '<div class="rep-meta-grid" style="display:grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap:10px; margin-bottom:18px;">' +
      '<div style="background:#F8FBFA; border:1px solid #E1EBE8; border-radius:10px; padding:10px;">' +
        '<div style="font-size:10px; font-weight:750; text-transform:uppercase; color:#60726E; margin-bottom:3px;">Cliente / Empresa</div>' +
        '<div style="font-size:12px; font-weight:700; color:#182624;">' + esc(empTexto) + '</div>' +
      '</div>' +
      '<div style="background:#F8FBFA; border:1px solid #E1EBE8; border-radius:10px; padding:10px;">' +
        '<div style="font-size:10px; font-weight:750; text-transform:uppercase; color:#60726E; margin-bottom:3px;">Técnico Responsable</div>' +
        '<div style="font-size:12px; font-weight:700; color:#182624;">' + esc(db.meta.tecnico || 'Servitech') + '</div>' +
      '</div>' +
      '<div style="background:#F8FBFA; border:1px solid #E1EBE8; border-radius:10px; padding:10px;">' +
        '<div style="font-size:10px; font-weight:750; text-transform:uppercase; color:#60726E; margin-bottom:3px;">Período Liquidado</div>' +
        '<div style="font-size:12px; font-weight:700; color:#182624;">' + esc(periodo) + '</div>' +
      '</div>' +
      '<div style="background:#F8FBFA; border:1px solid #E1EBE8; border-radius:10px; padding:10px;">' +
        '<div style="font-size:10px; font-weight:750; text-transform:uppercase; color:#60726E; margin-bottom:3px;">Tareas Incluidas</div>' +
        '<div style="font-size:12px; font-weight:700; color:#182624;">' + selTasks.length + ' servicios</div>' +
      '</div>' +
    '</div>' +

    '<table style="width:100%; border-collapse:collapse; margin-bottom:18px; font-size:12px;">' +
      '<thead>' +
        '<tr style="background:#F1F5F4; border-bottom:2px solid #D5E2DF;">' +
          '<th style="padding:8px 6px; text-align:center; font-size:11px; font-weight:750; color:#475754;">#</th>' +
          '<th style="padding:8px; text-align:left; font-size:11px; font-weight:750; color:#475754;">Código</th>' +
          '<th style="padding:8px; text-align:left; font-size:11px; font-weight:750; color:#475754;">Fecha</th>' +
          '<th style="padding:8px; text-align:left; font-size:11px; font-weight:750; color:#475754;">Cliente / Equipo</th>' +
          '<th style="padding:8px; text-align:left; font-size:11px; font-weight:750; color:#475754;">Descripción del Servicio</th>' +
          '<th style="padding:8px; text-align:center; font-size:11px; font-weight:750; color:#475754;">Estado</th>' +
          '<th style="padding:8px; text-align:right; font-size:11px; font-weight:750; color:#475754;">Costo (' + currSym.trim() + ')</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' + rowsHtml + '</tbody>' +
      '<tfoot>' +
        '<tr style="background:#E6F6F4; border-top:2px solid #0F766E;">' +
          '<td colspan="6" style="padding:12px 10px; text-align:right; font-weight:800; font-size:13.5px; color:#0F766E;">TOTAL GENERAL A LIQUIDAR / COBRAR:</td>' +
          '<td style="padding:12px 10px; text-align:right; font-weight:800; font-size:16px; color:#0F766E;">' + money(total) + '</td>' +
        '</tr>' +
      '</tfoot>' +
    '</table>' +

    '<div style="display:flex; justify-content:space-between; gap:20px; margin-top:26px;">' +
      '<div style="flex:1; text-align:center; border:1px dashed #B8C9C5; border-radius:10px; padding:12px;">' +
        '<div style="height:48px;"></div>' +
        '<div style="border-top:1px solid #7C8A86; padding-top:6px; font-weight:700; font-size:11.5px; color:#14201E;">' + esc(db.meta.tecnico || 'Técnico Especialista') + '</div>' +
        '<div style="font-size:10.5px; color:#60726E;">Firma del Técnico Responsable</div>' +
      '</div>' +
      '<div style="flex:1; text-align:center; border:1px dashed #B8C9C5; border-radius:10px; padding:12px;">' +
        '<div style="height:48px;"></div>' +
        '<div style="border-top:1px solid #7C8A86; padding-top:6px; font-weight:700; font-size:11.5px; color:#14201E;">Conformidad del Cliente</div>' +
        '<div style="font-size:10.5px; color:#60726E;">Firma / Sello de Recepción</div>' +
      '</div>' +
    '</div>' +

    '<div style="margin-top:18px; font-size:10px; text-align:center; color:#7C8A86;">' +
      'Servitech · Documento oficial de liquidación y cobro de servicios técnicos.' +
    '</div>' +
  '</div>';
}

function generateCostosPdf(selTasks, callback) {
  var area = document.getElementById('printCostosArea');
  if (!area) {
    area = document.createElement('div');
    area.id = 'printCostosArea';
    area.style.position = 'absolute';
    area.style.left = '-9999px';
    area.style.top = '0';
    area.style.width = '794px';
    area.style.background = '#ffffff';
    document.body.appendChild(area);
  }

  area.innerHTML = buildCostosPdfHtml(selTasks);

  var jspdfLib = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;
  if (!window.html2canvas || !jspdfLib) {
    if (typeof callback === 'function') callback(new Error('Librerías PDF no disponibles'));
    return;
  }

  window.html2canvas(area, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff'
  }).then(function (canvas) {
    try {
      var imgData = canvas.toDataURL('image/jpeg', 0.95);
      var pdf = new jspdfLib('p', 'mm', 'a4');
      var pdfWidth = pdf.internal.pageSize.getWidth();
      var pdfHeight = pdf.internal.pageSize.getHeight();

      var imgWidth = pdfWidth - 20; // 10mm márgenes
      var imgHeight = (canvas.height * imgWidth) / canvas.width;

      var xPos = 10;
      var yPos = 10;
      var heightLeft = imgHeight;
      var position = 10;

      pdf.addImage(imgData, 'JPEG', xPos, position, imgWidth, imgHeight);
      heightLeft -= (pdfHeight - 20);

      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 10;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', xPos, position, imgWidth, imgHeight);
        heightLeft -= (pdfHeight - 20);
      }

      if (typeof callback === 'function') callback(null, pdf);
    } catch (err) {
      console.error('Error generando documento PDF de costos:', err);
      if (typeof callback === 'function') callback(err);
    }
  }).catch(function (err) {
    console.error('Error html2canvas costos:', err);
    if (typeof callback === 'function') callback(err);
  });
}

function vCostos(qs) {
  setTitle('Costos');
  setNew('<a class="btn primary sm" href="#/tarea-form">+ Nueva tarea</a>');

  var db = Store.db;
  var tareas = (db.tareas || []).slice();

  if (!tareas.length) {
    $('#view').innerHTML = '<div class="stack">' +
      '<div class="card pad" style="text-align:center; padding: 40px 20px;">' +
      '<div style="font-size:42px; margin-bottom: 12px;">💰</div>' +
      '<h2 class="sec" style="margin-bottom:8px;">Sin tareas registradas</h2>' +
      '<p class="hint">Crea tareas primero para asignar costos y calcular totales.</p>' +
      '<div style="margin-top:16px;"><a class="btn primary" href="#/tarea-form">+ Crear primera tarea</a></div>' +
      '</div></div>';
    return;
  }

  // Agrupación por fechas
  var groups = {};
  tareas.forEach(function (t) {
    var f = t.fecha_trabajo || t.fecha_creacion || Store.today();
    if (!groups[f]) groups[f] = [];
    groups[f].push(t);
  });

  var sortedDates = Object.keys(groups).sort(function (a, b) { return b.localeCompare(a); });

  // Map de selección: todos seleccionados por defecto
  var selectedMap = {};
  tareas.forEach(function (t) { selectedMap[String(t.id)] = true; });

  var curEst = qs.get('est') || '';
  var curQ = (qs.get('q') || '').trim().toLowerCase();
  var curD = qs.get('d') || 'todas';
  var curDesde = qs.get('desde') || '';
  var curHasta = qs.get('hasta') || '';

  var currSym = db.meta.currency || 'S/ ';

  // Generar HTML de filtros de fecha y estado
  var dateChips = '<div class="chips" id="costosDateChips">' +
    '<a class="chip' + (curD === 'todas' ? ' on' : '') + '" data-d="todas">Todas las fechas</a>' +
    '<a class="chip' + (curD === 'hoy' ? ' on' : '') + '" data-d="hoy">Hoy</a>' +
    '<a class="chip' + (curD === 'semana' ? ' on' : '') + '" data-d="semana">Últimos 7 días</a>' +
    '<a class="chip' + (curD === 'mes' ? ' on' : '') + '" data-d="mes">Este mes</a>' +
    '<a class="chip' + (curD === 'rango' ? ' on' : '') + '" data-d="rango">📅 Por rango…</a>' +
    '</div>';

  var estChips = '<div class="chips" style="margin-top:4px;">';
  estChips += '<a class="chip' + (!curEst ? ' on' : '') + '" data-est="">Todos los estados (' + tareas.length + ')</a>';
  ESTADOS_TAREA_LIST.forEach(function (s) {
    var count = tareas.filter(function (t) { return t.estado === s; }).length;
    if (count > 0) {
      estChips += '<a class="chip' + (curEst === s ? ' on' : '') + '" data-est="' + esc(s) + '">' + esc(s) + ' (' + count + ')</a>';
    }
  });
  estChips += '</div>';

  var html = '<div class="stack costos-wrap">' +
    '<!-- Tarjeta Resumen y Acciones -->' +
    '<div class="card pad costos-summary-card">' +
      '<div class="costos-summary-head">' +
        '<div>' +
          '<div class="costos-badge-label">TOTAL SELECCIONADO</div>' +
          '<div class="costos-total-val" id="costosTotalSel">' + currSym + '0.00</div>' +
          '<div class="costos-period-pill" id="costosPeriodoSel">Todas las fechas</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
          '<div class="costos-sel-pill" id="costosCountSel">0 tareas</div>' +
          '<div class="costos-total-all" id="costosTotalAll">Total tareas visibles: ' + currSym + '0.00</div>' +
        '</div>' +
      '</div>' +
      '<div class="costos-actions-row">' +
        '<button type="button" class="btn primary sm" id="btnCostosWaPdf">📱 Enviar por WhatsApp (PDF)</button>' +
        '<button type="button" class="btn secondary sm" id="btnCostosDlPdf">📥 Descargar PDF</button>' +
        '<button type="button" class="btn ghost sm" id="btnCostosAll">✓ Todas</button>' +
        '<button type="button" class="btn ghost sm" id="btnCostosNone">✕ Ninguna</button>' +
      '</div>' +
    '</div>' +

    '<!-- Filtros de Fecha y Estado -->' +
    '<div class="card pad" style="padding: 12px 14px; margin-bottom: 4px;">' +
      '<div style="font-size: 11px; font-weight: 750; text-transform: uppercase; color: var(--ink2); margin-bottom: 6px;">Filtrar por Fechas:</div>' +
      dateChips +
      '<div class="costos-date-bar" id="costosDateBar" style="' + (curD === 'rango' ? '' : 'display:none;') + '">' +
        '<label class="costos-date-fld"><span>Desde:</span><input type="date" id="costosDesde" value="' + esc(curDesde) + '"></label>' +
        '<label class="costos-date-fld"><span>Hasta:</span><input type="date" id="costosHasta" value="' + esc(curHasta) + '"></label>' +
        '<button type="button" class="btn secondary sm" id="btnApplyDates">Aplicar</button>' +
        '<button type="button" class="btn ghost sm" id="btnClearDates">Limpiar</button>' +
      '</div>' +
      '<div style="font-size: 11px; font-weight: 750; text-transform: uppercase; color: var(--ink2); margin-top: 10px; margin-bottom: 6px;">Filtrar por Estado:</div>' +
      estChips +
    '</div>' +

    '<!-- Buscador -->' +
    '<div class="search">' +
      '<input id="busCostos" placeholder="Buscar por tarea, empresa o equipo…" value="' + esc(curQ) + '">' +
    '</div>' +

    '<!-- Listado agrupado por Fechas -->' +
    '<div id="costosList" class="costos-list">';

  sortedDates.forEach(function (f) {
    var dayTasks = groups[f];
    var daySub = 0;
    dayTasks.forEach(function (t) { daySub += (parseFloat(t.costo) || 0); });

    html += '<div class="day-card costos-day-group" data-date="' + esc(f) + '">' +
      '<div class="day-head day-head-costos">' +
        '<div class="day-title">' +
          '<span>📅 ' + esc(dayLabel(f)) + '</span>' +
          '<span class="day-badge">' + pl(dayTasks.length, 'tarea', 'tareas') + '</span>' +
        '</div>' +
        '<div class="day-costos-right">' +
          '<span class="day-costos-sub" id="daySub-' + esc(f) + '">Subtotal día: <b>' + money(daySub) + '</b></span>' +
          '<button type="button" class="btn ghost sm btn-sel-day" data-date="' + esc(f) + '" title="Marcar/Desmarcar día">✓ Día</button>' +
          '<button type="button" class="btn ghost sm btn-only-day" data-date="' + esc(f) + '" title="Seleccionar únicamente este día">Solo este día</button>' +
        '</div>' +
      '</div>' +
      '<div class="day-items" style="padding: 8px 10px; display: flex; flex-direction: column; gap: 8px;">';

    dayTasks.forEach(function (t) {
      var cod = 'T-' + String(t.id).padStart(4, '0');
      var emp = empName(t.id_empresa);
      var equ = eqName(t.id_equipo);
      var desc = t.descripcion_trabajo || '(Sin descripción)';
      var searchStr = (cod + ' ' + emp + ' ' + equ + ' ' + desc + ' ' + (t.estado || '')).toLowerCase();
      var valCosto = (t.costo != null && t.costo !== '') ? t.costo : '';

      html += '<div class="card pad costos-item is-selected" data-id="' + esc(t.id) + '" data-date="' + esc(f) + '" data-search="' + esc(searchStr) + '" data-est="' + esc(t.estado || '') + '">' +
        '<div class="costos-item-top">' +
          '<label class="costos-check-wrap">' +
            '<input type="checkbox" class="costos-check" data-id="' + esc(t.id) + '" data-date="' + esc(f) + '" checked>' +
            '<span class="costos-code-pill">' + cod + '</span>' +
          '</label>' +
          '<div class="costos-meta-top">' +
            badge(t.estado, EST_TAREA) +
          '</div>' +
        '</div>' +
        '<div class="costos-item-body">' +
          '<div class="costos-desc"><a href="#/tarea/' + esc(t.id) + '" class="costos-link">' + esc(desc) + '</a></div>' +
          '<div class="costos-sub">' + esc(emp) + (equ ? ' · ' + esc(equ) : '') + '</div>' +
        '</div>' +
        '<div class="costos-item-foot">' +
          '<label class="costos-input-label">' +
            '<span class="costos-lbl-text">Costo de tarea:</span>' +
            '<div class="costos-input-wrap">' +
              '<span class="costos-curr-sym">' + esc(currSym) + '</span>' +
              '<input type="number" step="0.01" min="0" class="costos-input" data-id="' + esc(t.id) + '" data-date="' + esc(f) + '" value="' + esc(valCosto) + '" placeholder="0.00">' +
              '<span class="costos-save-check" id="chk-' + esc(t.id) + '">✓</span>' +
            '</div>' +
          '</label>' +
        '</div>' +
      '</div>';
    });

    html += '</div></div>';
  });

  html += '</div></div>';
  $('#view').innerHTML = html;

  // Lógica de cálculo reactivo
  function recalc() {
    var sumSel = 0;
    var sumVis = 0;
    var countSel = 0;
    var countVis = 0;
    var selDates = [];

    // Recalcular subtotales por día (solo tareas visibles)
    sortedDates.forEach(function (f) {
      var dSub = 0;
      groups[f].forEach(function (t) {
        var card = $('.costos-item[data-id="' + String(t.id) + '"]');
        if (card && card.style.display !== 'none') {
          dSub += (parseFloat(t.costo) || 0);
        }
      });
      var subEl = $('#daySub-' + f);
      if (subEl) subEl.innerHTML = 'Subtotal día: <b>' + money(dSub) + '</b>';
    });

    tareas.forEach(function (t) {
      var idStr = String(t.id);
      var cost = parseFloat(t.costo) || 0;
      var card = $('.costos-item[data-id="' + idStr + '"]');
      var isVis = card && card.style.display !== 'none';
      if (isVis) { sumVis += cost; countVis++; }

      if (isVis && selectedMap[idStr]) {
        sumSel += cost;
        countSel++;
        var d = t.fecha_trabajo || t.fecha_creacion;
        if (d) selDates.push(d);
      }
    });

    var elSel = $('#costosTotalSel');
    var elCount = $('#costosCountSel');
    var elAll = $('#costosTotalAll');
    var elPeriodo = $('#costosPeriodoSel');

    if (elSel) elSel.textContent = money(sumSel);
    if (elCount) elCount.textContent = countSel + ' de ' + countVis + ' visibles selecc.';
    if (elAll) elAll.textContent = 'Total tareas visibles: ' + money(sumVis);

    if (elPeriodo) {
      selDates.sort();
      if (!selDates.length) {
        elPeriodo.textContent = 'Ninguna tarea seleccionada';
      } else if (selDates.length === 1 || selDates[0] === selDates[selDates.length - 1]) {
        elPeriodo.textContent = 'Fecha: ' + fmtDate(selDates[0]);
      } else {
        elPeriodo.textContent = 'Período: ' + fmtDate(selDates[0]) + ' al ' + fmtDate(selDates[selDates.length - 1]);
      }
    }
  }

  // Filtrado compuesto: Búsqueda, Estado y Fechas
  var busInp = $('#busCostos');
  var dDesdeInp = $('#costosDesde');
  var dHastaInp = $('#costosHasta');

  function filterItems(syncSelection) {
    var q = (busInp ? busInp.value : '').toLowerCase().trim();
    var desde = dDesdeInp ? dDesdeInp.value : '';
    var hasta = dHastaInp ? dHastaInp.value : '';

    sortedDates.forEach(function (f) {
      var dayMatchDate = true;
      if (curD === 'hoy') {
        dayMatchDate = (f === Store.today());
      } else if (curD === 'semana') {
        var d7 = new Date(); d7.setDate(d7.getDate() - 7);
        var d7Iso = d7.toISOString().slice(0, 10);
        dayMatchDate = (f >= d7Iso && f <= Store.today());
      } else if (curD === 'mes') {
        var dMes = Store.today().slice(0, 7) + '-01';
        dayMatchDate = (f >= dMes);
      } else if (curD === 'rango') {
        if (desde && f < desde) dayMatchDate = false;
        if (hasta && f > hasta) dayMatchDate = false;
      }

      var dayVisibleCards = 0;
      $$('.costos-item[data-date="' + f + '"]').forEach(function (item) {
        var s = item.dataset.search || '';
        var est = item.dataset.est || '';
        var matchQ = !q || s.indexOf(q) >= 0;
        var matchEst = !curEst || est === curEst;
        var vis = dayMatchDate && matchQ && matchEst;
        item.style.display = vis ? '' : 'none';
        var id = item.dataset.id;
        var chk = $('.costos-check', item);
        if (!vis) {
          selectedMap[id] = false;
          if (chk) chk.checked = false;
          item.classList.remove('is-selected');
        } else {
          dayVisibleCards++;
          if (syncSelection) {
            selectedMap[id] = true;
            if (chk) chk.checked = true;
            item.classList.add('is-selected');
          }
        }
      });

      var dayGroup = $('.costos-day-group[data-date="' + f + '"]');
      if (dayGroup) {
        dayGroup.style.display = (dayVisibleCards > 0) ? '' : 'none';
      }
    });

    recalc();
  }

  if (busInp) busInp.addEventListener('input', function () { filterItems(false); });

  // Chips de fecha
  $$('#costosDateChips .chip').forEach(function (chip) {
    chip.addEventListener('click', function (e) {
      e.preventDefault();
      $$('#costosDateChips .chip').forEach(function (c) { c.classList.remove('on'); });
      chip.classList.add('on');
      curD = chip.dataset.d;
      var dateBar = $('#costosDateBar');
      if (dateBar) dateBar.style.display = (curD === 'rango') ? 'flex' : 'none';

      if (curD === 'hoy') {
        if (dDesdeInp) dDesdeInp.value = Store.today();
        if (dHastaInp) dHastaInp.value = Store.today();
      } else if (curD === 'todas') {
        if (dDesdeInp) dDesdeInp.value = '';
        if (dHastaInp) dHastaInp.value = '';
      }
      filterItems(true);
    });
  });

  // Botón Aplicar rango
  var bApplyDates = $('#btnApplyDates');
  if (bApplyDates) bApplyDates.addEventListener('click', function () {
    curD = 'rango';
    filterItems(true);
  });

  // Botón Limpiar fechas
  var bClearDates = $('#btnClearDates');
  if (bClearDates) bClearDates.addEventListener('click', function () {
    if (dDesdeInp) dDesdeInp.value = '';
    if (dHastaInp) dHastaInp.value = '';
    curD = 'todas';
    $$('#costosDateChips .chip').forEach(function (c) { c.classList.toggle('on', c.dataset.d === 'todas'); });
    var dateBar = $('#costosDateBar');
    if (dateBar) dateBar.style.display = 'none';
    filterItems(true);
  });

  // Chips de estado
  $$('[data-est]').forEach(function (chip) {
    if (chip.classList.contains('costos-item')) return;
    chip.addEventListener('click', function (e) {
      e.preventDefault();
      curEst = chip.dataset.est;
      $$('[data-est]').forEach(function (c) {
        if (!c.classList.contains('costos-item')) c.classList.toggle('on', c.dataset.est === curEst);
      });
      filterItems(false);
    });
  });

  // Checkbox individual
  $$('#costosList .costos-check').forEach(function (chk) {
    chk.addEventListener('change', function () {
      var id = chk.dataset.id;
      selectedMap[id] = chk.checked;
      var card = chk.closest('.costos-item');
      if (card) card.classList.toggle('is-selected', chk.checked);
      recalc();
    });
  });

  // Botón de Seleccionar / Deseleccionar día completo
  $$('.btn-sel-day').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var f = btn.dataset.date;
      var chks = $$('.costos-item[data-date="' + f + '"] .costos-check');
      var allChecked = true;
      chks.forEach(function (c) { if (!c.checked) allChecked = false; });
      var targetState = !allChecked;
      chks.forEach(function (c) {
        c.checked = targetState;
        selectedMap[c.dataset.id] = targetState;
        var card = c.closest('.costos-item');
        if (card) card.classList.toggle('is-selected', targetState);
      });
      recalc();
    });
  });

  // Botón "Solo este día": deselecciona todas las demás y selecciona solo este día
  $$('.btn-only-day').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetDate = btn.dataset.date;
      $$('#costosList .costos-check').forEach(function (chk) {
        var card = chk.closest('.costos-item');
        var isThisDay = card && card.dataset.date === targetDate;
        var isVis = !card || card.style.display !== 'none';
        var state = isThisDay && isVis;
        chk.checked = state;
        selectedMap[chk.dataset.id] = state;
        if (card) card.classList.toggle('is-selected', state);
      });
      recalc();
    });
  });

  // Botón Seleccionar todas las visibles
  var bAll = $('#btnCostosAll');
  if (bAll) bAll.addEventListener('click', function () {
    $$('#costosList .costos-check').forEach(function (chk) {
      var card = chk.closest('.costos-item');
      if (!card || card.style.display !== 'none') {
        chk.checked = true;
        selectedMap[chk.dataset.id] = true;
        if (card) card.classList.add('is-selected');
      }
    });
    recalc();
  });

  // Botón Deseleccionar todas
  var bNone = $('#btnCostosNone');
  if (bNone) bNone.addEventListener('click', function () {
    $$('#costosList .costos-check').forEach(function (chk) {
      var card = chk.closest('.costos-item');
      if (!card || card.style.display !== 'none') {
        chk.checked = false;
        selectedMap[chk.dataset.id] = false;
        if (card) card.classList.remove('is-selected');
      }
    });
    recalc();
  });

  // Edición directa de costo por tarea
  $$('#costosList .costos-input').forEach(function (inp) {
    var id = inp.dataset.id;
    var taskObj = tareas.find(function (t) { return String(t.id) === String(id); });

    function onCostChange() {
      var val = inp.value.trim();
      var num = val === '' ? 0 : parseFloat(val);
      if (isNaN(num) || num < 0) num = 0;
      if (taskObj) taskObj.costo = num;
      Store.upd('tareas', id, { costo: num });
      recalc();
      var mark = $('#chk-' + id);
      if (mark) {
        mark.classList.add('show');
        setTimeout(function () { mark.classList.remove('show'); }, 1200);
      }
    }

    inp.addEventListener('input', onCostChange);
    inp.addEventListener('change', onCostChange);
  });

  // Helper: Obtener solo tareas que estén VISIBLES en el filtro actual Y seleccionadas
  function getSelectedVisibleTasks() {
    return tareas.filter(function (t) {
      var card = $('.costos-item[data-id="' + String(t.id) + '"]');
      var isVis = card && card.style.display !== 'none';
      return isVis && !!selectedMap[String(t.id)];
    });
  }

  // Botón Enviar por WhatsApp (PDF)
  var bWaPdf = $('#btnCostosWaPdf');
  if (bWaPdf) bWaPdf.addEventListener('click', function () {
    var selTasks = getSelectedVisibleTasks();
    if (!selTasks.length) {
      toast('Selecciona al menos una tarea en el período visible');
      return;
    }

    toast('Generando PDF para WhatsApp…');
    generateCostosPdf(selTasks, function (err, pdfDoc) {
      if (err || !pdfDoc) {
        toast('Error al generar PDF. Intenta nuevamente.');
        return;
      }

      var total = 0;
      selTasks.forEach(function (t) { total += (parseFloat(t.costo) || 0); });
      var filename = 'Liquidacion_Costos_' + Store.today() + '.pdf';
      var textMsg = 'Hola, adjunto la Liquidación de Costos de Servicios en PDF con ' + selTasks.length + ' tareas por un total de ' + money(total) + '.';
      var waUrl = 'https://wa.me/?text=' + encodeURIComponent(textMsg);

      try {
        var blob = pdfDoc.output('blob');
        var file = new File([blob], filename, { type: 'application/pdf' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({
            title: 'Liquidación de Costos Servitech',
            text: textMsg,
            files: [file]
          }).then(function () {
            toast('Liquidación en PDF compartida por WhatsApp');
          }).catch(function (e) {
            if (e && e.name !== 'AbortError') {
              pdfDoc.save(filename);
              window.open(waUrl, '_blank');
              toast('PDF descargado. Adjúntalo en el chat de WhatsApp que se abrirá.');
            }
          });
          return;
        }

        pdfDoc.save(filename);
        setTimeout(function () {
          window.open(waUrl, '_blank');
          toast('PDF descargado. Adjúntalo en el chat de WhatsApp que se abrirá.');
        }, 300);
      } catch (e2) {
        pdfDoc.save(filename);
        window.open(waUrl, '_blank');
        toast('PDF descargado. Adjúntalo en el chat de WhatsApp que se abrirá.');
      }
    });
  });

  // Botón Descargar PDF directo
  var bDlPdf = $('#btnCostosDlPdf');
  if (bDlPdf) bDlPdf.addEventListener('click', function () {
    var selTasks = getSelectedVisibleTasks();
    if (!selTasks.length) {
      toast('Selecciona al menos una tarea en el período visible');
      return;
    }

    toast('Generando PDF de costos…');
    generateCostosPdf(selTasks, function (err, pdfDoc) {
      if (err || !pdfDoc) {
        toast('Error al generar PDF.');
        return;
      }
      var filename = 'Liquidacion_Costos_' + Store.today() + '.pdf';
      pdfDoc.save(filename);
      toast('PDF de costos descargado con éxito');
    });
  });

  filterItems();
}

/* =========================================================
   AJUSTES
   ========================================================= */
function vAjustes() {
  setTitle('Ajustes');
  setNew(null);
  var m = Store.db.meta;
  var html = '<div class="stack">' +
    '<form class="card pad" data-f="aj">' +
    '<h2 class="sec">Datos por defecto</h2>' +
    field('Tu nombre (técnico)', 'tecnico', m.tecnico, 'text', 'Aparecerá en tareas e informes') +
    field('Símbolo de moneda', 'currency', m.currency, 'text', 'Ej: S/  o  US$') +
    '<button class="btn primary block" type="submit">Guardar</button></form>' +
    '<div class="card pad"><h2 class="sec">Nube</h2>' +
    '<div id="cloudBox"><p class="hint">Cargando…</p></div></div>' +
    '<div class="card pad"><h2 class="sec">Respaldo y mantenimiento de datos</h2>' +
    '<p class="hint">Tus datos se guardan en este dispositivo/navegador. Descarga un respaldo con frecuencia y guárdalo en tu nube o correo.</p>' +
    '<div class="btnrow">' +
    '<button class="btn secondary sm" data-act="export">Descargar respaldo</button>' +
    '<label class="btn ghost sm">Importar respaldo<input type="file" id="fileImp" accept=".json,application/json" hidden></label>' +
    '<button class="btn danger sm" data-act="reset">Borrar todos los datos</button>' +
    '</div></div>' +
    '<div class="card pad"><h2 class="sec">Instalar en el celular</h2>' +
    '<p class="hint">Cuando la app esté publicada en internet: ábrela en Chrome en tu Android, toca el menú (⋮) y elige "Agregar a pantalla de inicio". Quedará un ícono que la abre a pantalla completa, como una app normal, incluso sin conexión.</p></div>' +
    '<p class="hint" style="text-align:center">Servitech v0.2 · datos locales en este dispositivo</p>' +
    '</div>';
  $('#view').innerHTML = html;
  var fi = $('#fileImp');
  if (fi) fi.addEventListener('change', function () {
    var f = fi.files && fi.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try { Store.importJSON(rd.result); toast('Respaldo importado'); location.hash = '#/empresas'; }
      catch (e2) { toast('Archivo no válido'); }
    };
    rd.readAsText(f);
  });
  if (window.Cloud) {
    Cloud.onChange(renderCloudBox);
    renderCloudBox();
    Cloud.init().then(function () { renderCloudBox(); }).catch(function () {
      var box = $('#cloudBox');
      if (box) box.innerHTML = '<p class="hint err">' + esc(Cloud.status().error || 'No se pudo iniciar la nube') + '</p>';
    });
  }
}

function fmtMs(ms) {
  if (!ms) return '—';
  var d = new Date(ms);
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function updateCloudStatus() {
  var el = $('#cloudStatus');
  if (!el || !window.Cloud) return;
  var dot = $('.cloud-dot', el);
  var s = Cloud.status();
  if (dot) {
    dot.className = 'cloud-dot';
    if (s.pending || s.loading) {
      dot.classList.add('syncing');
      el.title = 'Sincronizando con Firebase…';
    } else if (s.connected || s.ready) {
      dot.classList.add('ok');
      el.title = 'Conectado a Firebase (' + (s.user || 'automático') + ') · ' + (s.lastSync ? 'Última sinc: ' + fmtMs(s.lastSync) : 'Sincronizado');
    } else if (s.error) {
      dot.classList.add('err');
      el.title = 'Aviso de nube: ' + s.error;
    } else {
      el.title = 'Modo local activo';
    }
  }
}

function renderCloudBox() {
  updateCloudStatus();
  var box = $('#cloudBox');
  if (!box || !window.Cloud) return;
  var s = Cloud.status();
  var h = '<div class="cloud-on"><span class="dot ' + (s.connected || s.ready ? 'ok' : (s.error ? 'err' : '')) + '"></span>' +
    '<div><b>' + (s.connected || s.ready ? 'Sincronización interna activa' : 'Conectando a Firebase…') + '</b>' +
    '<div class="s">' + esc(s.project || 'servictech-84304') + (s.lastSync ? ' · Sincronizado ' + fmtMs(s.lastSync) : '') + '</div></div></div>' +
    '<p class="hint">Tus datos de empresas, tareas, repuestos e informes se respaldan y sincronizan automáticamente en segundo plano.</p>' +
    '<div class="btnrow">' +
    '<button class="btn secondary sm" data-act="cloud-sync">Sincronizar ahora</button>' +
    '<button class="btn ghost sm" data-act="cloud-push">Subir a la nube</button>' +
    '</div>';
  if (s.error) h += '<p class="hint err">' + esc(s.error) + '</p>';
  box.innerHTML = h;
}

/* =========================================================
   Eventos globales
   ========================================================= */
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-act]');
  if (!b) return;
  var act = b.dataset.act;
  var id = b.dataset.id;

  if (act === 'del-emp') {
    confirmBox('Eliminar empresa', 'Se borrarán también sus equipos, tareas, repuestos e informes. Esta acción no se puede deshacer.', function () {
      var db = Store.db;
      var emp = Store.get('empresas', id);
      if (!emp) return;
      db.equipos.forEach(function (q) { if (String(q.id_empresa) === String(id)) { db.repuestos = db.repuestos.filter(function (r) { return String(r.id_equipo) !== String(q.id); }); } });
      db.equipos = db.equipos.filter(function (q) { return String(q.id_empresa) !== String(id); });
      db.tareas.forEach(function (t) { if (String(t.id_empresa) === String(id)) { db.informes = db.informes.filter(function (x) { return String(x.id_tarea) !== String(t.id); }); db.repuestos = db.repuestos.filter(function (r) { return String(r.id_tarea) !== String(t.id); }); } });
      db.tareas = db.tareas.filter(function (t) { return String(t.id_empresa) !== String(id); });
      Store.del('empresas', id);
      toast('Empresa eliminada');
      location.hash = '#/empresas';
    });
  }
  else if (act === 'del-equipo') {
    confirmBox('Eliminar equipo', 'Se quitará el equipo y se desvinculará de sus tareas.', function () {
      var db = Store.db;
      db.tareas.forEach(function (t) { if (String(t.id_equipo) === String(id)) t.id_equipo = ''; });
      db.repuestos = db.repuestos.filter(function (r) { return String(r.id_equipo) !== String(id) || r.id_tarea; });
      Store.del('equipos', id);
      toast('Equipo eliminado');
      route();
    });
  }
  else if (act === 'del-tarea') {
    confirmBox('Eliminar tarea', 'Se borrarán sus repuestos e informes asociados.', function () {
      var db = Store.db;
      db.repuestos = db.repuestos.filter(function (r) { return String(r.id_tarea) !== String(id); });
      db.informes = db.informes.filter(function (x) { return String(x.id_tarea) !== String(id); });
      Store.del('tareas', id);
      toast('Tarea eliminada');
      location.hash = '#/tareas';
    });
  }
  else if (act === 'del-rep') {
    confirmBox('Quitar repuesto', 'Se eliminará este repuesto de la lista.', function () {
      Store.del('repuestos', id);
      toast('Repuesto eliminado');
      route();
    });
  }
  else if (act === 'del-inf') {
    confirmBox('Eliminar informe', 'La tarea asociada volverá a estado pendiente.', function () {
      var x = Store.get('informes', id);
      if (x) Store.upd('tareas', x.id_tarea, { estado: 'Pendiente', informe_emitido: false });
      Store.del('informes', id);
      toast('Informe eliminado');
      location.hash = '#/informes';
    });
  }
  else if (act === 'pad-clear') {
    if (window._pads) {
      if (b.dataset.pad === 'padResp') window._pads.resp.clear();
      else window._pads.tec.clear();
    }
  }
  else if (act === 'cloud-save-cfg') {
    var ta = $('#clCfg'); if (!ta) return;
    try {
      var obj = JSON.parse(ta.value.trim());
      if (!obj.apiKey || !obj.projectId) throw new Error('faltan datos');
      Cloud.setConfig(obj); toast('Configuración guardada');
      Cloud.init().then(function () { renderCloudBox(); }).catch(function () { renderCloudBox(); });
      renderCloudBox();
    } catch (e) { toast('Configuración no válida (revisa el bloque firebaseConfig)'); }
  }
  else if (act === 'cloud-cfg-edit') {
    confirmBox('Cambiar configuración', 'Se olvidará la configuración de Firebase guardada en este dispositivo. Tus datos locales no se tocan.', function () {
      Cloud.clearConfig(); renderCloudBox();
    }, 'Continuar');
  }
  else if (act === 'cloud-connect') {
    var em = $('#clEmail'), pw = $('#clPass');
    var email = ((em && em.value) || '').trim();
    var pass = (pw && pw.value) || '';
    if (!email || !pass) { toast('Escribe correo y contraseña'); return; }
    b.disabled = true; b.textContent = 'Conectando…';
    Cloud.signIn(email, pass).then(function () {
      toast('Conectado a la nube');
      renderCloudBox();
    }).catch(function () {
      toast(Cloud.status().error || 'No se pudo conectar');
      renderCloudBox();
    });
  }
  else if (act === 'cloud-logout') {
    confirmBox('Cerrar sesión en la nube', 'La sincronización se detendrá en este dispositivo. Tus datos locales se mantienen.', function () {
      Cloud.signOut().then(function () { toast('Sesión cerrada'); renderCloudBox(); });
    }, 'Cerrar sesión');
  }
  else if (act === 'cloud-sync') {
    Cloud.syncNow().then(function (ok) {
      toast(ok ? 'Sincronizado' : (Cloud.status().error || 'No se pudo sincronizar'));
      renderCloudBox();
    });
  }
  else if (act === 'cloud-push') {
    Cloud.push(false).then(function () { renderCloudBox(); });
  }
  else if (act === 'cloud-pull') {
    confirmBox('Bajar desde la nube', 'Los datos de este dispositivo se reemplazarán por los de la nube.', function () {
      Cloud.pull(true).then(function () { renderCloudBox(); });
    }, 'Bajar');
  }
  else if (act === 'export') {
    var blob = new Blob([Store.exportJSON()], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'servitech-respaldo-' + Store.today() + '.json';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
    toast('Respaldo descargado');
  }
  else if (act === 'seed') {
    confirmBox('Cargar datos de ejemplo', 'Reemplazará todos tus datos actuales por los de prueba.', function () {
      Store.demo();
      toast('Datos de ejemplo cargados');
      location.hash = '#/empresas';
    }, 'Cargar', false);
  }
  else if (act === 'reset') {
    confirmBox('Borrar todo', 'Se eliminarán TODOS tus datos. Descarga antes un respaldo si los necesitas.', function () {
      Store.reset();
      toast('Datos borrados');
      location.hash = '#/empresas';
    }, 'Borrar todo');
  }
  else if (act === 'print') { window.print(); }
  else if (act === 'pdf-dl') {
    var x = Store.get('informes', id);
    if (!x) return;
    toast('Generando PDF…');
    generateReportPdf(x, function (err, pdfDoc) {
      if (err || !pdfDoc) {
        toast('Error al generar PDF. Usa Imprimir.');
        return;
      }
      var filename = 'Informe_' + (x.codigo || 'Servitech') + '.pdf';
      pdfDoc.save(filename);
      toast('PDF descargado');
    });
  }
  else if (act === 'wa-share') {
    var x = Store.get('informes', id);
    if (!x) return;
    toast('Generando PDF para WhatsApp…');
    generateReportPdf(x, function (err, pdfDoc) {
      var filename = 'Informe_' + (x.codigo || 'Servitech') + '.pdf';
      var textMsg = informeText(x);
      var waUrl = 'https://wa.me/?text=' + encodeURIComponent(textMsg);

      if (!err && pdfDoc) {
        try {
          var blob = pdfDoc.output('blob');
          var file = new File([blob], filename, { type: 'application/pdf' });

          // Si el navegador soporta compartir archivos nativamente (Android / iOS / PWA)
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({
              title: 'Informe ' + (x.codigo || ''),
              text: 'Adjunto Informe de Servicio Técnico ' + (x.codigo || ''),
              files: [file]
            }).then(function () {
              Store.upd('informes', id, { enviado_a: 'WhatsApp (PDF)', fecha_envio: Store.nowLocal() });
              toast('Informe compartido exitosamente');
            }).catch(function (e) {
              if (e && e.name !== 'AbortError') {
                // Fallback: descarga PDF y abre WhatsApp
                pdfDoc.save(filename);
                Store.upd('informes', id, { enviado_a: 'WhatsApp', fecha_envio: Store.nowLocal() });
                window.open(waUrl, '_blank');
                toast('PDF descargado. Adjúntalo en el chat de WhatsApp que se abrirá.');
              }
            });
            return;
          }

          // En navegadores de escritorio (Chrome/Edge/Firefox en PC): descarga el PDF y abre WhatsApp Web
          pdfDoc.save(filename);
          Store.upd('informes', id, { enviado_a: 'WhatsApp', fecha_envio: Store.nowLocal() });
          setTimeout(function () {
            window.open(waUrl, '_blank');
            toast('PDF descargado. Adjúntalo en el chat de WhatsApp que se abrirá.');
          }, 350);
          return;
        } catch (e) {
          console.error('Error procesando PDF para compartir:', e);
        }
      }

      // Fallback final si la generación de PDF no estuvo disponible
      Store.upd('informes', id, { enviado_a: 'WhatsApp', fecha_envio: Store.nowLocal() });
      window.open(waUrl, '_blank');
      toast('Abriendo WhatsApp…');
    });
  }
});

document.addEventListener('change', function (e) {
  var s = e.target;
  if (s.classList && s.classList.contains('est-rep')) {
    Store.upd('repuestos', s.dataset.id, { estado_pedido: s.value });
    toast('Estado: ' + s.value);
    route();
  }
  else if (s.id === 'clAuto' && window.Cloud) {
    Cloud.setAuto(s.checked);
    toast(s.checked ? 'Sincronización automática activada' : 'Sincronización automática desactivada');
  }
});

document.addEventListener('submit', function (e) {
  var f = e.target;
  var kind = f.dataset.f;
  if (!kind) return;
  e.preventDefault();
  if (kind === 'emp') saveEmpresa(f);
  else if (kind === 'equ') saveEquipo(f);
  else if (kind === 'tar') saveTarea(f);
  else if (kind === 'rep') saveRepuesto(f);
  else if (kind === 'inf') saveInforme(f);
  else if (kind === 'sel-inf-emp') {
    var selEmp = $('select[name=empresa]', f);
    var inpFecha = $('input[name=fecha]', f);
    if (selEmp && selEmp.value) {
      var url = '#/informe-form?empresa=' + encodeURIComponent(selEmp.value);
      if (inpFecha && inpFecha.value) url += '&fecha=' + encodeURIComponent(inpFecha.value);
      location.hash = url;
    }
  }
  else if (kind === 'seltar') {
    var sel = $('select[name=tarea]', f);
    if (sel && sel.value) location.hash = '#/informe-form?tarea=' + encodeURIComponent(sel.value);
  }
  else if (kind === 'aj') {
    var m = Store.db.meta;
    m.tecnico = f.tecnico.value;
    m.currency = f.currency.value || 'S/ ';
    Store.save();
    toast('Ajustes guardados');
    route();
  }
});

/* arranque */
Store.load();
window.addEventListener('hashchange', route);
route();
if (window.Cloud && Cloud.configured()) {
  Cloud.onChange(updateCloudStatus);
  Cloud.init().then(updateCloudStatus).catch(function () { updateCloudStatus(); });
}
document.addEventListener('click', function (e) {
  var pill = e.target.closest('#cloudStatus');
  if (pill && window.Cloud) {
    var s = Cloud.status();
    if (s.connected || s.ready) {
      toast('Nube conectada · ' + (s.lastSync ? 'Sincronizado ' + fmtMs(s.lastSync) : 'Sincronizado'));
      Cloud.syncNow();
    } else {
      toast('Conectando a Firebase en segundo plano…');
      Cloud.init().then(function () { Cloud.syncNow(); });
    }
  }
});
