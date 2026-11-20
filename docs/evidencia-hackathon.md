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
