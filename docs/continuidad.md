# Continuidad de FER AI Core

## Decisiones de la primera construcción

- El servidor obtiene la identidad de Supabase Auth y consulta la membresía activa. El frontend usa la sesión del usuario para acceder a PostgREST. RLS limita las lecturas, las claves compuestas validan referencias y las funciones de escritura vuelven a comprobar la autorización. Solo el provisionamiento local y las comprobaciones administrativas de prueba usan la clave privilegiada.
- Venta, líneas, pagos y evento de auditoría se confirman en una sola transacción. La idempotencia usa la clave de solicitud de la operación dentro de la organización y el actor. Una repetición con otro contenido devuelve conflicto. Una confirmación valida la versión de precio que se revisó y calcula el total con el catálogo vigente.
- El dinero viaja en cadenas de unidades menores. PostgreSQL usa `bigint` en cada importe persistido y `numeric` entero en sumas intermedias. La interfaz usa `bigint` y conserva moneda y escala.
- Las escrituras se serializan por organización para coordinar confirmaciones, cambios de precio y revocaciones en la primera versión. Cuando haya volumen de escrituras concurrentes, evaluar un bloqueo más granular por jornada y venta, con orden común de adquisición.
- El historial inicial muestra las 50 ventas más recientes. El catálogo y el selector de venta cargan hasta 200 productos. La configuración de membresías usa el identificador de una cuenta existente. La paginación y la búsqueda pueden incorporarse según volumen y necesidades de administración.

- ESLint 9 sigue fijado por compatibilidad con los plugins de importaciones, accesibilidad y React del preset de Next.js. npm advierte que esa rama del linter dejó de recibir soporte. Actualizalo cuando esos plugins admitan ESLint 10 de forma conjunta.

## Cobros posteriores

- Gerentes y administradores pueden aplicar un cobro a una venta confirmada. La jornada del cobro se obtiene de la zona horaria de la empresa en la base. El movimiento conserva fecha efectiva, fecha de registro y actor. La app registra cobros de la jornada actual.
- El RPC bloquea organización, venta y jornada en ese orden. Recalcula el saldo antes de grabar y guarda pago, solicitud idempotente y auditoría en la misma transacción. La clave pertenece al actor y a la empresa dentro de la operación de cobro.
- Un reintento equivalente recupera el cobro y el saldo inmediatamente posterior a ese pago. El detalle e historial muestran el saldo actual. Si falla la conexión, el formulario conserva el mismo intento mientras la página siga abierta.

## Cierres y conciliación

- `operations_metrics` agrupa ventas por fecha de venta y cobros por fecha de cobro. Calcula el saldo de la empresa al corte con todos los movimientos hasta la fecha final. El filtro abarca hasta 366 días inclusivos.
- `start_day_close` pone una jornada en revisión. `complete_day_close` usa el mismo bloqueo por organización que ventas y cobros, y vuelve a calcular las cifras. La versión revisada debe coincidir. La jornada y su instantánea se persisten junto con la auditoría. Repetir el cierre devuelve el identificador existente y las operaciones de la app carecen de permisos para editar la instantánea.
- El efectivo esperado solo incluye cobros en efectivo. El conteo y su diferencia quedan nulos cuando falta el conteo. El cierre guarda los pendientes documentales del momento y la jornada muestra por separado el estado actual.
- `save_payment_evidence` permite revisar una referencia por movimiento, con auditoría antes y después. El estado documental se deriva de los movimientos y sus referencias actuales. La revisión permanece disponible para jornadas cerradas. Se admiten referencias de texto, sin archivos.

## FER AI Intelligence

- El proveedor interpreta la pregunta en un plan tipado de una lista cerrada. La capa de consultas vincula todas las lecturas a la empresa activa y a la sesión autenticada. No se envían al proveedor filas, nombres del catálogo, referencias documentales, credenciales ni conversaciones anteriores. El texto de la pregunta sí se envía en modo OpenAI.
- El servidor resuelve fechas en la zona contable de la empresa, valida los períodos y conserva los importes exactos. Las explicaciones, las fuentes y hasta tres recomendaciones provienen de reglas deterministas. El ranking devuelve hasta cinco productos con sus nombres actuales.
- PostgreSQL reserva hasta 8 consultas por minuto y 60 por día por actor, compartidas entre sus empresas. El registro técnico incluye actor, empresa, modelo, tipo de consulta, estado y tokens disponibles. Las reservas purgan registros del actor de más de 30 días. El historial de mensajes solo existe en memoria de la página.
- La empresa activa aporta nombre, moneda y zona horaria. Las capacidades de lectura y los medios corresponden a los módulos actuales. Las fechas ambiguas, la cobertura incompleta y la falta de datos se muestran explícitamente.

## Ventas conversacionales

- `src/modules/conversation` extrae fragmentos literales con un contrato cerrado. El proveedor recibe únicamente el mensaje y si existe un borrador, sin catálogo, IDs ni credenciales. Coincidencias únicas exactas o normalizadas se resuelven en el catálogo de la empresa. Las coincidencias parciales se ofrecen como candidatos para selección humana.
- `conversational_sale_drafts` guarda campos estructurados del borrador por empresa y actor, sin guardar el texto completo ni reutilizar conversaciones entre empresas. Un borrador vence a los 30 minutos. Se oculta al vencer y al crear otro se purgan los registros del mismo usuario y empresa de más de un día. Al cancelar o confirmar se borra inmediatamente el documento. La observación, si existe, se usa en la revisión y no forma parte del asiento financiero.
- Un cambio incrementa la revisión. La etapa de revisión conserva la versión de precio y los importes validados con los contratos financieros existentes. La confirmación revalida la membresía, la revisión, la jornada y el catálogo; solo recibe el identificador y la revisión del borrador. Dentro de la misma transacción llama a `confirm_sale` con una clave idempotente estable y añade el evento de auditoría conversacional. Un reintento confirmado recupera la venta original mientras se conserve su referencia.
- Las operaciones conversacionales comparten la cuota de 8 consultas por minuto y 60 por día por actor con las consultas gerenciales. Los operadores conservan el permiso de venta manual y pueden preparar y confirmar sus propios borradores. Los permisos de lectura gerencial siguen dependiendo del rol.
- El adaptador demo resuelve frases típicas, correcciones de cantidad, pagos por medio y aclaraciones simples. La operación actual admite cantidades enteras, moneda de la empresa y los medios del motor de pagos autorizados para la empresa por `conversational_payment_methods` (los tres medios actuales por defecto). Una configuración distinta se aplica a la captura conversacional sin cambiar el formulario manual de esta fase. Descuentos, vuelto, facturación, anulaciones y gastos quedan fuera del contrato. El SDK de OpenAI usa Structured Outputs, el modelo configurado, un máximo de 1.200 tokens para extracción y un límite de 8 segundos sin reintentos automáticos.

## Pendientes y siguiente fase

- **Ajustes posteriores.** Diseñar movimientos compensatorios con organización, origen, importe exacto, motivo, actor y clave idempotente. Aplicarlos en jornadas abiertas bajo el mismo orden de bloqueo. Incorporar los ajustes en los cortes futuros y preservar las instantáneas ya guardadas.
- **Caja.** Incorporar fondo inicial, retiros y otros movimientos solo cuando exista su modelo de datos. La diferencia actual se compara con el efectivo de los cobros registrados.
- **Proveedor externo.** Verificar el modelo OpenAI con credenciales autorizadas y datos ficticios antes de habilitarlo para un piloto.
