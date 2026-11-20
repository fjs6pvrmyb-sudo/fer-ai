# Integración de FER AI Web y Core

## Punto de partida

| Rama de origen | SHA comprobado                             |
| -------------- | ------------------------------------------ |
| `main`         | `5c6e878249acc84f8aaf56297892cc59b200892f` |
| `work`         | `4019141d40ff53079d05f81b07d3c897a95def2a` |
| `fer-ai-web`   | `ec759c482101cd8a0d66551698ea8e8caaae4201` |

La integración se hizo en `integration/fer-ai-web-core` a partir de `work`. Ambas ramas partían de `d2593e0`. La rama de Aarón aportó `design.md`, la landing, las páginas de empresa y colaborador, `ChatFER.tsx` y los cambios de dependencias para su iconografía. El trabajo de Core desde ese punto aporta las fases 4B, 5 y 6A. Se conservó `design.md` tal como estaba en `fer-ai-web` y se siguió su dirección visual. El lockfile de `work` se mantiene porque la iconografía compartida ya cubre las pantallas nuevas.

## Auditoría y resolución

| Hallazgo en `fer-ai-web`                                                                                                               | Decisión de integración                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La landing tenía 1.015 líneas, lógica de menú y FAQ, temporizadores, vistas de ejemplo y un formulario en un único componente cliente. | Composición de secciones en servidor y estado solo para el menú móvil. FAQ y desglose usan controles HTML nativos.                                                                                                                            |
| `/empresa` mostraba ventas, saldos e identificadores del estado local.                                                                 | Redirige a `/empresas`. El dashboard de `/empresas/[org]` conserva el período, moneda, permisos y consultas de Core. Adopta la paleta y el encabezado de Web.                                                                                 |
| `/colaborador` permitía elegir un catálogo fijo y mostraba mensajes de éxito sin escritura.                                            | Pasa por `/acceso?destino=venta` y el mismo selector de empresas. Cada tarjeta autorizada abre `/empresas/[org]/ventas/nueva`. El servidor admite únicamente el destino interno previsto y la revisión y confirmación son las mismas de Core. |
| `ChatFER.tsx` inventaba borradores y comprobantes mediante temporizadores y valores aleatorios.                                        | La experiencia visual se lleva a `Chat` y al borrador de Intelligence. Los dos puntos de entrada existentes usan `ConversationWorkspace`, los contratos tipados de Fase 4B y la confirmación transaccional.                                   |
| Un temporizador anunciaba que la lista de espera había recibido datos.                                                                 | La sección informa que la lista está cerrada y ofrece el ejemplo o el acceso existente. La landing carece de campos personales y de acciones de escritura.                                                                                    |

## Rutas y pruebas

| Entrada                                 | Resultado                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `/`                                     | Landing pública y ejemplo ficticio de solo lectura.                            |
| `/empresa`                              | Selección autorizada de empresas y entrada al dashboard.                       |
| `/colaborador`                          | Inicio de sesión de Supabase y selección autorizada con acceso a venta manual. |
| `/empresas/[org]/intelligence`          | Inteligencia gerencial y venta conversacional según los permisos de Core.      |
| `/empresas/[org]/ventas/conversacional` | Captura con el catálogo autorizado, edición, revisión y confirmación.          |

La comprobación de sesión sigue en el servidor. Los dashboards, el catálogo y las escrituras usan las consultas de Core y PostgreSQL mantiene sus políticas RLS, claves y restricciones financieras. La landing es pública y estática. El asistente demo interpreta de manera determinista y opera sobre la base ficticia local cuando una persona autorizada confirma. OpenAI sigue condicionado a su configuración explícita. El contrato de Fase 6A conserva sus migraciones y preparación offline sin firma ni transmisión.

El workflow local comprueba instalación, TypeScript, lint, suites unitarias y compilación. Su primera ejecución en GitHub queda pendiente de publicación autorizada. Para la regresión completa, usá Supabase desechable y las cuentas ficticias. `tests/e2e/web-core.spec.ts` cubre landing, lista cerrada, teclado, redirecciones, permisos, una venta con pago dividido parcial y su persistencia, y el importe resultante en el dashboard. Las demás suites cubren conversación, cobros, jornadas, conciliación y Fase 6A. [Ejecución local](../README.md#verificación-reproducible)

## Resultado y recomendación

Pasaron `npm ci`, TypeScript, lint, build y las siete migraciones sobre Supabase desechable. Pasaron 58 pruebas unitarias, 25 integraciones de Core, 5 integraciones fiscales, 3 comprobaciones de reversión SQL y 15 recorridos Playwright. En el recorrido nuevo, una venta de ₡5.000 con ₡1.000 en efectivo y ₡2.000 por transferencia dejó un saldo de ₡2.000, sobrevivió la recarga y actualizó los totales del dashboard. La revisión de contraste de la paleta principal superó 4,5:1 en los cinco pares medidos y la navegación por teclado pasó en Chromium. Queda pendiente una revisión completa con lectores de pantalla.

Playwright genera `fer-landing-escritorio.png`, `fer-landing-movil.png`, `fer-dashboard-escritorio.png` y `fer-venta-movil.png` en el directorio de resultados. La suite conversacional genera además `01-conversacion-y-borrador-movil.png`. Las capturas usan únicamente las cuentas y los datos ficticios de prueba.

**GO técnico para revisar el merge.** La revisión del equipo y las comprobaciones de GitHub deben realizarse antes de integrar la rama. La activación de OpenAI, la lista de espera y cualquier ampliación fiscal requieren decisiones y autorizaciones separadas.
