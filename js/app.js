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
    s += '<option value="' + esc(q.id) + '"' + (String(sel) === String(q.id) ? ' selected' : '') + '>' + esc(eqLabel(q)) + '</option>';
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
  eqs.forEach(function (q) {
    var fReg = q.fecha_registro ? fmtDate(q.fecha_registro) : '';
    html += '<div class="card row">' +
      '<div class="row-main">' +
      '<div class="t">' + esc(eqLabel(q)) + '</div>' +
      '<div class="s">Serie ' + esc(q.nro_serie || '—') + (q.ubicacion ? ' · ' + esc(q.ubicacion) : '') + (fReg ? ' · Reg: ' + esc(fReg) : '') + '</div>' +
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
      group.tareas.forEach(function (t) {
        html += '<a class="card row" href="#/tarea/' + esc(t.id) + '">' +
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
  $$('input,select,textarea', form).forEach(function (i) { out[i.name] = i.value; });
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
      var full = (eqLabel(x) + ' ' + (x.nro_serie || '') + ' ' + (x.ubicacion || '') + ' ' + empName(x.id_empresa)).toLowerCase();
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
  list.forEach(function (eq) {
    var emp = Store.get('empresas', eq.id_empresa);
    var fReg = eq.fecha_registro ? fmtDate(eq.fecha_registro) : '';
    var tars = db.tareas.filter(function (t) { return String(t.id_equipo) === String(eq.id); });
    var tarsPend = tars.filter(function (t) { return t.estado !== 'Completada' && t.estado !== 'Cancelada'; }).length;

    html += '<div class="card row">' +
      '<div class="row-main">' +
      '<div class="t">' + esc(eqLabel(eq)) + '</div>' +
      '<div class="s"><b>Cliente:</b> ' + (emp ? esc(emp.razon_social) : '—') + '</div>' +
      '<div class="s">Serie: ' + esc(eq.nro_serie || '—') + (eq.ubicacion ? ' · ' + esc(eq.ubicacion) : '') + (fReg ? ' · Reg: ' + esc(fReg) : '') + '</div>' +
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
    field('Ubicación (piso, oficina…)', 'ubicacion', v('ubicacion')) +
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
    groups[f].forEach(function (t) {
      var cod = 'T-' + String(t.id).padStart(4, '0');
      html += '<a class="card row" href="#/tarea/' + esc(t.id) + '">' +
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
    fieldArea('Novedad: lo que se encontró', 'novedad', v('novedad'), 'Se completa en el sitio') +
    fieldArea('Trabajo realizado', 'trabajo_realizado', v('trabajo_realizado')) +
    fieldArea('Solución / estado final', 'solucion', v('solucion')) +
    '<div class="row2">' +
    fieldSel('¿Equipo operativo?', 'equipo_operativo', '<option value=""></option><option value="Sí"' + (v('equipo_operativo') === 'Sí' ? ' selected' : '') + '>Sí</option><option value="No"' + (v('equipo_operativo') === 'No' ? ' selected' : '') + '>No</option>') +
    fieldSel('Estado del informe', 'informe_emitido', '<option value="false">Sin informe</option><option value="true"' + (v('informe_emitido') === true || v('informe_emitido') === 'true' ? ' selected' : '') + '>Emitido</option>') +
    '</div>' +
    fieldArea('Recomendaciones', 'recomendaciones', v('recomendaciones')) +
    '<div class="row2">' +
    field('Fecha del trabajo (día)', 'fecha_trabajo', v('fecha_trabajo') || qs.get('fecha') || Store.today(), 'date', '', true) +
    field('Técnico responsable', 'tecnico_responsable', v('tecnico_responsable') || Store.db.meta.tecnico || '', 'text', 'Tu nombre') +
    '</div>' +
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
    '<div class="kv"><span>Equipo</span><b>' + esc(eqName(t.id_equipo)) + '</b></div>' +
    '<div class="kv"><span>Tipo / prioridad</span><b>' + esc(t.tipo_tarea || '—') + ' · ' + esc(t.prioridad || '—') + '</b></div>' +
    '<div class="kv"><span>Descripción</span><b>' + esc(t.descripcion_trabajo || '—') + '</b></div>' +
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
    dataURL: function () {
      return cv._drawn ? cv.toDataURL('image/png') : '';
    }
  };
}

function vInformeForm(qs) {
  var tid = qs.get('tarea');
  var empId = qs.get('empresa');
  var fechaServicio = qs.get('fecha') || Store.today();
  var db = Store.db;
  var t = tid ? Store.get('tareas', tid) : null;
  if (t) {
    empId = t.id_empresa;
    fechaServicio = t.fecha_trabajo || t.fecha_programada || t.fecha_creacion || fechaServicio;
  }

  // PASO 1: Si no hay empresa, mostrar selector de empresa únicamente
  if (!empId) {
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

  // PASO 2: Si hay empresa pero no fecha, mostrar lista de jornadas con estado de informe
  if (!qs.get('fecha') && !tid) {
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
      var infExistente = infsEmp.find(function (x) { return x.fecha_servicio === group.fecha; });
      var dFmt = dayLabel(group.fecha);
      var tasksPend = group.tareas.filter(function (t) { return t.estado !== 'Completada' && t.estado !== 'Cancelada'; }).length;

      if (infExistente) {
        // Jornada ya tiene informe
        html2 += '<div class="day-card" style="border-left:4px solid #059669;">' +
          '<div class="day-head">' +
          '<div class="day-title">📅 ' + esc(dFmt) + ' <span class="day-badge">' + pl(group.tareas.length, 'tarea', 'tareas') + '</span></div>' +
          '<div class="day-actions">' +
          '<span class="badge ok">✅ Informe ' + esc(infExistente.codigo) + '</span>' +
          '<a class="btn ghost sm" style="font-size:11px;padding:3px 8px;" href="#/informe/' + esc(infExistente.id) + '">Ver informe</a>' +
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
      group.tareas.forEach(function (t) {
        var eq = t.id_equipo ? Store.get('equipos', t.id_equipo) : null;
        html2 += '<div class="card row" style="pointer-events:none;opacity:.85;">' +
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


  setTitle('Informe: ' + emp.razon_social);
  setNew(null);

  // Obtener todas las tareas de esta empresa correspondientes a esta fecha (o la tarea puntual si viene por tid)
  var dayTasks = db.tareas.filter(function (x) {
    if (String(x.id_empresa) !== String(empId)) return false;
    if (tid && String(x.id) === String(tid)) return true;
    var xf = x.fecha_trabajo || x.fecha_programada || x.fecha_creacion || '';
    return xf === fechaServicio;
  });

  // Consolidar novedad, trabajo y solución de las tareas del día si no están en la tarea puntual
  var defaultNovedad = '';
  var defaultTrabajo = '';
  var defaultSolucion = '';
  var defaultRecom = '';
  var taskIds = [];
  var taskDescList = [];

  dayTasks.forEach(function (tk, idx) {
    taskIds.push(tk.id);
    var prefix = dayTasks.length > 1 ? '(' + (idx + 1) + ') ' : '';
    if (tk.descripcion_trabajo) taskDescList.push(prefix + tk.descripcion_trabajo);
    if (tk.novedad) defaultNovedad += (defaultNovedad ? '\n' : '') + prefix + tk.novedad;
    if (tk.trabajo_realizado) defaultTrabajo += (defaultTrabajo ? '\n' : '') + prefix + tk.trabajo_realizado;
    if (tk.solucion) defaultSolucion += (defaultSolucion ? '\n' : '') + prefix + tk.solucion;
    if (tk.recomendaciones) defaultRecom += (defaultRecom ? '\n' : '') + prefix + tk.recomendaciones;
  });

  if (!defaultTrabajo && taskDescList.length) {
    defaultTrabajo = taskDescList.join('\n');
  }

  // Repuestos cambiados en las tareas de este día
  var changed = db.repuestos.filter(function (r) {
    return taskIds.indexOf(r.id_tarea) >= 0 && r.estado_pedido === 'Cambiado';
  });

  var eq = (t && t.id_equipo) ? Store.get('equipos', t.id_equipo) : null;
  var backUrl = tid ? '#/tarea/' + esc(tid) : '#/empresa/' + esc(empId);

  var html = '<div class="stack">' + cardBack(backUrl) +
    '<div class="card pad">' +
    '<div class="line"><span class="big">Informe de servicio técnico</span></div>' +
    '<div class="kv"><span>Empresa</span><b>' + esc(emp.razon_social) + ' · RUC ' + esc(emp.ruc || '—') + '</b></div>' +
    '<div class="kv"><span>Fecha de atención</span><b>📅 ' + esc(dayLabel(fechaServicio)) + '</b></div>' +
    (eq ? '<div class="kv"><span>Equipo</span><b>' + esc(eqLabel(eq)) + ' · Serie ' + esc(eq.nro_serie || '—') + '</b></div>' : '') +
    '<div class="kv"><span>Labores del día (' + taskIds.length + ')</span><b>' + esc(taskDescList.join(' | ') || 'Servicio general') + '</b></div>' +
    '</div>' +
    '<form class="card pad" data-f="inf" data-empresa="' + esc(empId) + '" data-fecha="' + esc(fechaServicio) + '" data-tasks="' + esc(taskIds.join(',')) + '">' +
    '<h2 class="sec">Contenido del informe</h2>' +
    fieldArea('1. Novedad: lo que se encontró', 'novedad', defaultNovedad, 'Diagnóstico en el sitio') +
    fieldArea('2. Trabajo realizado', 'trabajo_realizado', defaultTrabajo, 'Qué acciones se ejecutaron') +
    fieldArea('3. Solución / estado final', 'solucion', defaultSolucion, 'Equipo operativo, entrega conforme…') +
    '<h2 class="sec">Repuestos utilizados</h2>';
  if (!changed.length) html += '<p class="hint">Sin repuestos cambiados en esta jornada.</p>';
  changed.forEach(function (r) {
    html += '<div class="kv"><span>' + esc(r.descripcion_pieza) + '</span><b>x' + esc(r.cantidad) + ' · ' + money(r.precio_unitario) + '</b></div>';
  });
  html += '<h2 class="sec">Conformidad del servicio</h2>' +
    '<p class="hint">Indica el resultado y satisfacción del cliente al recibir el equipo o servicio:</p>' +
    '<div class="conformidad-selector">' +
    '<label class="conf-opt"><input type="radio" name="conformidad" value="Conforme" checked> <span>✅ Conforme (Servicio recibido a satisfacción)</span></label>' +
    '<label class="conf-opt opt-no"><input type="radio" name="conformidad" value="No conforme"> <span>⚠️ No conforme (Observaciones pendientes)</span></label>' +
    '</div>' +
    fieldArea('Observaciones de conformidad (opcional)', 'observaciones_conformidad', '', 'Si es no conforme o requiere aclaración adicional') +
    '<h2 class="sec">Datos del responsable y firmas</h2>' +
    '<div class="row2">' +
    field('Nombre del responsable *', 'nombre_responsable', emp.persona_contacto || '', 'text', 'Quien confirma en el cliente') +
    field('Cargo', 'cargo_responsable', emp.cargo_contacto || '', 'text', 'Ej: Administrador') +
    '</div>' +
    '<div class="fld"><span>Firma del responsable (cliente) *</span>' +
    '<canvas id="padResp" class="sig"></canvas>' +
    '<button type="button" class="btn ghost sm" data-act="pad-clear" data-pad="padResp">Limpiar firma</button></div>' +
    '<div class="fld"><span>Firma del técnico</span>' +
    '<canvas id="padTec" class="sig"></canvas>' +
    '<button type="button" class="btn ghost sm" data-act="pad-clear" data-pad="padTec">Limpiar firma</button></div>' +
    '<button class="btn primary block" type="submit">Guardar informe y cerrar jornada</button>' +
    '<p class="hint">Al guardar, las tareas de esta fecha pasarán a Completadas y el informe quedará archivado.</p>' +
    '</form></div>';
  $('#view').innerHTML = html;
  window._pads = { resp: initPad('padResp'), tec: initPad('padTec') };
}

function saveInforme(form) {
  var empId = form.dataset.empresa;
  var fechaServicio = form.dataset.fecha || Store.today();
  var taskIdsStr = form.dataset.tasks || '';
  var taskIds = taskIdsStr ? taskIdsStr.split(',').filter(Boolean) : [];

  var emp = Store.get('empresas', empId);
  if (!emp) { toast('Empresa no encontrada'); return; }

  var d = readForm(form);
  var pads = window._pads || {};
  if (!d.nombre_responsable.trim()) { toast('Escribe el nombre del responsable'); return; }
  var sigR = pads.resp ? pads.resp.dataURL() : '';
  if (!sigR) { toast('El responsable debe firmar con el dedo'); return; }
  var sigT = pads.tec ? pads.tec.dataURL() : '';

  // Repuestos cambiados en las tareas involucradas
  var changed = Store.coll('repuestos').filter(function (r) {
    return taskIds.indexOf(String(r.id_tarea)) >= 0 && r.estado_pedido === 'Cambiado';
  });

  var primerTarea = taskIds.length ? Store.get('tareas', taskIds[0]) : null;
  var eq = (primerTarea && primerTarea.id_equipo) ? Store.get('equipos', primerTarea.id_equipo) : null;

  var row = {
    codigo: Store.nextInfCode(),
    id_empresa: empId,
    fecha_servicio: fechaServicio,
    task_ids: taskIds,
    id_tarea: taskIds[0] || '',
    fecha_emision: Store.nowLocal(),
    tecnico: (primerTarea && primerTarea.tecnico_responsable) || Store.db.meta.tecnico || '',
    empresa: { razon_social: emp.razon_social, ruc: emp.ruc, direccion: emp.direccion, contacto: emp.persona_contacto },
    equipo: eq ? { tipo: eq.tipo_equipo, marca: eq.marca, modelo: eq.modelo, serie: eq.nro_serie, ubicacion: eq.ubicacion } : null,
    novedad: d.novedad,
    trabajo_realizado: d.trabajo_realizado,
    solucion: d.solucion,
    repuestos: changed.map(function (r) { return { pieza: r.descripcion_pieza, cantidad: r.cantidad, precio: r.precio_unitario }; }),
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
  if (eq) { L.push('EQUIPO: ' + [eq.tipo, eq.marca, eq.modelo].filter(Boolean).join(' ')); if (eq.serie) L.push('Serie: ' + eq.serie); L.push(''); }
  if (x.novedad) { L.push('LO QUE SE ENCONTRO'); L.push(x.novedad); L.push(''); }
  if (x.trabajo_realizado) { L.push('LO QUE SE HIZO'); L.push(x.trabajo_realizado); L.push(''); }
  if (x.repuestos && x.repuestos.length) {
    L.push('REPUESTOS'); x.repuestos.forEach(function (r) { L.push('- ' + r.pieza + ' x' + r.cantidad + ' (' + money(r.precio) + ')'); }); L.push('');
  }
  if (x.solucion) { L.push('SOLUCION / ESTADO FINAL'); L.push(x.solucion); L.push(''); }
  var confText = x.conformidad === 'No conforme' ? '⚠️ NO CONFORME' : '✅ CONFORME';
  L.push('ESTADO DE CONFORMIDAD: ' + confText);
  if (x.observaciones_conformidad) L.push('Observaciones: ' + x.observaciones_conformidad);
  L.push('Conformidad del responsable: ' + (x.nombre_responsable || '') + (x.cargo_responsable ? ' (' + x.cargo_responsable + ')' : ''));
  if (x.tecnico) L.push('Tecnico: ' + x.tecnico);
  return L.join('\n');
}

function vInforme(id) {
  var x = Store.get('informes', id);
  if (!x) { location.hash = '#/informes'; return; }
  setTitle('Informe ' + x.codigo);
  setNew(null);
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
    '<button class="btn primary sm" data-act="wa-share" data-id="' + esc(id) + '">📱 Enviar por WhatsApp</button>' +
    '<button class="btn secondary sm" data-act="print">🖨️ PDF / Imprimir</button>' +
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
    '</div>' +

    /* Firmas y conformidad */
    '<div class="rep-firmas">' +
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
    '<p class="hint" style="text-align:center">Servitech v0.1 · datos locales en este dispositivo</p>' +
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
  else if (act === 'wa-share') {
    var x = Store.get('informes', id);
    if (!x) return;
    var url = 'https://wa.me/?text=' + encodeURIComponent(informeText(x));
    Store.upd('informes', id, { enviado_a: 'WhatsApp', fecha_envio: Store.nowLocal() });
    window.open(url, '_blank');
    toast('Abriendo WhatsApp…');
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
