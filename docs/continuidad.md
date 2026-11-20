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

## Contratos para la siguiente fase

| Dominio          | Responsabilidad prevista                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cierre y ajustes | Tomar una instantánea reproducible coordinada con las escrituras de la jornada. Registrar correcciones como compensaciones autorizadas con motivo y referencias, preservando el cierre original. |
| Conciliación     | Vincular evidencia a un movimiento existente y versionar las revisiones. Distinguir cobros registrados, verificados, efectivo contado y diferencias.                                             |
| Reportes         | Agregar por jornada de venta y de cobro, con saldos históricos a fecha de corte. El panel actual resume las ventas, los pagos y los saldos acumulados de la empresa.                             |
| Asistente        | Traducir texto a borrador estructurado y reutilizar validación, revisión y confirmación. Exponer al asistente gerencial únicamente consultas predefinidas de lectura.                            |
