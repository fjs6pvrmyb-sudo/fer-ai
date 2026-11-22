# Auditoría de catálogo y RPC de FER AI QA

Candidata: `6dfecfdfed386f501e568e8fc1d837e6ea3a3b4e`. QA: `lqqeisjzoajtvwcifard`. Corte: 21 de noviembre de 2026, Costa Rica. Se consultaron catálogos PostgreSQL y los asesores de Supabase. Se verificaron las nueve migraciones existentes.

## Inventario remoto observado

`public` tiene 29 rutinas: 28 de la aplicación y el manejador de RLS de Supabase. Veinte usan SECURITY DEFINER, 18 con EXECUTE para authenticated y una también para anon. La función de políticas `feria_private.active_organization_roles()` es una rutina adicional de la aplicación, con SECURITY DEFINER, dueño postgres, search_path vacío y EXECUTE solo para authenticated entre los tres roles evaluados.

| Firma | Dueño | Contexto | EXECUTE efectivo | search_path |
| --- | --- | --- | --- | --- |
| `graphql_public.graphql(text,text,jsonb,jsonb)` | supabase_admin | invoker | anon, authenticated, service_role | predeterminado |
| `public.begin_intelligence_request(uuid,text,text)` | postgres | definer | authenticated, service_role | search_path vacío |
| `public.begin_sale_interpretation(uuid,text,text)` | postgres | definer | authenticated, service_role | search_path vacío |
| `public.cancel_conversational_sale(uuid,uuid,integer)` | postgres | definer | authenticated, service_role | search_path vacío |
| `public.collect_payment(uuid,uuid,uuid,text,payment_method,text)` | postgres | definer | authenticated, service_role | search_path vacío |
| `public.complete_day_close(uuid,date,text,text)` | postgres | definer | authenticated, service_role | search_path vacío |
| `public.complete_intelligence_request(uuid,uuid,text,text,integer,integer,text)` | postgres | invoker | service_role | search_path vacío |
| `public.confirm_conversational_sale(uuid,uuid,integer)` | postgres | definer | authenticated, service_role | search_path vacío |
| `public.confirm_sale(uuid,uuid,jsonb,jsonb)` | postgres | definer | authenticated, service_role | search_path vacío |
| `public.dashboard_summary(uuid)` | postgres | invoker | authenticated, service_role | search_path vacío |
| `public.day_review(uuid,date)` | postgres | invoker | authenticated, service_role | search_path vacío |
| `public.feria_session_active()` | postgres | definer | authenticated, service_role | search_path vacío |
| `public.finish_intelligence_request(uuid,uuid,text,text,integer,integer)` | postgres | definer | authenticated, service_role | search_path vacío |
| `public.finish_sale_interpretation(uuid,uuid,text,text,integer,integer)` | postgres | definer | authenticated, service_role | search_path vacío |
| `public.intelligence_product_ranking(uuid,date,date)` | postgres | invoker | authenticated, service_role | search_path vacío |
| `public.lock_conversational_sale(uuid,uuid,integer)` | postgres | invoker | service_role | search_path vacío |
| `public.lock_operations(uuid)` | postgres | invoker | service_role | search_path vacío |
| `public.operations_metrics(uuid,date,date)` | postgres | invoker | authenticated, service_role | search_path vacío |
| `public.organization_role(uuid)` | postgres | definer | authenticated, service_role | search_path vacío |
| `public.reject_fiscal_history_edit()` | postgres | invoker | — | search_path vacío |
| `public.reserve_fiscal_offline(uuid,uuid,uuid,text,jsonb,jsonb)` | postgres | definer | service_role | search_path vacío |
| `public.reserve_intelligence_request(uuid,text,text,text)` | postgres | invoker | service_role | search_path vacío |
| `public.rls_auto_enable()` | postgres | definer | anon, authenticated, service_role | search_path pg_catalog |
| `public.save_conversational_sale(uuid,uuid,integer,jsonb,jsonb)` | postgres | definer | authenticated, service_role | search_path vacío |
| `public.save_payment_evidence(uuid,uuid,text,text,text,evidence_status,text)` | postgres | definer | authenticated, service_role | search_path vacío |
| `public.save_product(uuid,uuid,text,text,boolean)` | postgres | definer | authenticated, service_role | search_path vacío |
| `public.set_membership(uuid,uuid,member_role,boolean)` | postgres | definer | authenticated, service_role | search_path vacío |
| `public.start_day_close(uuid,date)` | postgres | definer | authenticated, service_role | search_path vacío |
| `public.store_fiscal_offline(uuid,uuid,uuid,text,text,text,jsonb)` | postgres | definer | service_role | search_path vacío |
| `public.update_organization(uuid,text,text)` | postgres | definer | authenticated, service_role | search_path vacío |

## Guardas y efectos revisados

| Grupo | Verificación de código |
| --- | --- |
| Sesión y roles | `feria_session_active` verifica identificador UUID, usuario, audiencia y vigencia de la fila en `auth.sessions`. `organization_role` y el helper privado limitan el resultado al actor y a membresías vigentes. Los tokens válidos y la revocación del logout web requieren evidencia de transporte. |
| Administración | `save_product`, `update_organization` y `set_membership` requieren admin y vuelven a comprobarlo tras los bloqueos. Escriben catálogo, configuración o membresías. |
| Ventas y cobros | `confirm_sale` comprueba membresía y `collect_payment` exige admin o gerente. Bloqueos y validaciones preservan la organización. Escriben movimientos y auditoría. |
| Cierre y evidencia | `start_day_close`, `complete_day_close` y `save_payment_evidence` delegan a `lock_operations`, que exige admin o gerente al adquirir y después de adquirir el bloqueo. |
| Asistente | Las cuatro RPC `begin_*` y `finish_*` delegan en helpers invocadores. La reserva verifica rol y cuota. La finalización se vincula a la solicitud, organización y actor. El canal gerencial exige admin o gerente. |
| Borradores | `save_conversational_sale`, `cancel_conversational_sale` y `confirm_conversational_sale` verifican membresía y, para borradores existentes, organización, dueño, revisión y estado. Confirmar delega en `confirm_sale`. |
| Fiscal | `reserve_fiscal_offline` y `store_fiscal_offline` quedan reservadas a service_role entre los roles de API. El worker valida el actor y la organización. `reject_fiscal_history_edit` solo es un manejador de trigger. |
| Consultas | Las cuatro RPC de lectura de negocio son SECURITY INVOKER. Las siete vistas de negocio tienen `security_invoker=true`. |
| RLS administrado | `rls_auto_enable` retorna `event_trigger`, pertenece a postgres y está vinculado a `ensure_rls` en `ddl_command_end`. Tiene grants directos a anon/authenticated y heredados por PUBLIC. El catálogo no demuestra exposición por HTTP. |
| GraphQL | `graphql_public.graphql` es invocador y admite ambos roles. El repositorio local solo configura `public`, y la exposición de `graphql_public` en QA consta en el [issue #8](https://github.com/fjs6pvrmyb-sudo/FERIA/issues/8). No se encontraron referencias GraphQL en el código de la aplicación. Validar consumidores externos y alcance del endpoint con el proveedor antes de retirarlo en una ventana aprobada. |

Las 23 tablas públicas tienen RLS. Ninguna concede SELECT a anon. Las seis sin política tampoco conceden SELECT a authenticated. Se observaron grants de service_role a 25 rutinas públicas distintas de las dos RPC fiscales, el manejador DDL y el trigger fiscal. Esto difiere de la expectativa de `tests/qa-permissions.sql` para el laboratorio. Conservar la prueba local estricta y revisar default privileges, consumidores operativos y alcance de service_role por separado antes de cambiar esos grants.

Advisors: 1 aviso anon, 18 authenticated (incluye el mismo manejador), 6 informativos RLS. Rendimiento: 13 claves foráneas sin índice y 2 índices sin uso observado. Mantener los índices hasta contar con mediciones de carga de la demo. [Security Advisor](https://supabase.com/docs/guides/observability/advisors) · [GraphQL](https://supabase.com/docs/guides/graphql) · [Sesiones](https://supabase.com/docs/guides/auth/sessions)

## Cambio propuesto y gate

La migración propuesta reduce los grants del manejador DDL identificado. Conserva el vínculo y sus ACL para owner y service_role. En un entorno sin dicho manejador la migración no hace cambios. La comprobación adjunta es una única consulta de catálogo que devuelve estado de vínculo y grants. Antes de autorización y QA posterior, verificar en una instancia desechable que el trigger habilita RLS en una tabla de prueba y que el test pasa tras aplicar el parche. Confirmar con Supabase el soporte de modificar ACL del manejador administrado y guardar la ACL original para reversión.

Quedan pendientes las comprobaciones funcionales HTTP de permisos con cuentas ficticias, GraphQL y la revocación de la sesión tras logout web. El [PR #17](https://github.com/fjs6pvrmyb-sudo/FERIA/pull/17) registra cuatro pruebas previas de Auth y Data API alojadas y limpieza posterior de fixtures. Los inventarios de esta sesión no repiten esas pruebas.
