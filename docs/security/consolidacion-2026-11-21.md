# Consolidación Web, Core y seguridad

Verificación del 21 de noviembre de 2026 en Costa Rica, durante el Dojo AI Hackathon. Esta revisión parte de `e3b67e4c66c081b928ca396b6ade529938408154`. La evidencia de las fases anteriores conserva su clasificación original.

## Pull requests y CI

| PR                                                                      | Base verificada por SHA                    | Head verificado por SHA                    | Referencia de integración de GitHub        |
| ----------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| [#3 · Hardening](https://github.com/fjs6pvrmyb-sudo/FERIA/pull/3)       | `531da20117f9abee29fc095c10fef404b6ecafed` | `e3b67e4c66c081b928ca396b6ade529938408154` | `7645ee25f8d136bb3dbed59def4617c098468a44` |
| [#2 · Línea base ASVS](https://github.com/fjs6pvrmyb-sudo/FERIA/pull/2) | `591d1f7567d9b1730059a193eca4dade55cb33fe` | `531da20117f9abee29fc095c10fef404b6ecafed` | `f962a02a2555fde66f08880342c0e7c74c2c6d11` |
| [#1 · Web y Core](https://github.com/fjs6pvrmyb-sudo/FERIA/pull/1)      | `4019141d40ff53079d05f81b07d3c897a95def2a` | `591d1f7567d9b1730059a193eca4dade55cb33fe` | `b33a7490a7f4c47f8ce8dce43683e1ac2196d99b` |

Las referencias de GitHub tenían como padres las bases y heads indicados. La simulación local de cada integración produjo el mismo árbol sin conflictos. El escaneo por patrones y coincidencias con la configuración local revisó 230 objetos históricos de contenido, 144 archivos y la metadata de los commits salientes sin hallazgos. En el diff acumulado, la única migración nueva del conjunto publicado es la validación de sesiones.

GitHub rechazó REST y GraphQL con `Forbidden` en este entorno. El equipo reportó que las ejecuciones del push y del PR #3 pasaron. El estado de las revisiones, las conclusiones y advertencias alojadas de esas ejecuciones quedan sin verificación independiente. Las referencias Git identifican los commits y sus árboles. [Actions para el SHA revisado](https://github.com/fjs6pvrmyb-sudo/FERIA/actions?query=sha%3Ae3b67e4c66c081b928ca396b6ade529938408154)

El workflow actual usa Node 24 y ejecuta instalación reproducible, auditoría de dependencias de producción, TypeScript, ESLint, Vitest y build. Quedan fuera la migración desde cero, GoTrue, PostgREST, RLS, las reversiones SQL, fiscal offline, Playwright y la seguridad de la preview. En local, el paquete ESLint 9.39.5 emitió un aviso de fin de soporte. Chromium también observó los avisos esperados de CSP en modo Report-Only. El gate de npm para dependencias de producción informó cero vulnerabilidades.

## Sesiones y permisos

La verificación aislada usó GoTrue 2.198.0, PostgREST 16.5, PostgreSQL 17.12 y JWT de prueba HS256. El stack se montó con los mismos servicios de Auth y REST, PostgreSQL Alpine y un proxy local de loopback. La pila completa de Supabase CLI superó el espacio disponible en esta máquina. Solo se usaron cuentas, ventas y credenciales de prueba. Se aplicaron las ocho migraciones desde una base vacía.

Las pruebas comprobaron inicio de sesión, renovación con el mismo `session_id`, rotación del refresh token, rechazo de renovación tras el cierre, denegación inmediata en catálogo, membresías y `confirm_sale`, y continuidad de otra sesión simultánea. También cubrieron JWT mal formado, firma inválida, JWT vencido, sesión con `not_after` vencido y JWT todavía vigente, rebaja de rol, retiro de membresía, tablas financieras y RPC de ventas y cobros, y denegación de acceso a otra empresa.

La función `SECURITY DEFINER` usa `search_path` vacío, referencias de esquema explícitas, compara el UUID de sesión y su usuario con los claims, exige la audiencia y comprueba `not_after`. En el entorno ensayado, el dueño tenía lectura de `auth.sessions`, `anon` carecía de ejecución, `authenticated` podía ejecutar el guard y carecía de lectura directa de la tabla. Se observaron índices sobre el ID y el usuario de sesión. La ausencia de una fila o un claim válido cierra el acceso. Una incompatibilidad de esquema o permisos provocaría un error de consulta y requiere detectar el problema antes de aplicar la migración alojada. Verificar versión, formato de claims, expiración y revocación en la configuración real de Supabase Auth, incluida la clave de firma desplegada.

Para la regresión, ejecutar las pruebas de base, colecciones, operaciones, inteligencia, ventas conversacionales y seguridad con una URL local. `FERIA_TEST_DB_CONTAINER` habilita el caso de expiración de la sesión en una base desechable. Si se usa un stack local alternativo a Supabase CLI, suministrar `FERIA_TEST_JWT_SECRET` en el entorno de pruebas. Las pruebas de fiscal exigen una URL local alternativa confirmada explícitamente en `FERIA_FISCAL_DISPOSABLE_URL`.

## Rendimiento de RLS

Se compararon la línea base, el hardening publicado y la corrección local sobre la misma base y el mismo conjunto ficticio. La carga incluyó dos organizaciones, 1.000 membresías y sesiones, 1.001 productos, 10.000 ventas históricas y 10.000 pagos. `pgbench` ejecutó transacciones con el rol autenticado. Las escrituras de carga se revirtieron. Los tiempos incluyen la ejecución SQL y la transacción local. Las muestras del dashboard son exploratorias y su p95 observado equivale al máximo de ocho operaciones.

| Operación            | Conexiones | n por variante | Línea base p50 / p95 (ms) | Hardening publicado p50 / p95 (ms) | Corrección local p50 / p95 (ms) |
| -------------------- | ---------: | -------------: | ------------------------: | ---------------------------------: | ------------------------------: |
| Catálogo             |          1 |             50 |             13.21 / 17.31 |                    225.54 / 267.96 |                     1.96 / 2.26 |
| Membresías           |          1 |             50 |               6.22 / 7.12 |                    117.30 / 136.03 |                     1.14 / 1.71 |
| Confirmar venta      |          1 |             50 |               0.86 / 3.01 |                        1.30 / 2.39 |                     1.51 / 6.33 |
| Confirmar cobro      |          1 |             50 |               0.65 / 1.28 |                        1.12 / 1.57 |                     1.25 / 1.77 |
| Dashboard de 50 días |          1 |              8 |           287.36 / 343.82 |                  5900.13 / 6085.16 |                   12.89 / 21.25 |
| Catálogo             |          4 |            100 |             13.09 / 15.60 |                    234.24 / 268.12 |                     2.07 / 3.36 |
| Membresías           |          4 |            100 |              6.83 / 13.58 |                    122.85 / 152.17 |                     1.45 / 2.95 |
| Confirmar venta      |          4 |            100 |              3.43 / 11.55 |                       3.97 / 13.19 |                    3.95 / 12.17 |
| Confirmar cobro      |          4 |            100 |               2.13 / 9.30 |                       3.31 / 11.82 |                    3.29 / 13.10 |
| Dashboard de 50 días |          4 |              8 |           311.78 / 376.01 |                  6403.93 / 6595.67 |                   12.46 / 21.53 |

El plan del agregado de ventas atravesó 5.000 filas. El hardening publicado pasó de 15.254 a 30.410 bloques leídos desde la caché compartida en ese plan. La corrección usó 416 y el conjunto de roles se evaluó una sola vez en el plan. El dashboard completo pasó de 152.338 bloques de caché compartida en el hardening publicado a 2.072 con la corrección. Cada plan es una observación con caché caliente. Estos números describen la instalación de QA y la carga usada.

La migración `20261121000000_session_read_policies.sql` calcula los roles activos del actor en un esquema interno para los filtros de lectura de catálogo, membresías y dashboard. PostgREST expone solo `public`. La ruta de escritura de ventas y cobros conserva el control central de rol y sesión, incluidas las verificaciones posteriores al bloqueo. Los SQL de cálculo financiero y sus contratos se conservaron.

## Protección del login

El servicio local tiene registro público y usuarios anónimos deshabilitados. Solo el proveedor de correo está activo y el JWT dura 3.600 segundos. La prueba acotada obtuvo `422 signup_disabled`, doce respuestas `400` en intentos sintéticos desde loopback, un login legítimo `200` y un logout `204`. Se detuvo al llegar al máximo de 12 intentos, con 250 ms entre intentos, y hubiera terminado ante el primer 429 o cualquier error inesperado. Las respuestas no devolvieron tokens ni la contraseña del fixture. La interfaz tiene manejo de un 429 de Supabase probado con una respuesta controlada. La prueba acotada no estableció un límite eficaz para el login.

No se encontró un vínculo Vercel en el checkout ni una identidad alojada disponible. La consulta a su API quedó bloqueada. Deployment Protection, HTTPS, Firewall, variables y límites alojados quedaron sin verificar. Mantener la preview privada. En Vercel, verificar protección de despliegue, HTTPS, caché privada y límites de acceso. En Supabase, revisar los límites por operación, registro cerrado, proveedores activos, CAPTCHA compatible con password grant y alertas de Auth. Su endpoint tiene una exposición independiente de Vercel. Validar en un proyecto desechable autorizado con cuentas sintéticas, una ventana y un techo acordados, y detener la prueba ante un 429, error inesperado o degradación legítima. Confirmar rechazos y recuperación para más de una identidad y origen usando una variante de límite explícita para que la prueba sea corta. [Rate limits de Supabase](https://supabase.com/docs/guides/auth/rate-limits) · [Protección de Vercel](https://vercel.com/docs/deployment-protection)

## Regresión del candidato local

Pasaron nueve migraciones en una base limpia, 61 pruebas unitarias, 30 escenarios con Auth y PostgreSQL, cinco integraciones fiscales offline, tres comprobaciones SQL de reversión y 17 recorridos Chromium. Pasaron TypeScript, ESLint y la compilación. La regresión cubrió landing, navegación por teclado, móvil y escritorio, autenticación, operador y cambio de empresa. Core incluyó ventas parciales y divididas, cobros posteriores, cierres, conciliación e historial. Intelligence cubrió borrador editable, revisión humana y confirmación, rechazo de instrucciones fuera de alcance, error controlado del proveedor y modo deshabilitado.

Se corrigieron dos supuestos de aislamiento en los fixtures: el catálogo de la panadería puede tener productos adicionales y la cafetería puede tener ventas propias. Las pruebas ahora comprueban que los productos y las ventas pertenecen a la empresa correcta aun con actividad previa. Una ejecución fiscal inicial falló debido a un permiso de tabla agregado por el bootstrap alternativo de QA. Al restaurar exactamente el permiso de la migración, pasaron las cinco pruebas, incluida la inmutabilidad bajo `service_role`.

## Decisión de liberación

- **Alta para preview pública.** La protección efectiva contra abuso de login sigue sin evidencia alojada. El equipo de infraestructura debe validar los controles del firewall de Vercel y del endpoint de Supabase. Mantener el acceso público deshabilitado.
- **Alta para el merge del SHA publicado.** El hardening introdujo una regresión de rendimiento para catálogos e historiales grandes. La corrección quedó aplicada y medida en la rama local.
- **Media para el merge.** Falta probar el contrato interno de `auth.sessions` contra la configuración alojada autorizada y verificar la revisión de equipo y CI para el SHA que se integrará. Scripts y estilos CSP siguen en Report-Only.
- **PR #3 · NO GO.** Incorporar la corrección de rendimiento, verificar Auth alojado, revisar las migraciones y obtener CI y aprobación en el head que se integre.
- **PR #2 · NO GO.** Depende del resultado de #3 y de repetir CI, pruebas de seguridad y revisión sobre el SHA actualizado.
- **PR #1 · NO GO.** Depende de #2 y de repetir la regresión de Web y Core sobre el SHA actualizado.
- **Demo de Dojo.** Usar datos ficticios, proveedor demo o deshabilitado, fiscal offline y entorno local. Requerir autorización expresa para cada merge, cualquier push del trabajo local o cambios en infraestructura.
