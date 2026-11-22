# Prueba de Auth y aislamiento para QA

La suite `scripts/test-qa-auth.mjs` crea dos cuentas ficticias con Auth Admin y dos empresas propias de la ejecución. Valida acceso anónimo, permisos de administrador y operador, consulta cruzada, idempotencia de una venta con pago dividido, renovación, logout individual, rechazo del JWT de la sesión cerrada y baja de membresía. Usa la clave publicable y los JWT de los usuarios en las operaciones verificadas. Usa la clave administrativa para aprovisionar y limpiar. [Issue #7](https://github.com/fjs6pvrmyb-sudo/FERIA/issues/7)

## Proyecto y ejecución

Verificá primero el proyecto aislado, su organización, su origen HTTPS y el historial de migraciones. Habilitá acceso a una identidad administrativa temporal solo para ese proyecto. La suite comprueba el cierre del registro público y de Auth anónimo antes de crear fixtures. El modo alojado fija el origen al proyecto QA y bloquea el reenvío a otros orígenes, incluso por redirección. En modo local exige loopback, HTTP y puerto alternativo.

| Variable                   | Modo alojado                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `FERIA_QA_MODE`            | `hosted`                                                                                   |
| `FERIA_QA_URL`             | `https://lqqeisjzoajtvwcifard.supabase.co`                                                 |
| `FERIA_QA_APPROVED_REF`    | `lqqeisjzoajtvwcifard`, después de corroborar el destino                                   |
| `FERIA_QA_PUBLISHABLE_KEY` | Clave publicable del mismo proyecto                                                        |
| `FERIA_QA_ADMIN_KEY`       | Clave secreta de aprovisionamiento temporal, inyectada en el proceso desde un canal seguro |

La ejecución toma credenciales del entorno. Nunca escribas claves en el comando, GitHub, el browser o un archivo versionado. Correlacioná con el identificador de fixtures en caso de interrupción. La suite solo borra sus propias organizaciones y usuarios por ID, y comprueba que quedaron eliminados. Ante un corte abrupto que impida limpiar, el responsable debe verificar los fixtures del identificador de ejecución antes de autorizar su limpieza administrativa.

```sh
node --test scripts/test-qa-auth.mjs
```

Para ensayar localmente, usá `FERIA_QA_MODE=local` y las claves del stack desechable de puerto alternativo. Las pruebas Playwright de SSR y cookies siguen en su suite propia. La prueba del SDK cubre Auth y Data API. La validación alojada de login, cookies y logout por la interfaz sigue siendo un gate adicional del candidato.
