# FER AI

Aplicación web multiempresa para registrar ventas y pagos. Esta versión incluye autenticación con Supabase, catálogo con precios vigentes, venta manual y conversacional, cobros posteriores, cierres diarios, conciliación documental y dashboard gerencial. La Panadería y Business comparten el mismo núcleo y se configuran por organización.

## Desarrollo local

Requisitos: Node 24, npm y Docker en ejecución. Usá el checkout existente. La versión de la CLI de Supabase está fijada en el lockfile. Si el directorio personal es de solo lectura, usá `npm_config_cache=/tmp/feria-npm npm ci` y ejecutá los comandos de Supabase con `DO_NOT_TRACK=1` para desactivar su telemetría.

```sh
npm ci
npm run db:start
npx supabase status
cp .env.example .env.local
```

Completá `.env.local` con la URL local y la clave **Publishable** de Supabase (o **anon** si la CLI muestra las claves JWT heredadas). Para el script de cuentas y las pruebas de integración, completá también `SUPABASE_SERVICE_ROLE_KEY` con la clave JWT **service_role** del entorno local y elegí una contraseña temporal de al menos 12 caracteres en `FERIA_DEMO_PASSWORD`. Conservá el archivo en tu máquina. La aplicación usa únicamente la URL y la clave pública.

```sh
npm run demo:seed
npm run dev -- --hostname 127.0.0.1
```

Abrí `http://127.0.0.1:3000` para ver la landing, o entrá por `/acceso` con la contraseña que elegiste. `/empresa` lleva al selector de empresas y `/colaborador` a la selección de empresa para registrar ventas. Ambos usan la sesión de Supabase y las membresías existentes. Las cuentas ficticias son:

| Correo                    | Panadería Demo | Cafetería Demo |
| ------------------------- | -------------- | -------------- |
| `admin@feria.example`     | Administrador  | Gerente        |
| `operador@feria.example`  | Operador       | —              |
| `cafeteria@feria.example` | —              | Operador       |

En **Panadería Demo → Registrar venta**, elegí una unidad de **Pan de masa madre**, que cuesta ₡5.000 en la semilla. Agregá un pago de 2000 por transferencia/SINPE, revisá y confirmá. El detalle identifica la venta y muestra un saldo de ₡3.000. Si ingresaste como gerente o administrador, abrí **Registrar cobro** en el detalle, elegí un medio e ingresá 3000. El recibo muestra la jornada y el identificador del cobro. Volvé a **Ventas** para localizar el mismo identificador de venta y comprobar que el saldo quedó en cero. Cambiá a Cafetería Demo para ver su catálogo independiente.

En **Catálogo**, un administrador puede agregar o editar productos. Los cambios de precio preservan la versión anterior. En **Configuración** puede editar nombre y zona horaria y gestionar el acceso de cuentas ya provisionadas en Supabase Auth. La moneda y su escala se definen al aprovisionar una organización. La demo usa CRC y `America/Costa_Rica` y registra ventas con cantidades enteras.

### Jornadas, cierres y conciliación

Con una cuenta de gerente o administrador, elegí una empresa y abrí **Jornadas → Ver jornada actual**. Revisá las cifras, iniciá la revisión y confirmá el cierre operativo. Dejá el conteo vacío si está pendiente o ingresá 0 si se contaron cero unidades. La diferencia prevista se calcula con los cobros en efectivo registrados.

En **Conciliación**, seleccioná la jornada del cobro y agregá una referencia ficticia, su importe y un estado. Una verificación exige que los importes coincidan. Una discrepancia exige observaciones. En **Inicio**, el dashboard filtra por fecha o período y enlaza al detalle. El saldo se calcula al cierre de la fecha final.

Para reproducir el escenario de dos jornadas sin cambiar el reloj, ejecutá `npm run test:operations`. El recorrido de navegador completo está en `tests/e2e/operations.spec.ts` y se ejecuta con `npm run test:e2e -- tests/e2e/operations.spec.ts` tras compilar.

### FER AI Intelligence

Abrí **Preguntale a FER** con una cuenta de gerente o administrador. Elegí el período de referencia para preguntas sin fecha. La aplicación admite hoy, ayer, esta semana (desde el lunes), semana pasada, último cierre y fechas explícitas ISO o día/mes/año. Las preguntas ambiguas piden aclaración.

Para probarlo con Supabase local y las cuentas ficticias, ejecutá:

```sh
FER_INTELLIGENCE_MODE=demo npm run dev -- --hostname 127.0.0.1
```

El modo demo está identificado en pantalla. Interpreta un vocabulario acotado de forma determinista y consulta cifras reales de la base ficticia. Las preguntas sugeridas permiten verificarlo. La frase `Simular interrupción del proveedor` comprueba la degradación en demo.

El asistente externo se activa con `FER_INTELLIGENCE_MODE=openai`, una clave autorizada en `OPENAI_API_KEY` y un modelo compatible con Structured Outputs en `FER_INTELLIGENCE_MODEL`. Guardá la configuración únicamente en el servidor. En un entorno con salida restringida, la integración externa requiere acceso a `api.openai.com`. Sin configuración completa se muestra **Asistente deshabilitado**. El adaptador usa el SDK oficial y Responses API con `store: false`, una llamada por consulta, hasta 450 tokens de salida y un tiempo máximo de 8 segundos.

Las verificaciones de navegador usan el proveedor demo por defecto. Para probar el estado deshabilitado, ejecutá `FERIA_TEST_INTELLIGENCE_MODE=disabled npm run test:e2e -- --grep "asistente deshabilitado"` después de compilar. Ninguno de esos recorridos usa OpenAI.

### Venta conversacional · Recorrido Dojo

Usá Supabase local con datos ficticios y arrancá la aplicación con `FER_INTELLIGENCE_MODE=demo npm run dev -- --hostname 127.0.0.1`. Con una cuenta gerencial, abrí **Preguntale a FER**. Con una cuenta de operador, entrá por **Registrar venta → Preparar con FER**.

1. En **Panadería Demo**, escribí «FER, vendí un pan de masa madre de cinco mil colones. Me pagaron dos mil por SINPE y quedaron tres mil pendientes». Revisá el producto, total ₡5.000, pago ₡2.000 y saldo ₡3.000.
2. Probá corregir un dato en el formulario o con «Perdón, eran tres». El borrador y su revisión permanecen fuera del historial financiero. Podés cancelar ese borrador y volver a preparar el original.
3. Elegí **Revisar borrador** y, después de comprobar las cifras, **Confirmar venta**. Abrí el detalle o el historial desde el resultado.
4. En el mismo asistente, con permisos gerenciales, preguntá «¿Cuánto vendimos hoy?». Compará la respuesta con el dashboard de la jornada.
5. Cambiá a **Cafetería Demo** y escribí «Vendí un café filtrado». La semilla establece ₡1.800 y deja el pago inicial pendiente de indicar.

Para pagos divididos, prepará una venta de ₡5.000 y agregá «Me pagaron dos mil en efectivo y tres mil con tarjeta». El modo demo admite estas expresiones y un vocabulario acotado. La venta manual conserva su acceso cuando falla el proveedor. El recorrido de navegador se reproduce con `npm run test:e2e -- tests/e2e/conversation.spec.ts` tras compilar.

- [Guion de tres minutos para Dojo](docs/dojo-demo.md)
- [Validación de OpenAI y control de consumo](docs/openai-validacion.md)
- [Configuración y recuperación de una demo aislada](docs/demo-alojada.md)
- [Contrato fiscal Fase 6A y prueba sin conexión](docs/fase-6a-fiscal.md)
- [Auditoría e integración de FER AI Web con Core](docs/integracion-web-core.md)

### Supabase en el entorno administrado

Si el proxy del entorno desvía el control de salud interno de GoTrue y la CLI informa un HTTP 403, iniciá la pila con `DO_NOT_TRACK=1 npm run db:start -- --ignore-health-check`. Después comprobá el endpoint local con `curl --noproxy '*' --fail --silent --output /dev/null http://127.0.0.1:54321/auth/v1/health` y ejecutá las pruebas de Auth y RLS. Ese control de la CLI puede fallar aunque el servicio responda directamente.

## Verificación reproducible

Usá una instancia local desechable y mantené libre el puerto 3000 para Playwright. `db:reset` elimina los datos locales y reaplica las migraciones y la semilla.

```sh
npm run db:reset
npm run demo:seed
npm run typecheck
npm run lint
npm test
npm run test:db
npm run test:collections
npm run test:operations
npm run test:intelligence
npm run test:conversation
npm run test:atomic
npm run test:collection-atomic
npm run test:conversation-atomic
npm run build
npx playwright install chromium
npm run test:e2e
```

Si Chromium ya está instalado, podés usar `FERIA_CHROMIUM_PATH=/ruta/a/chromium npm run test:e2e`. Playwright arranca el build en loopback. Las pruebas móviles dejan ventas ficticias en la base. Las pruebas de cobros incluyen una jornada histórica controlada y dos solicitudes concurrentes reales. El test de atomicidad usa el contenedor de PostgreSQL administrado por la CLI local y revierte sus cambios de prueba. Los scripts de semilla e integración requieren una URL de loopback.

## Estructura

| Ruta                   | Responsabilidad                                                               |
| ---------------------- | ----------------------------------------------------------------------------- |
| `src/app/`             | Rutas de acceso, selección, panel, catálogo, ventas y configuración.          |
| `src/modules/`         | Sesión, autorización, catálogo, venta, medios de pago y contrato monetario.   |
| `src/components/`      | Navegación, formularios e interfaz compartida.                                |
| `supabase/migrations/` | Integridad relacional, RLS, permisos y operaciones transaccionales.           |
| `scripts/` y `tests/`  | Provisionamiento ficticio y pruebas unitarias, de integración y de navegador. |

Consultá [el diseño de continuidad](docs/continuidad.md), [las reglas del repositorio](AGENTS.md) y [la evidencia previa al hackathon](docs/evidencia-hackathon.md).
