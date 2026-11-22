# Configuración de la preview privada de FER AI

Complementa el runbook del [PR #19](https://github.com/fjs6pvrmyb-sudo/FERIA/pull/19) con la configuración ejecutable, los controles automáticos y la propuesta exacta de despliegue. Candidato: `qa/fer-ai-mvp-local` @ `168eb4b` (CI y E2E en verde). Issue: [#10](https://github.com/fjs6pvrmyb-sudo/FERIA/issues/10).

**Estado: bloque A desplegado y protegido** en `https://feria-preview.vercel.app` (Vercel Authentication `all`), desde el SHA `86523fb` de `release/preview-privada`. Regla WAF de rate limit publicada y verificada. Los bloques B y C siguen sin autorizar.

## Plataforma verificada (solo lectura, 2026-11-22)

| Elemento            | Valor                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Equipo Vercel       | `FERIA` (`feria5`), sin proyectos creados                                                                                             |
| Supabase QA         | `lqqeisjzoajtvwcifard`, región `ca-central-1`, Postgres 17.12, 10 migraciones, 0 usuarios y 0 organizaciones                          |
| Región de funciones | `yul1` (Montreal), la más cercana a QA, fijada en `vercel.json`                                                                       |
| Plan Vercel         | **Pendiente de confirmar**. Rollback a despliegues anteriores, número de reglas de rate limit y miembros con acceso dependen del plan |

## Archivos de esta rama

| Archivo                         | Función                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vercel.json`                   | `npm ci`, región `yul1`, y build `node scripts/preview-preflight.mjs && npm run build`                                                                                                                                                                                                                                                                                                                           |
| `scripts/preview-preflight.mjs` | **Gate de build**. Falla si la URL no es QA, si la clave no es `sb_publishable_`, si la IA no está en `demo`, o si aparece cualquiera de `SUPABASE_SERVICE_ROLE_KEY`, `FERIA_QA_ADMIN_KEY`, `FERIA_DEMO_PASSWORD`, `OPENAI_API_KEY`, `FER_INTELLIGENCE_MODEL`, tokens de GitHub, o un valor con forma de secreto (`sb_secret_`, `sk-…`, `ghp_…`, o un JWT `service_role` en `NEXT_PUBLIC_*`). No imprime valores |
| `scripts/preview-smoke.mjs`     | Smoke test sin credenciales. Por defecto verifica que **Deployment Protection bloquea** `/`, `/acceso`, `/empresas` y los estáticos. Con `FERIA_PREVIEW_OPEN=1` verifica cabeceras, HSTS, rutas protegidas, rechazo entre sitios y acceso sin JS                                                                                                                                                                 |

Verificación local:

- Preflight: 1 caso válido da PASS y 4 casos inválidos dan FAIL (service role, secreto con otro nombre, JWT `service_role` público, IA `openai`).
- `buildCommand` completo: exit 0.
- Smoke abierto contra el build de producción: 4/4 PASS.
- Smoke protegido contra la misma app sin protección: FAIL, como corresponde.

## Variables de entorno (únicas permitidas)

| Variable                               | Valor                                          | Entornos             |
| -------------------------------------- | ---------------------------------------------- | -------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://lqqeisjzoajtvwcifard.supabase.co`     | Production y Preview |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave `sb_publishable_…` de QA, que es pública | Production y Preview |
| `FER_INTELLIGENCE_MODE`                | `demo`                                         | Production y Preview |

Ninguna otra. El worker fiscal (`service_role`) **no** se despliega. La preview solo muestra el estado fiscal offline ya guardado.

## Controles de acceso y abuso

1. **Deployment Protection**: Vercel Authentication con `deploymentType: "all"`, de modo que también protege la URL de producción `*.vercel.app`. Sin enlaces de bypass compartidos. Si se necesita automatización, usar un _Protection Bypass for Automation_ guardado solo en el entorno del ejecutor y revocarlo al cerrar.
2. **Rate limit de `POST /acceso`** (pendiente de #7): regla WAF personalizada con condición `Request Path = /acceso` y `Method = POST`, acción **Rate Limit**, clave **IP**, ventana fija de 60 s, **10 solicitudes** y luego **Deny (429)** durante 60 s. Se aplica en el borde con la IP real del cliente, sin agregar secretos al runtime. Verificarla con 11 POST seguidos desde una red: el 11.º debe responder 429.
3. **Supabase Auth**, que requiere aprobación porque modifica QA: Site URL = origen HTTPS exacto de la preview. La app usa solo contraseña: no hay OAuth, magic link ni `emailRedirectTo`, así que **no hace falta** ninguna Redirect URL adicional. Mantener el registro deshabilitado.

## Monitoreo y límites

- Revisar los errores de runtime y los logs del proyecto Vercel durante el ensayo y la demo. La app no registra JWT, cookies ni cuerpos.
- Supabase: logs de Auth y Postgres, y `get_advisors(security)` antes y después.
- Costos: IA en `demo`, sin llamadas a OpenAI. Sin Blob, KV ni otras integraciones. En plan Pro, fijar _Spend Management_ con un tope bajo antes de desplegar.
- Contadores de QA antes y después: `auth.users`, `auth.sessions`, `public.organizations`, `public.memberships` y ventas.

## Reversión

| Situación                                | Acción                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Fallo funcional tras un nuevo despliegue | `vercel rollback` al despliegue anterior. En Hobby solo se puede volver al inmediatamente anterior                       |
| Exposición o acceso inesperado           | Desactivar el despliegue de inmediato: `vercel remove <url> --yes`, o pausar el proyecto. Revocar el bypass si existe    |
| Configuración de Auth alterada           | Restaurar el Site URL anterior (registrado antes del cambio)                                                             |
| Cierre tras el evento                    | Borrar el proyecto Vercel, revertir el Site URL, borrar las cuentas ficticias de la demo y verificar los contadores en 0 |

La migración `20261122040216` **no** necesita reversión para la preview.

## Checklist de aceptación

| #   | Criterio                                                                        | Cómo se verifica                                                                                                                                                                         | Estado                                                                     |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | CI y E2E en verde para el SHA a desplegar                                       | Runs [44992487770](https://github.com/fjs6pvrmyb-sudo/FERIA/actions/runs/44992487770) y [44992493027](https://github.com/fjs6pvrmyb-sudo/FERIA/actions/runs/44992493027) sobre `168eb4b` | PASS                                                                       |
| 2   | P0 de Auth y RPC sin abrir                                                      | #7 (salvo el rate limit) y #8                                                                                                                                                            | PASS                                                                       |
| 3   | Build bloquea secretos                                                          | `preview-preflight.mjs` en el log del build de Vercel                                                                                                                                    | PASS (2026-11-22, `dpl_8FagLSpFBZVDa43b6oXpjGWwnFMz`)                      |
| 4   | URL inaccesible sin sesión de Vercel                                            | `node --test scripts/preview-smoke.mjs` sin bypass                                                                                                                                       | Pendiente                                                                  |
| 5   | Cabeceras, HSTS, CSRF, rutas y acceso sin JS                                    | Smoke en modo abierto con bypass de automatización o desde la sesión del equipo                                                                                                          | Pendiente                                                                  |
| 6   | Rate limit 429 en `POST /acceso`                                                | 11 POST en menos de 60 s                                                                                                                                                                 | PASS (10×200, luego 429; regla `rule_rate_limit_acceso_CfqONU`)            |
| 7   | Login, venta conversacional, cobro, conciliación y logout en móvil y escritorio | Guion de 5 min del PR #19 con cuentas ficticias                                                                                                                                          | PASS (ensayo 2026-11-22; el estado fiscal offline no tiene vista en la UI) |
| 8   | Sin datos reales y QA limpio tras la demo                                       | Contadores en 0 y advisors                                                                                                                                                               | Pendiente                                                                  |

## Propuesta exacta para autorizar

Cada bloque se autoriza por separado:

- **A. Crear y desplegar** (sin costo en Hobby):
  1. Crear el proyecto `feria-preview` en el equipo `feria5`, vinculado a este repo.
  2. Cargar solo las 3 variables.
  3. Activar Vercel Authentication `all` **antes** del primer despliegue.
  4. Crear la regla WAF del punto 2.
  5. Desplegar `168eb4b` más esta rama.
  6. Ejecutar el smoke en los dos modos.
- **B. Auth de QA:** fijar el Site URL de `lqqeisjzoajtvwcifard` al origen de la preview.
- **C. Datos de demo en QA:** crear 2 organizaciones y 2 o 3 cuentas ficticias, con contraseñas aleatorias que no se guardan en el repo. Se borran al cerrar.
