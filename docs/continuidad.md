# Continuidad de FER AI Core

## Decisiones de la primera construcción

- El servidor obtiene la identidad de Supabase Auth y consulta la membresía activa. El frontend usa la sesión del usuario para acceder a PostgREST. RLS limita las lecturas, las claves compuestas validan referencias y las funciones de escritura vuelven a comprobar la autorización. Solo el provisionamiento local y las comprobaciones administrativas de prueba usan la clave privilegiada.
- Venta, líneas, pagos y evento de auditoría se confirman en una sola transacción. La idempotencia usa la clave de solicitud de la operación dentro de la organización y el actor. Una repetición con otro contenido devuelve conflicto. Una confirmación valida la versión de precio que se revisó y calcula el total con el catálogo vigente.
- El dinero viaja en cadenas de unidades menores. PostgreSQL usa `bigint` en cada importe persistido y `numeric` entero en sumas intermedias. La interfaz usa `bigint` y conserva moneda y escala.
- Las escrituras se serializan por organización para coordinar confirmaciones, cambios de precio y revocaciones en la primera versión. Cuando haya volumen de escrituras concurrentes, evaluar un bloqueo más granular por jornada y venta, con orden común de adquisición.
- El historial inicial muestra las 50 ventas más recientes. El catálogo y el selector de venta cargan hasta 200 productos. La configuración de membresías usa el identificador de una cuenta existente. La paginación y la búsqueda pueden incorporarse según volumen y necesidades de administración.

- ESLint 9 sigue fijado por compatibilidad con los plugins de importaciones, accesibilidad y React del preset de Next.js. npm advierte que esa rama del linter dejó de recibir soporte. Actualizalo cuando esos plugins admitan ESLint 10 de forma conjunta.

## Contratos para la siguiente fase

| Dominio            | Responsabilidad prevista                                                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cobros posteriores | Aplicar un pago a una venta existente con una clave idempotente propia. Bloquear la venta, calcular el saldo y validar organización, moneda, permisos y jornada de cobro. El esquema de pagos admite una jornada distinta. |
| Cierre y ajustes   | Tomar una instantánea reproducible coordinada con las escrituras de la jornada. Registrar correcciones como compensaciones autorizadas con motivo y referencias, preservando el cierre original.                           |
| Conciliación       | Vincular evidencia a un movimiento existente y versionar las revisiones. Distinguir cobros registrados, verificados, efectivo contado y diferencias.                                                                       |
| Reportes           | Agregar por jornada de venta y de cobro, con saldos históricos a fecha de corte. El panel actual resume las ventas, los pagos y los saldos acumulados de la empresa.                                                       |
| Asistente          | Traducir texto a borrador estructurado y reutilizar validación, revisión y confirmación. Exponer al asistente gerencial únicamente consultas predefinidas de lectura.                                                      |
