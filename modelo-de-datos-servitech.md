# Modelo de datos — App de soporte técnico (Servitech)

Documento base para construir la app: fichas editables, banco de tareas, repuestos e informes de servicio con firma y envío.

## Reglas generales

- Cada registro tiene un **ID automático** (nunca se reutiliza ni se muestra al usuario).
- La ficha **Empresa y Equipos son editables** en cualquier momento; la edición afecta solo a los informes **futuros**. Los informes ya firmados conservan una copia (instantánea) de los datos de ese día.
- Nada se borra de forma definitiva: las bajas usan el campo *Activo (sí/no)* para conservar el historial.
- El informe se genera **solo** desde los datos de Empresa + Equipo + Tarea + Repuestos: nunca se reescriben a mano.
- Moneda e identificador fiscal configurables (RUC; etiqueta renombrable si se atiende otro país).

---

## 1. Ficha Empresa (clientes)

| Campo | Tipo | ¿Requerido? | Notas |
|---|---|---|---|
| id_empresa | ID automático | Sí | interno |
| razon_social | Texto | Sí | nombre legal de la empresa |
| ruc | Texto | Sí | único; 11–13 dígitos según país (ej. 11 en Perú) |
| direccion | Texto | No | sede donde se da el servicio |
| telefono | Texto | No | línea principal |
| email | Email | No | usado para envío del informe |
| persona_contacto | Texto | No | responsable que atiende y firma |
| cargo_contacto | Texto | No | cargo de esa persona |
| telefono_contacto | Texto | No | móvil directo |
| rubro | Categoría | No | oficina, clínica, restaurante, retail… (para filtrar) |
| notas | Texto largo | No | accesos, horarios, observaciones internas |
| fecha_alta | Fecha (auto) | — | se registra sola |
| activo | Sí/No | Sí | Sí = cliente vigente; No = baja sin borrar |

---

## 2. Ficha Equipos (activos por empresa)

| Campo | Tipo | ¿Requerido? | Notas |
|---|---|---|---|
| id_equipo | ID automático | Sí | interno |
| id_empresa | Relación → Empresa | Sí | de quién es el equipo |
| tipo_equipo | Categoría | No | UPS, PC, laptop, impresora, red/WiFi, CCTV, punto de venta, otro |
| marca | Texto | No | — |
| modelo | Texto | No | — |
| nro_serie | Texto | No | **clave para buscar** rápido |
| usuario | Texto | No | quién usa el equipo (Ej: Recepción, Juan Pérez) |
| ubicacion | Texto | No | piso, oficina. Ya **no se pide en el formulario** (redundante con la dirección de la empresa): se conserva y se sigue mostrando en los equipos antiguos que lo tengan |
| ubicacion_empresa | Texto | No | sede / sucursal. Ya **no se pide en el formulario** (redundante con la dirección de la empresa): se conserva y se sigue mostrando en los equipos antiguos que lo tengan |
| fecha_instalacion | Fecha | No | — |
| garantia_hasta | Fecha | No | alerta opcional de garantía |
| notas_equipo | Texto largo | No | configuraciones, contraseñas internas |
| activo | Sí/No | Sí | en servicio o retirado |

---

## 3. Ficha Tareas / Órdenes de servicio (banco de tareas)

| Campo | Tipo | ¿Requerido? | Notas |
|---|---|---|---|
| id_tarea | ID automático (T-0001…) | Sí | visible para referenciar |
| id_empresa | Relación → Empresa | Sí | a quién se le trabaja |
| id_equipo | Relación → Equipo | No | vacío si el servicio no es sobre un equipo |
| tipo_tarea | Categoría | Sí | correctivo, preventivo, instalación, retiro, otro |
| prioridad | Categoría | No | baja, media, alta, urgente |
| estado | Categoría | Sí | pendiente, en curso, esperando repuestos, completada, cancelada |
| descripcion_trabajo | Texto largo | Sí | qué hay que hacer / pedido del cliente |
| novedad | Texto largo | No | **lo que se encontró** (sección 2 del informe) |
| trabajo_realizado | Texto largo | No | **lo que se hizo**. En el formulario es el campo único «Trabajo Realizado / Solución de Servicio» |
| solucion | Texto largo | No | solución / estado final. Ya **no se pide en el formulario** del servicio (se unificó con `trabajo_realizado`): se conserva y se sigue mostrando en los servicios antiguos. El informe tiene su propio campo `solucion` |
| equipo_operativo | Sí/No | No | quedó funcionando o no |
| recomendaciones | Texto largo | No | para el cliente |
| tecnico_responsable | Texto | Sí | tu nombre (o del técnico, si hay equipo) |
| fecha_creacion | Fecha-hora (auto) | — | cuándo se creó la tarea |
| fecha_programada | Fecha | No | cuándo se atenderá |
| fecha_inicio | Fecha-hora | No | llegada al sitio |
| fecha_fin | Fecha-hora | No | cierre real |
| informe_emitido | Sí/No | Sí | lo pone el propio informe al emitirse (`true`) o al eliminarse (`false`). Ya no se elige a mano: antes había un selector «Estado del informe» que reiniciaba la marca al editar el servicio |
| fotos | Imágenes (varias) | No | antes / durante / después, por tarea |

---

## 4. Ficha Repuestos (cambiados y por comprar)

| Campo | Tipo | ¿Requerido? | Notas |
|---|---|---|---|
| id_repuesto | ID automático | Sí | interno |
| id_tarea | Relación → Tarea | No | vacío si es compra anticipada |
| id_equipo | Relación → Equipo | No | equipo al que irá |
| descripcion_pieza | Texto | Sí | ej. "fuente de poder 500W", "batería UPS" |
| referencia | Texto | No | código del fabricante |
| cantidad | Número | Sí | — |
| precio_unitario | Número (moneda) | No | S/ o US$ según país |
| proveedor | Texto | No | dónde se compra |
| estado_pedido | Categoría | Sí | **por comprar, pedido, recibido, cambiado** |
| fecha_pedido | Fecha | No | — |
| fecha_llegada | Fecha | No | — |
| notas_repuesto | Texto largo | No | — |

**Regla útil:** el filtro *estado_pedido = por comprar* alimenta tu lista de compras pendientes; al cambiarlo a *cambiado*, ese repuesto entra automáticamente en la sección de repuestos del informe.

---

## 5. Informe de servicio (documento de cierre + envío)

Se genera al cerrar la tarea con firma. Guarda una **copia instantánea** (no cambia si después editas la empresa).

| Campo | Tipo | ¿Requerido? | Origen |
|---|---|---|---|
| id_informe | N° correlativo anual (0001-2026) | Sí | automático |
| id_tarea | Relación → Tarea | Sí | — |
| fecha_emision | Fecha-hora (auto) | — | — |
| tecnico | Texto | Sí | copia del técnico |
| Empresa: razon_social, ruc, direccion, persona_contacto | Texto (copia) | Sí | de la Ficha Empresa al momento del cierre |
| Equipo: tipo, marca, modelo, nro_serie | Texto (copia) | No | de la Ficha Equipo al momento del cierre |
| novedad | Texto largo | No | de la Tarea (sección 2) |
| trabajo_realizado | Texto largo | No | de la Tarea (sección 3) |
| repuestos_cambiados | Lista (pieza, cantidad, precio, total) | No | de la Ficha Repuestos con estado = cambiado |
| solucion | Texto largo | No | de la Tarea (sección 4) |
| nombre_responsable | Texto | Sí | quien confirma en el cliente |
| cargo_responsable | Texto | No | — |
| firma_responsable | Imagen (firma) | Sí | **obligatoria para cerrar** |
| firma_tecnico | Imagen (firma) | Sí | la tuya |
| enviado_a | Email / WhatsApp | No | cómo y a dónde se envió |
| fecha_envio | Fecha-hora | No | — |
| pdf | Archivo PDF | Sí | generado y archivado |

> **El informe no cobra.** No pide ni imprime monto: es solo el documento técnico. El importe del servicio se establece al cerrarlo, en el propio servicio (campo *Costo de mano de obra / servicio*, que sigue estando desde que se crea) y en el módulo **Costos**. Los informes antiguos que ya tenían `monto` guardado lo siguen mostrando, porque son documentos ya emitidos.

---

## Flujo de cierre (regla de negocio)

1. Tarea en curso → se registran novedad, trabajo realizado, solución y repuestos.
2. Se captura la **firma del responsable** en el sitio del cliente (y la del técnico).
3. El sistema genera el **PDF** con numeración correlativa.
4. Se envía al responsable (email y/o WhatsApp) y queda **archivado en el historial** de la empresa y del equipo.
5. Recién ahí la tarea pasa a **completada**.

Sin firma del responsable → la tarea no se puede cerrar como completada.

## Sugerencias de implementación

- **Offline primero:** en terreno no siempre hay señal; la app debe funcionar sin internet y sincronizar al volver a tener cobertura.
- **Buscador global:** por razón social, RUC, N° de serie o ID de tarea.
- **Listas de compras:** vista única con repuestos *por comprar* de todas las tareas.
- **Historial por empresa:** un clic y se ven todos los equipos, tareas e informes de ese cliente.
- **Escalable a varios técnicos:** el campo *tecnico_responsable* ya está previsto; luego se agregan cuentas, permisos por rol y asignación de tareas.
- **Recordatorios (fase 2):** mantenimiento preventivo periódico → generar tarea pendiente automáticamente.
