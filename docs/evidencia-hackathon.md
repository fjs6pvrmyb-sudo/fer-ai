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

## Fase 4A · FER AI Intelligence

**Trabajo previo al evento.** Commit `2fe860af88de49bd8881fc24f85b77395f60cf2c` en `work`, registrado el 19 de noviembre de 2026 a las 23:13 en Costa Rica (UTC−06:00).

- **Consulta autorizada.** `src/modules/intelligence` interpreta preguntas con un plan cerrado, valida fechas y alcance y prepara respuestas con indicadores y fuentes. La migración `20261120000400_intelligence.sql` incorpora el ranking acotado, la cuota transaccional por actor y el registro sin texto de conversaciones. Se reaplicaron las cinco migraciones desde cero.
- **Demostración.** Playwright en Chromium móvil consultó ventas por ₡5.000 y cobros por SINPE por ₡2.000 en Panadería Demo. Encontró un cobro pendiente de verificar. Cafetería Demo devolvió sus propios ₡1.800 en ventas y ₡1.000 cobrados. La prueba rechazó la consulta cruzada, verificó el cambio de contexto y confirmó que el dashboard siguió disponible tras simular una interrupción. Genera `intelligence-movil.png` en `test-results/`.
- **Resultados.** Pasaron TypeScript, lint y build, 25 pruebas Vitest, 18 de integración con PostgreSQL y Auth, 2 de reversión SQL y 8 recorridos Playwright en total. La auditoría npm de dependencias de producción reportó 0 vulnerabilidades. El recorrido deshabilitado se ejecutó por separado de la suite demo.
- **Uso de IA.** Codex generó la implementación y ejecutó sus verificaciones. La interpretación en la demo es determinista y las cifras salen de PostgreSQL. El adaptador OpenAI usa SDK 7.62.0 y Responses API con Structured Outputs. El entorno carecía de configuración autorizada para una llamada externa y queda pendiente esa verificación.

## Respaldo con autoría privada

Los nueve commits posteriores a la línea base se reconstruyeron con la dirección privada de GitHub en los campos de autor y committer. Se preservaron los nombres, las fechas con su zona horaria, los mensajes, el orden y el árbol de archivos de cada commit. El commit inicial mantiene su SHA. Las referencias de las fases anteriores identifican los commits originales y la tabla vincula sus equivalentes reconstruidos.

La clasificación de las fases 1 a 4A como trabajo previo al hackathon se mantiene según las fechas originales. Este registro documenta el respaldo.

| SHA original                               | SHA reconstruido                           |
| ------------------------------------------ | ------------------------------------------ |
| `1a1ad4cc7dcd9ddca9bb75e595ad65addf5c61c4` | `d4f7ef26a60ca8658ee2012494ab455bcf37df43` |
| `8a76c0d93d201c22667675ba98ce1a3cb9537d8e` | `dcd62fbcb19423334e8b5b59e6583a961c79c07f` |
| `a4f6b468134482ca98790e76b7699d284d0a43c3` | `be738b0ac08509ad0304fdc385cbd5fe6fb5488a` |
| `4ac483dae95bd37cd3da6b15a1d88f1103a19f4e` | `56dda65fd2e8de011c68a5925cc27a1f79c15746` |
| `b97e9bf038528e453b282f6125f5aa89d5a8b762` | `87f0b3fe1c58c173255eaa7543cdd9eea2021348` |
| `9d6aedc215cbe4906a724f9d57e662e9464d70cc` | `3500fcc20e69f60c08346ca7245911467a252e39` |
| `d4be6960bc3d58d589f23e665bc6e7c446a0d274` | `f5be83d8229ba50641a2f7aaeff18157e4833690` |
| `2fe860af88de49bd8881fc24f85b77395f60cf2c` | `72e8361507f33e9bc54420500b9349e8fbbcb1cc` |
| `4ee2ebe5a37a236fc0ae6a7b018ac16c380c4e7f` | `5bce31aafc1c0c5c95399e34c3463df43c576e96` |

## Fase 4B · Ventas conversacionales

**Trabajo del evento.** La implementación parte de `d2593e0e9693bf062779cdf8d3e6fd4442a1cf7d`, que conserva el trabajo previo hasta la Fase 4A y su registro de autoría. El commit de código `efbc5626c5891430aa6e21b534f7a7ed1f80e981` se registró el 20 de noviembre de 2026 a las 10:38:26 en Costa Rica (UTC−06:00).

- **Implementación.** `src/modules/conversation` extrae datos con un contrato cerrado, resuelve el catálogo de la empresa y calcula importes con el motor financiero. `src/app/(secure)/empresas/[org]/intelligence` integra las ventas con las consultas gerenciales. Los operadores acceden a la misma captura desde **Registrar venta → Preparar con FER**. La migración `20261120000500_conversational_sales.sql` guarda borradores por empresa y propietario y exige una revisión vigente y una confirmación humana antes de invocar `confirm_sale`.
- **Demostración.** En Panadería Demo se preparó y confirmó una venta de ₡5.000, con ₡2.000 por SINPE y ₡3.000 pendientes. El escenario comprobó que el borrador y la revisión no cambiaron el historial y que la venta confirmada se pudo consultar desde el asistente y el dashboard. Se verificaron correcciones, pago dividido, catálogo y confirmación de una venta de ₡1.800 en Cafetería Demo, y acceso al registro manual ante una interrupción simulada. [Recorrido reproducible con datos ficticios](../README.md#venta-conversacional--recorrido-dojo).
- **Seguridad y atomicidad.** `scripts/test-conversation.mjs` cubre empresas y propietarios distintos, sesión expirada, permisos revocados, precios desactualizados y borradores vencidos. Cinco solicitudes concurrentes de confirmación devolvieron la misma venta. `tests/conversation-rollback.sql` provocó un fallo de auditoría y verificó la reversión completa.
- **Verificación local.** Se aplicaron seis migraciones desde una base limpia. Pasaron TypeScript, lint, compilación, 40 pruebas Vitest, 25 pruebas de integración con PostgreSQL y Auth, 3 comprobaciones de reversión SQL y 11 recorridos Playwright con Chromium. El recorrido con asistente deshabilitado se ejecutó por separado de los diez recorridos con configuración demo.
- **Capturas.** `tests/e2e/conversation.spec.ts` genera `01-conversacion-y-borrador-movil.png`, `02-confirmacion-movil.png`, `03-resultado-movil.png` y `04-consulta-posterior-movil.png` en `test-results/`, con datos ficticios.
- **Uso de IA.** Codex implementó el código, las pruebas y la documentación y ejecutó la verificación local. El asistente se validó con interpretación determinista en modo demo. El adaptador externo usa el SDK oficial OpenAI 7.62.0, Responses API y Structured Outputs. La llamada externa queda pendiente de verificación con clave y modelo autorizados.

## Fase 5 · Preparación de la demostración

**Trabajo del evento.** Commit `381dae0be117ca33af8611bd60471c6276f8f84f`, registrado el 20 de noviembre de 2026 a las 11:42:09 en Costa Rica (UTC−06:00). Parte de la Fase 4B en `872f26cd32e2867ca253884389b1f101b030bb7f`. El último respaldo remoto observado permanece en `d2593e0e9693bf062779cdf8d3e6fd4442a1cf7d`. Las fases previas al evento conservan su clasificación y su historial.

- **Experiencia.** El campo de mensaje queda visible al entrar, el foco va al nuevo resultado y el formulario conserva la instrucción tras una interrupción. El dashboard ofrece acceso directo a la captura conversacional. Los ejemplos usan el catálogo de la empresa activa. Las pruebas en móvil y escritorio verificaron ventas manuales, borradores, revisión, confirmación, historial, dashboard, consulta gerencial y cambio de organización. La unidad monetaria y el catálogo admiten representar un servicio ficticio en USD con un medio de pago propio.
- **IA.** El adaptador compartido descarta rechazos, mensajes parciales, salidas inesperadas y JSON inválido. Pasaron las pruebas del SDK con transporte controlado y los recorridos con el proveedor demo. El entorno carecía de modelo y clave autorizados. Queda pendiente la comprobación real de ambos contratos en OpenAI. [Matriz y límites de consumo](openai-validacion.md).
- **Pruebas.** Pasaron la instalación con `npm ci` en un directorio temporal, TypeScript, lint, compilación, seis migraciones desde cero, 52 pruebas unitarias, 25 pruebas de integración PostgreSQL y Auth, tres comprobaciones de reversión SQL y 13 pruebas Playwright en Chromium. Se verificó el SQL para la cuenta presentadora mediante una transacción local que se revirtió. La auditoría npm de producción reportó cero vulnerabilidades.
- **Auditoría Git.** La revisión local cubrió los archivos alcanzables desde `work`, valores sensibles del entorno local y los metadatos posteriores a `5c6e878`. No aparecieron credenciales, bases locales ni archivos de entorno privados en el contenido versionado. Los commits posteriores a la línea base usan una dirección privada de GitHub. El commit inicial conserva su autoría histórica, que incluye una dirección relay. `git ls-remote` confirmó los SHA de ambas ramas. La API autenticada de GitHub devolvió HTTP 403 al intentar reconfirmar la visibilidad desde este entorno.
- **Dojo.** [Guion de tres minutos](dojo-demo.md) con datos ficticios y alternativa manual. Playwright genera cinco capturas por tamaño con los prefijos `01` a `05` bajo `test-results/`. La [guía de demo aislada](demo-alojada.md) se preparó sin desplegar ni crear proyectos externos.
- **Uso de IA.** Codex implementó y verificó localmente los cambios. Los recorridos que calculan y registran ventas usan la base ficticia y el proveedor determinista.

### Restauración del respaldo incremental

El bundle local contiene solo `refs/heads/work` y requiere como base `d2593e0`, ya presente en el remoto. Para comprobarlo en un repositorio que ya tenga esa base, ejecutá `git bundle verify /ruta/FERIA-work.bundle`. Para inspeccionarlo sin cambiar la rama actual, ejecutá `git fetch /ruta/FERIA-work.bundle refs/heads/work:refs/heads/recuperacion-feria` y compará ese SHA con el de la entrega. Una publicación futura requiere reconfirmar la visibilidad privada y autorizar específicamente el push de `work`.
