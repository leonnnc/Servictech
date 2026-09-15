/* =========================================================
   Servitech - capa de datos (localStorage)
   Almacena: empresas, equipos, tareas, repuestos, informes
   ========================================================= */
window.Store = (function () {
  var KEY = 'servitech_db_v1';
  var SEQKEY = { empresas: 'emp', equipos: 'equ', tareas: 'tar', repuestos: 'rep', informes: 'inf' };

  function empty() {
    return {
      v: 1,
      meta: { seq: { emp: 0, equ: 0, tar: 0, rep: 0, inf: 0 }, year: new Date().getFullYear(), nextInf: 1, tecnico: '', currency: 'S/ ' },
      empresas: [], equipos: [], tareas: [], repuestos: [], informes: []
    };
  }

  var db = null;

  function ensureMeta() {
    var m = db.meta || (db.meta = {});
    m.seq = m.seq || { emp: 0, equ: 0, tar: 0, rep: 0, inf: 0 };
    if (!m.currency) m.currency = 'S/ ';
    if (!m.nextInf) m.nextInf = 1;
    if (!m.year) m.year = new Date().getFullYear();
    if (m.tecnico === undefined) m.tecnico = '';

    // Asegurar que las secuencias no colisionen con registros existentes
    Object.keys(SEQKEY).forEach(function (col) {
      var k = SEQKEY[col];
      var list = db[col] || [];
      var maxId = 0;
      list.forEach(function (r) {
        var num = parseInt(r.id, 10);
        if (!isNaN(num) && num > maxId) maxId = num;
      });
      if ((m.seq[k] || 0) < maxId) m.seq[k] = maxId;
    });

    // Asegurar que nextInf sea mayor a los informes existentes del año
    if (Array.isArray(db.informes)) {
      var currYear = m.year;
      var maxInf = 0;
      db.informes.forEach(function (inf) {
        if (inf && inf.codigo) {
          var parts = String(inf.codigo).split('-');
          var num = parseInt(parts[0], 10);
          var yr = parseInt(parts[1], 10);
          if (yr === currYear && !isNaN(num) && num > maxInf) maxInf = num;
        }
      });
      if (m.nextInf <= maxInf) m.nextInf = maxInf + 1;
    }
  }

  function load() {
    try { db = JSON.parse(localStorage.getItem(KEY)) || empty(); }
    catch (e) { db = empty(); }
    if (!db.v) db.v = 1;
    if (!db.meta) db.meta = empty().meta;
    ['empresas', 'equipos', 'tareas', 'repuestos', 'informes'].forEach(function (k) {
      if (!Array.isArray(db[k])) db[k] = [];
    });
    ensureMeta();
    return db;
  }

  function save(skipNotify) {
    ensureMeta();
    db.meta.updatedAt = Date.now();
    localStorage.setItem(KEY, JSON.stringify(db));
    if (!skipNotify && window.Cloud && Cloud.notifyChange) Cloud.notifyChange();
  }

  function coll(name) { return db[name] || []; }
  function get(col, id) {
    if (id == null) return null;
    var rows = coll(col);
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].id) === String(id)) return rows[i];
    }
    return null;
  }

  function add(col, row) {
    db.meta.seq[SEQKEY[col]] = (db.meta.seq[SEQKEY[col]] || 0) + 1;
    row.id = String(db.meta.seq[SEQKEY[col]]);
    if (col === 'empresas') row.fecha_alta = row.fecha_alta || today();
    db[col].push(row);
    save();
    return row;
  }

  function upd(col, id, patch) {
    var row = get(col, id);
    if (!row) return null;
    Object.keys(patch).forEach(function (k) { row[k] = patch[k]; });
    save();
    return row;
  }

  function del(col, id) {
    db[col] = coll(col).filter(function (r) { return String(r.id) !== String(id); });
    save();
  }

  function today() { return new Date().toISOString().slice(0, 10); }
  function nowLocal() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function exportJSON() { return JSON.stringify(db, null, 1); }

  function importJSON(text, skipNotify) {
    var d = JSON.parse(text);
    if (!d || !d.v) throw new Error('Archivo no válido');
    db = d; ensureMeta(); save(skipNotify); return db;
  }

  function reset() { db = empty(); save(); }

  function nextInfCode() {
    var d = new Date();
    if (d.getFullYear() !== db.meta.year) { db.meta.year = d.getFullYear(); db.meta.nextInf = 1; }
    var code = String(db.meta.nextInf).padStart(4, '0') + '-' + db.meta.year;
    db.meta.nextInf += 1; save();
    return code;
  }

  /* Datos de ejemplo para probar la app */
  function demo() {
    reset();
    var e = add('empresas', { razon_social: 'Clínica San Martín S.A.C.', ruc: '20512345678', direccion: 'Av. Los Alamos 450, Lima', telefono: '(01) 555 8899', email: 'soporte@sanmartin.com', persona_contacto: 'María Torres', cargo_contacto: 'Administradora', telefono_contacto: '999 111 222', rubro: 'Clínica', notas: 'Acceso por recepción. Horario 8:00-18:00.', activo: 'Si' });
    var e2 = add('empresas', { razon_social: 'Restaurante La Huerta', ruc: '20600998877', direccion: 'Jr. Bolognesi 120, Lima', telefono: '(01) 320 4567', email: 'info@lahuerta.pe', persona_contacto: 'Carlos Ríos', cargo_contacto: 'Gerente', telefono_contacto: '988 777 666', rubro: 'Restaurante', notas: '', activo: 'Si' });
    var q1 = add('equipos', { id_empresa: e.id, tipo_equipo: 'UPS', marca: 'APC', modelo: 'Smart-UPS 1500', nro_serie: 'AS-778899-01', ubicacion: 'Sala de servidores', fecha_instalacion: '2025-03-15', garantia_hasta: '2027-03-15', notas_equipo: 'Da soporte al servidor principal.', activo: 'Si' });
    var q2 = add('equipos', { id_empresa: e.id, tipo_equipo: 'Computadora', marca: 'Dell', modelo: 'OptiPlex 7010', nro_serie: 'DL-556677-02', ubicacion: 'Recepción', fecha_instalacion: '2025-06-01', garantia_hasta: '', notas_equipo: '', activo: 'Si' });
    var q3 = add('equipos', { id_empresa: e2.id, tipo_equipo: 'Punto de venta', marca: 'Hikari', modelo: 'POS-X9', nro_serie: 'HK-334455-03', ubicacion: 'Caja 1', fecha_instalacion: '', garantia_hasta: '', notas_equipo: 'Impresora térmica integrada.', activo: 'Si' });
    var t1 = add('tareas', { id_empresa: e.id, id_equipo: q1.id, tipo_tarea: 'Correctivo', prioridad: 'Alta', estado: 'Completada', descripcion_trabajo: 'UPS no mantiene la carga y se apaga con cortes breves.', novedad: 'La batería interna está hinchada y no retiene carga; el inversor trabaja pero la tensión cae.', trabajo_realizado: 'Se reemplazó el bloque de baterías y se limpió el polvo interno.', solucion: 'UPS operativo al 100%, mantiene 25 minutos de respaldo.', equipo_operativo: 'Sí', recomendaciones: 'Programar mantenimiento preventivo cada 6 meses.', tecnico_responsable: 'Tú', fecha_creacion: '2026-09-02', fecha_programada: '2026-09-04', fecha_inicio: '', fecha_fin: '', informe_emitido: false });
    var t2 = add('tareas', { id_empresa: e2.id, id_equipo: q3.id, tipo_tarea: 'Correctivo', prioridad: 'Media', estado: 'Pendiente', descripcion_trabajo: 'No imprime tickets, error de corte de papel.', novedad: '', trabajo_realizado: '', solucion: '', equipo_operativo: '', recomendaciones: '', tecnico_responsable: 'Tú', fecha_creacion: '2026-09-08', fecha_programada: '2026-09-11', fecha_inicio: '', fecha_fin: '', informe_emitido: false });
    add('repuestos', { id_tarea: t1.id, id_equipo: q1.id, descripcion_pieza: 'Bloque de baterías UPS APC RBC110', referencia: 'RBC110', cantidad: 1, precio_unitario: 420, proveedor: 'Distribuidora Andina', estado_pedido: 'Cambiado', fecha_pedido: '2026-09-03', fecha_llegada: '2026-09-04', notas_repuesto: '' });
    add('repuestos', { id_tarea: t2.id, id_equipo: q3.id, descripcion_pieza: 'Cabezal térmico impresora POS', referencia: 'HT-58MM', cantidad: 1, precio_unitario: 85, proveedor: 'Importec', estado_pedido: 'Por comprar', fecha_pedido: '', fecha_llegada: '', notas_repuesto: 'Confirmar modelo antes de comprar.' });
    return db;
  }

  load();
  return {
    get db() { return db; },
    load: load, save: save, coll: coll, get: get, add: add, upd: upd, del: del,
    today: today, nowLocal: nowLocal, exportJSON: exportJSON, importJSON: importJSON,
    reset: reset, nextInfCode: nextInfCode, demo: demo
  };
})();
