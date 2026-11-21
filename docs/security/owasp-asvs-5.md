# Línea base de seguridad FER AI — OWASP ASVS 5.0.0

**Estado:** adopción interna de requisitos y evidencias, **NO** certificación OWASP, pentest completo ni afirmación de cumplimiento integral.  
**Referencia:** [OWASP ASVS 5.0.0](https://asvs.owasp.org/), [OWASP Top 10:2025](https://top10.owasp.org/2025/) y [OWASP GenAI/LLM Top 10:2026](https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/).  
**Alcance:** aplicación Next.js/Supabase de FER AI, rutas públicas, sesiones, multiempresa, RPC financieros, asistente y preview aislada.  
**Objetivo por etapas:** controles críticos de **ASVS nivel 1** para una demo aislada; definir el alcance y verificar **nivel 2** antes de procesar información de clientes reales. Los niveles son metas, no logros declarados.

## Convenciones de evidencia

- **Código:** mecanismo identificado en archivos de la rama; no prueba cumplimiento completo.
- **Prueba local reportada:** resultado descrito en documentación del proyecto; no verificado de nuevo aquí.
- **CI:** validación que corre en GitHub Actions; usar la ejecución real como evidencia.
- **Pendiente:** debe demostrarse mediante prueba técnica, revisión de configuración o auditoría independiente.
- **No aplica provisionalmente:** justificar por versión y reevaluar si aparecen nuevas funciones.

Esta matriz es **de cobertura inicial por capítulo de ASVS 5.0.0**. No sustituye el análisis exhaustivo de los **requisitos individuales** del estándar. En una auditoría formal se debe exportar la lista oficial de requisitos con identificadores versionados (`v5.0.0-<capítulo>.<sección>.<requisito>`), responsable, alcance, procedimiento, evidencia, fecha y resultado.

## Matriz inicial de controles y evidencia

| ASVS 5.0.0 | Control / objetivo verificable en FER AI | Evidencia existente | Estado / brecha |
| --- | --- | --- | --- |
| V1 — Codificación y sanitización | Las entradas sin confianza no se convierten en código/HTML peligroso | React y validaciones tipadas en `src/modules/conversation/actions.ts` | **Parcial**. Pendientes pruebas XSS, inyección y revisión de contextos de salida |
| V2 — Validación y lógica de negocio | Ninguna venta/cobro se duplica ni altera importes por carrera/reintento | `src/modules/sales/`, `src/modules/payments/`, `tests/`, `docs/evidencia-hackathon.md` | **Con pruebas locales reportadas**. Pendiente estrés concurrente y trazabilidad por caso |
| V3 — Frontend web | Defensa básica del navegador en rutas públicas y privadas | `next.config.ts`, `tests/unit/security-headers.test.ts` | **Implementado y automatizado parcialmente**. CSP con nonce, DOM-XSS y revisión en navegador pendientes |
| V4 — API y servicios web | Cada Server Action valida forma, sesión, contexto y autorización | `src/modules/conversation/actions.ts`, `src/modules/organizations/access.ts` | **Parcial**. Fuzzing, anti-abuso general y revisión de todas las acciones pendientes |
| V5 — Manejo de archivos | Identificar si existen endpoints de subida/descarga de archivos | Sin flujo de carga empresarial identificado en el alcance actual | **No aplica provisionalmente**. Confirmar en inventario de rutas y reevaluar al añadir adjuntos |
| V6 — Autenticación | Autenticación robusta y defensa contra fuerza bruta | `src/modules/auth/session.ts` y Supabase Auth | **Parcial**. Configuración alojada, política de contraseñas, MFA y rate limit pendientes |
| V7 — Sesiones | Las cookies y el ciclo de sesión evitan suplantación | `src/modules/auth/config.ts` (`HttpOnly`, `Secure` en producción), `src/modules/auth/session.ts` | **Parcial**. Caducidad, rotación, revocación, CSRF y pruebas entre navegadores pendientes |
| V8 — Autorización | Denegar por defecto; cuentas sin membresía no ven datos de otra empresa | `src/modules/organizations/access.ts`, migraciones RLS y `tests/e2e/web-core.spec.ts` | **Con pruebas locales reportadas**. Pruebas adversariales por endpoint/RPC y rol pendientes |
| V9 — Tokens autocontenidos | Solo tokens firmados, vigentes y con audiencia esperada | Supabase Auth y sesión resuelta en servidor | **Pendiente verificar** JWT/JWKS, audiencia, expiración y rechazo de tokens manipulados |
| V10 — OAuth/OIDC | Validar proveedores y flujos si se habilitan | Acceso actual con correo/contraseña de Supabase | **No aplica provisionalmente** a login social; reevaluar al incorporar OAuth |
| V11 — Criptografía | Evitar claves embebidas; proteger secretos y datos sensibles | `.env.example`, separación server/client | **Parcial**. Inventario de secretos, rotación, almacenamiento cifrado y verificación del proveedor pendientes |
| V12 — Comunicación segura | Aplicación, Auth y servicios solo por HTTPS/TLS válido | `docs/demo-alojada.md` contiene plan | **Pendiente** revisar URL real, TLS, HSTS y redirecciones de la preview |
| V13 — Configuración | Cabeceras y mínimos privilegios, sin configuraciones de desarrollo en preview | `next.config.ts`, `src/proxy.ts`, workflow `ci.yml` | **Parcial**. Auditar Vercel, Supabase y cabeceras reales; endurecer CSP en fase separada |
| V14 — Protección de datos | Separar empresas; evitar fugas por caché, URL y proveedor de IA | `src/proxy.ts` (`no-store`), `src/modules/intelligence/` y RLS | **Parcial**. Clasificación, retención, logs, backups y pruebas de exposición pendientes |
| V15 — Arquitectura y código seguro | Reproducibilidad, revisión, análisis de dependencias y pruebas | `.github/workflows/ci.yml`, `tests/`, `AGENTS.md` | **CI automático** para lint/typecheck/unit/build y auditoría de dependencias de producción; SAST/DAST pendientes |
| V16 — Registro de seguridad y errores | Registrar incidentes sin filtrar secretos ni PII | `src/modules/shared/actions.ts`, controles de errores en Intelligence | **Parcial**. Inventario de logs, alertas, auditoría de accesos y respuesta a incidentes pendientes |
| V17 — WebRTC | Revisar si la plataforma expone audio/vídeo en tiempo real vía WebRTC | No se declara WebRTC en los flujos actuales | **No aplica provisionalmente**, reevaluar con funciones de voz/vídeo |

## Controles de IA (OWASP GenAI/LLM Top 10:2026)

La interpretación IA produce **propuestas**, no decisiones privilegiadas. Conservar:
1. Mensajes como **entrada no confiable**; no permitir SQL, shell ni acciones no previstas.
2. Planes tipados con esquema estricto; revalidación y autorización **en servidor**.
3. Confirmación humana de ventas, cobros y cambios financieros; prevenir agencia excesiva.
4. Aislamiento por empresa y propietario para prompts, borradores, consultas y respuestas.
5. Cuotas por usuario, tiempo de espera, límite de tokens, presupuesto y rechazo de abuso.
6. Protección frente a filtraciones en prompts, respuestas, cachés, errores, logs y proveedores externos.
7. Pruebas adversariales: prompt injection, instrucciones que simulen sistema, organizaciones ajenas, saldos falsos, cambio de moneda y reintentos simultáneos.

**Evidencia inicial:** `src/modules/conversation/actions.ts`, `src/modules/intelligence/openai.ts`, `src/modules/intelligence/service.ts`, `tests/unit/`, `tests/e2e/conversation.spec.ts`. Estos archivos constituyen controles iniciales, **no** una evaluación adversarial terminada.

## Registro de riesgos y acciones priorizadas

| ID | Severidad / condición | Acción y evidencia de cierre |
| --- | --- | --- |
| SEC-01 | **P0 antes de preview:** exposición de datos cross-tenant | Ejecutar suite Auth + RLS con cuentas ficticias en Supabase desechable; evidenciar accesos negativos en RPC y UI |
| SEC-02 | **P0 antes de preview:** claves o servicios incorrectos | Revisar variables por entorno, claves server-only, URL HTTPS, registro cerrado y protección de preview |
| SEC-03 | **P0 antes de preview:** débiles controles contra abuso | Activar/validar límites de login y de acciones; documentar cuotas y observar rechazos 429 o equivalentes |
| SEC-04 | **P1 antes de clientes reales:** CSP y DOM-XSS | Diseñar CSP compatible con App Router, comprobar en modo Report-Only, eliminar infracciones, activar enforcement y añadir pruebas |
| SEC-05 | **P1 antes de clientes reales:** expiración, CSRF y manipulación de tokens | Pruebas manuales/automatizadas de sesión, revocación, origen y token inválido |
| SEC-06 | **P1 antes de clientes reales:** prompt injection y fuga de información | Batería adversarial LLM 2026 con casos, métricas y resultados reproducibles |
| SEC-07 | **P1 antes de clientes reales:** concurrencia / idempotencia | Prueba de 20–100 operaciones sintéticas con PostgreSQL desechable, sin duplicados ni saldo incorrecto |
| SEC-08 | **P1 antes de clientes reales:** detección y respuesta a incidentes | Definir logs seguros, alertas, propietario, retención y runbook |
| SEC-09 | **P1 antes de clientes reales:** pentest y cumplimiento | Evaluación por requisito ASVS nivel 1 y alcance nivel 2; revisión independiente y cierre de críticos/altos |

## Reglas de entrega

**Preview del hackathon:** solamente datos ficticios y cuentas limitadas; pruebas básicas de permisos y finanzas; secretos separados; HTTPS; barreras anti-abuso; revisión de cabeceras y estado de CI. No afirmar verificación fiscal real, SINPE bancario ni protección total OWASP.

**Uso con clientes reales:** exigir evaluación por requisitos ASVS aplicables (mínimo L1 verificado, objetivo L2 según riesgo), ninguna vulnerabilidad crítica/alta abierta sin mitigación aprobada, revisión independiente, backups, observabilidad, pruebas de resiliencia y políticas de privacidad.

**No marcar un control “aprobado” solo porque exista un archivo, una prueba genérica o una dependencia.** Cada requisito exige evidencia ejecutada en la versión y el entorno que se pretenda liberar.
