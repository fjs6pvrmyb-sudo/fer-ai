# Preparar una instancia aislada para Dojo

Este procedimiento corresponde a la revisión de Fase 5 `1eff12c830baffebf627006edd6cf51a28972e27`, que contiene seis migraciones. La migración fiscal posterior pertenece a la prueba offline de Fase 6A y requiere una revisión independiente para cualquier entorno alojado.

La opción evaluada usa un proyecto Vercel para Next.js y un proyecto Supabase exclusivo del evento. Mantené el ensayo local como alternativa si el proveedor de alojamiento elegido no ofrece protección de acceso en el plan autorizado. Confirmá disponibilidad, elegibilidad del plan y límites en las consolas antes de crear recursos. Para esta fase se verificó el arranque local con Next.js en modo de producción y Supabase local.

## Aprovisionar después de la autorización

1. Confirmá la visibilidad privada del repositorio desde una sesión autenticada y revisá el SHA aprobado. Publicá `work` solo después de recibir autorización para el respaldo. En Vercel, restringí la integración Git al repositorio, seleccioná Next.js con Node 24, instalá con `npm ci` y compilá con `npm run build`. Configurá la rama `work` como **Preview** con variables exclusivas del proyecto demo. La rama principal de GitHub se preserva.
2. Creá un Supabase exclusivo con datos ficticios. Verificá su identificador y región. Deshabilitá registros abiertos, proveedores de login que no se usen y redirecciones ajenas al dominio aprobado. Fijá la URL de sitio y una lista exacta de redirecciones HTTPS para la demo. Revisá la configuración de Auth en la consola, porque aplicar migraciones no copia `supabase/config.toml` al proyecto hospedado.
3. Desde el checkout aprobado y con la CLI ya autenticada, vinculá el proyecto autorizado mediante `npx supabase link --project-ref REF_DEMO`. Con la CLI 3.2 del lockfile, ejecutá `npx supabase db push --remote --include-seed --dry-run`. En un proyecto vacío deben aparecer las seis migraciones. Si coincide, aplicá `npx supabase db push --remote --include-seed`. La semilla contiene dos catálogos ficticios y una jornada de ventas vacía. El comando `demo:seed` es exclusivo de loopback y crea una cuenta administradora para pruebas locales.
4. Creá una cuenta Auth de demostración desde la consola, con un correo ficticio de `@feria.example` confirmado por administración, una contraseña aleatoria exclusiva y sin enviar correo. Vinculá el usuario a ambos negocios como `manager` con el siguiente SQL. Los asistentes del jurado que solo necesiten ver la presentación pueden usar la pantalla compartida. Si necesitan operar, creá una cuenta individual `operator` con membresía solo en el negocio asignado. El rol `manager` puede gestionar cierres y conciliación, y se reserva a la persona que presenta.

```sql
-- Ejecutar solo en el SQL Editor del proyecto demo aislado.
do $$
declare presenter uuid;
begin
  select id into strict presenter from auth.users
    where email = 'presentador@feria.example';
  if (select count(*) from public.organizations) <> 2 or exists (
    select 1 from public.organizations where id not in (
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002'
    )
  ) or exists (select 1 from public.sales) then
    raise exception 'Se requiere una base demo recién sembrada';
  end if;
  insert into public.memberships (organization_id, user_id, role, active)
  select id, presenter, 'manager', true from public.organizations
  on conflict (organization_id, user_id) do update
    set role = excluded.role, active = true;
end $$;
```

## Variables y acceso

| Variable                                   | Valor en la demo alojada                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                 | URL HTTPS del proyecto demo                                                                              |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`     | Clave publicable del mismo proyecto, protegida por RLS                                                   |
| `FER_INTELLIGENCE_MODE`                    | `demo` como configuración inicial                                                                        |
| `OPENAI_API_KEY`, `FER_INTELLIGENCE_MODEL` | Ausentes en la demo determinista. Solo para una validación real autorizada, como variables del servidor. |

`SUPABASE_SERVICE_ROLE_KEY` y `FERIA_DEMO_PASSWORD` se usan en las pruebas y la semilla de usuarios local. Dejalas fuera del runtime alojado. Guardá la contraseña de la cuenta Auth en un gestor con acceso limitado. Evitá grabar la pantalla de ingreso y desactivá enlaces compartidos que omitan la protección del proveedor.

Usá **Deployment Protection** o un acceso equivalente con autenticación y HTTPS antes de compartir una URL. Confirmá desde un móvil en otra red que un visitante anónimo no accede, que el jurado autorizado sí puede entrar y que la navegación completa funciona. Revisá que Auth rechace altas abiertas. Aplicá límites de tráfico a acceso y acciones en la plataforma o proxy elegido, conservá la cuota del asistente y monitorizá solicitudes y errores. El endpoint de Supabase es independiente de Vercel. Mantené sus controles de Auth y RLS y verificá acceso cruzado con la cuenta operadora. La cuota del asistente controla solicitudes por usuario y los límites externos deben cubrir abuso distribuido. [Protección de Vercel](https://vercel.com/docs/deployment-protection)

## Reinicio y recuperación

- Ensayá desde una base local desechable con `npm run db:reset` y `npm run demo:seed`. Dejá lista una copia local para compartir pantalla si falla la conexión del jurado.
- Para recuperar el frontend alojado, probá volver al último despliegue permitido que comparta el esquema comprobado. La base y sus migraciones se revisan por separado.
- Para volver a una instalación alojada limpia, provisioná otro proyecto de demo autorizado, repetí los pasos y apuntá un nuevo Preview a ese proyecto. Verificá los permisos y cerrá el acceso al anterior. Reservá `db reset` para el entorno local. Conservá la evidencia ficticia que se vaya a mostrar antes de retirar un entorno.
- Después del evento, desactivá las cuentas y el acceso externo. Si se habilitó OpenAI, revocá la clave de demo y comprobá el consumo facturado.
