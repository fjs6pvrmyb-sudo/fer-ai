# Verificación de RPC y RLS de FER AI

El control `tests/qa-permissions.sql` verifica del catálogo PostgreSQL los permisos efectivos de `anon`, `authenticated` y `service_role`, contexto y dueño de las funciones, RLS de las tablas y modo invocador de las vistas. Ejecutalo en la base desechable después de las nueve migraciones con `psql -X -v ON_ERROR_STOP=1`. La transacción es de solo lectura. La suite Auth de QA y las pruebas de Core complementan este control con solicitudes reales. [Issue #8](https://github.com/fjs6pvrmyb-sudo/FERIA/issues/8)

| Grupo | Contrato revisado |
| --- | --- |
| Sesión y membresías | `feria_session_active` verifica claims, fila de sesión y vencimiento. `organization_role` y el conjunto de roles activos en `feria_private` filtran por usuario y membresía vigente. La Data API de la aplicación solo expone `public`. |
| Administración | `save_product`, `update_organization` y `set_membership` requieren admin de la empresa y verifican de nuevo tras tomar su bloqueo. |
| Finanzas | `confirm_sale` exige membresía y `collect_payment` exige admin o gerente. Verifican nuevamente tras bloquear la empresa. `start_day_close`, `complete_day_close` y `save_payment_evidence` delegan el control a `lock_operations`. Los datos se escriben en transacciones con auditoría. |
| Asistente | `begin_intelligence_request`, `finish_intelligence_request`, `begin_sale_interpretation` y `finish_sale_interpretation` delegan en helpers internos. Vinculan solicitud y usuario. El canal gerencial requiere admin o gerente, y la reserva bloquea por actor y aplica cuota. |
| Borrador de venta | `save_conversational_sale`, `cancel_conversational_sale` y `confirm_conversational_sale` comprueban dueño, empresa, revisión y estado del borrador. La confirmación llama al mismo RPC financiero que la venta manual. |
| Fiscal offline | `reserve_fiscal_offline` y `store_fiscal_offline` son para el worker `service_role`, con guardas de organización y rol del actor. La prueba fiscal offline verifica su contrato. |
| Invocadores | `dashboard_summary`, `day_review`, `operations_metrics` e `intelligence_product_ranking` ejecutan con los permisos del actor. `lock_operations`, `lock_conversational_sale`, `reserve_intelligence_request`, `complete_intelligence_request` y `reject_fiscal_history_edit` quedan fuera de los grants de usuario. |

Las seis tablas sin políticas en este candidato son deliberadamente internas. `sale_requests` y `collection_requests` guardan idempotencia, `intelligence_requests` controla cuota y trazabilidad, y `fiscal_issuers`, `fiscal_series` y `fiscal_cabys_fixtures` sirven al worker fiscal. Permanecen con RLS y sin lectura de usuario. Las siete vistas usan `SECURITY INVOKER`.

Las advertencias del catálogo sobre ejecución como autenticado requieren revisión por función. Un grant por sí solo no demuestra acceso indebido. En el laboratorio no existe la función administrada `public.rls_auto_enable()`. Su visibilidad exacta en la Data API y las advertencias del proyecto alojado requieren evidencia de ese destino. También queda verificar los esquemas alojados, incluido `graphql_public`, y medir consultas antes de modificar los índices mencionados por los advisories.
