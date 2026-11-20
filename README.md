# FER AI

Aplicación web multiempresa para registrar ventas y pagos. Esta versión incluye autenticación con Supabase, catálogo con precios vigentes, venta manual y consulta de operaciones persistidas. La Panadería y Business comparten el mismo núcleo y se configuran por organización.

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

Abrí `http://127.0.0.1:3000/acceso` e ingresá con la contraseña que elegiste. Las cuentas ficticias son:

| Correo                    | Panadería Demo | Cafetería Demo |
| ------------------------- | -------------- | -------------- |
| `admin@feria.example`     | Administrador  | Gerente        |
| `operador@feria.example`  | Operador       | —              |
| `cafeteria@feria.example` | —              | Operador       |

En **Panadería Demo → Registrar venta**, elegí una unidad de **Pan de masa madre**, que cuesta ₡5.000 en la semilla. Agregá un pago de 2000 en efectivo, revisá y confirmá. El detalle identifica la venta y muestra un saldo de ₡3.000. Volvé a **Ventas** para localizar el mismo identificador. Cambiá a Cafetería Demo para ver su catálogo independiente.

En **Catálogo**, un administrador puede agregar o editar productos. Los cambios de precio preservan la versión anterior. En **Configuración** puede editar nombre y zona horaria y gestionar el acceso de cuentas ya provisionadas en Supabase Auth. La moneda y su escala se definen al aprovisionar una organización. La demo usa CRC y `America/Costa_Rica` y registra ventas con cantidades enteras.

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
npm run test:atomic
npm run build
npx playwright install chromium
npm run test:e2e
```

Si Chromium ya está instalado, podés usar `FERIA_CHROMIUM_PATH=/ruta/a/chromium npm run test:e2e`. Playwright arranca el build en loopback. La prueba móvil deja una venta ficticia en la base. El test de atomicidad usa el contenedor de PostgreSQL administrado por la CLI local y revierte sus cambios de prueba. Los scripts de semilla e integración requieren una URL de loopback.

## Estructura

| Ruta                   | Responsabilidad                                                               |
| ---------------------- | ----------------------------------------------------------------------------- |
| `src/app/`             | Rutas de acceso, selección, panel, catálogo, ventas y configuración.          |
| `src/modules/`         | Sesión, autorización, catálogo, venta, medios de pago y contrato monetario.   |
| `src/components/`      | Navegación, formularios e interfaz compartida.                                |
| `supabase/migrations/` | Integridad relacional, RLS, permisos y operaciones transaccionales.           |
| `scripts/` y `tests/`  | Provisionamiento ficticio y pruebas unitarias, de integración y de navegador. |

Consultá [el diseño de continuidad](docs/continuidad.md), [las reglas del repositorio](AGENTS.md) y [la evidencia previa al hackathon](docs/evidencia-hackathon.md).
