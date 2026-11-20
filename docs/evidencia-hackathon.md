# Línea base y evidencia del Dojo AI Hackathon

**Trabajo previo al evento.** Construcción verificada el 19 de noviembre de 2026 en Costa Rica (UTC−06:00). El período informado del evento es del 20 al 22 de noviembre. Declarar como trabajo previo tanto la arquitectura de las fases 0 y 0.1 como la implementación y las pruebas registradas aquí.

- Rama local `work`.
- Línea base `5c6e878249acc84f8aaf56297892cc59b200892f`. Contenía solo `README.md` con el encabezado `# FERIA`.
- Código verificado `1a1ad4cc7dcd9ddca9bb75e595ad65addf5c61c4`, registrado a las 22:13 hora de Costa Rica.
- La comparación entre ambos commits identifica los archivos incorporados antes del evento.

| Bloque                          | Archivos principales                                                                                             | Verificación en el commit de código                                                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fundación                       | `package.json`, `package-lock.json`, `tsconfig.json`, `AGENTS.md` y `README.md`                                  | `npm ci`, `npm run typecheck`, `npm run lint`, `npm run build` y `npm audit`. El registro no reportó vulnerabilidades.                                                   |
| Identidad, catálogo y seguridad | `src/modules/auth`, `src/modules/organizations`, `src/modules/catalog`, `supabase/migrations` y semilla ficticia | Reinicio local desde cero más seis pruebas contra Auth, PostgREST y PostgreSQL. Incluyen revocación, roles, RLS, integridad entre organizaciones e historial de precios. |
| Interfaz                        | `src/app`, `src/components` y `tests/e2e/workspace.spec.ts`                                                      | Tres pruebas Playwright con Chromium, incluidas sesión, cookies, navegación móvil, estados y detalle ajeno rechazado.                                                    |
| Venta y pagos                   | `src/modules/sales`, `src/modules/payments`, `src/modules/shared/money.ts` y migración de ventas                 | Once pruebas Vitest, confirmación concurrente por HTTP y reversión forzada al fallar la auditoría en PostgreSQL.                                                         |

**Escenario demostrado.** Una venta ficticia de ₡5.000 y un pago de ₡2.000 dejan un saldo de ₡3.000. El navegador recupera el mismo identificador en el historial. Cinco confirmaciones idénticas en paralelo devuelven un solo identificador en PostgreSQL. La prueba móvil genera `venta-parcial-movil.png` en el directorio local `test-results/`.

**Condición del entorno.** El control de salud interno de GoTrue recibió HTTP 403 del proxy de contenedores. La solicitud directa a `/auth/v1/health` respondió HTTP 200. Las pruebas se ejecutaron después de `db:reset` y `demo:seed` con el servicio real. El README documenta el arranque correspondiente.

**Uso de IA.** Codex generó el código, las migraciones, las pruebas y la documentación y ejecutó su verificación. La aplicación todavía carece de un asistente conectado a OpenAI. Los cobros posteriores, cierres, compensaciones y conciliación quedan descritos en [el documento de continuidad](continuidad.md).

**Estabilidad del arranque de desarrollo.** `next.config.ts` deshabilita la edición automática de `AGENTS.md` por Next.js. Se comprobó que `npm run dev` respondió con HTTP 200 en `/acceso` y preservó el archivo de instrucciones.

## Fase 2 · Cobros posteriores

**Trabajo previo al evento.** Commit `4ac483dae95bd37cd3da6b15a1d88f1103a19f4e` en `work`, registrado el 19 de noviembre de 2026 a las 22:37 en Costa Rica (UTC−06:00).

- **Base de datos.** `20261120000200_collect_payment.sql` agrega el RPC `collect_payment` y la persistencia de solicitudes idempotentes. El reinicio de Supabase local aplicó las tres migraciones desde una base limpia.
- **Escenario de dos jornadas.** `scripts/test-collections.mjs` comprobó una venta de ₡5.000 con ₡2.000 por SINPE en la jornada histórica controlada y ₡3.000 en la jornada de cobro. Quedaron una venta, dos movimientos y saldo de ₡0. Las dos solicitudes simultáneas produjeron un éxito y un rechazo por saldo insuficiente. Un reintento devolvió el mismo identificador de cobro.
- **Atomicidad y permisos.** La prueba SQL forzó un fallo de auditoría y verificó la reversión del pago y la solicitud. Las pruebas con Auth y PostgreSQL verificaron el rechazo de roles insuficientes, tokens inválidos, referencias ajenas y escrituras directas.
- **Interfaz.** `tests/e2e/collection.spec.ts` verificó el error de saldo, el registro del cobro y la actualización del historial desde Chromium móvil. La captura local `cobro-posterior-movil.png` se genera dentro de `test-results/`.
- **Resultados.** Build, TypeScript y lint aprobados. Pasaron 11 pruebas Vitest, 10 de integración con Auth/PostgreSQL (6 existentes y 4 de cobros), 2 comprobaciones de reversión SQL y 4 pruebas Playwright.
- **Uso de IA.** Codex implementó el RPC, la interfaz, las pruebas y la documentación y ejecutó las verificaciones locales.

## Fase 3 · Jornadas, cierres y conciliación

**Trabajo previo al evento.** Commit `9d6aedc215cbe4906a724f9d57e662e9464d70cc` en `work`, registrado el 19 de noviembre de 2026 a las 22:51 en Costa Rica (UTC−06:00).

- **Cierre.** `20261120000300_operations.sql` agrega la instantánea por jornada, el conteo opcional, el control de versión y los RPC `day_review`, `start_day_close` y `complete_day_close`. Las cuatro migraciones se aplicaron desde una base limpia.
- **Conciliación y dashboard.** La misma migración agrega referencias documentales, auditoría de revisión, RLS y `operations_metrics`. Las pantallas consumen las consultas autorizadas de PostgreSQL. El dashboard filtra por fecha o período y distingue ventas, cobros y saldo histórico.
- **Escenario de dos jornadas.** `npm run test:operations` verificó una venta de ₡5.000 y un cobro inicial de ₡2.000 en la jornada A. El cierre conservó ₡3.000 pendientes y un pago sin comprobar. En la jornada B se cobraron y verificaron ₡3.000. Quedaron una venta, dos pagos y saldo actual de ₡0. La instantánea de A conservó sus cifras incluso tras verificar posteriormente su evidencia.
- **Pruebas.** Build, TypeScript y lint aprobados. Pasaron 11 pruebas Vitest, 15 de integración con PostgreSQL y Auth, 2 de reversión transaccional de fases anteriores y 5 de Playwright. Las pruebas nuevas incluyen ventas y cobros concurrentes con el cierre, revisión desactualizada, conteo cero y pendiente, sesión expirada, aislamiento y recorrido móvil.
- **Capturas.** Playwright genera `cierre-operativo-movil.png`, `conciliacion-movil.png` y `dashboard-gerencial-movil.png` en `test-results/`, con fechas controladas y datos ficticios.
- **Uso de IA.** Codex implementó las migraciones, las pantallas, las pruebas y la documentación y ejecutó la verificación local. Los ajustes históricos y la integración de IA en la aplicación siguen pendientes.
