import { MutationForm } from "@/components/form";
import { PageHeading } from "@/components/ui";
import {
  organizationAccess,
  roleLabels,
  roles,
  type Role,
} from "@/modules/organizations/access";
import {
  saveMembership,
  saveOrganization,
} from "@/modules/organizations/actions";

type Member = { user_id: string; role: Role; active: boolean };

export const metadata = { title: "Configuración" };

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const { client, role, organization, user } = await organizationAccess(org);
  const members =
    role === "admin"
      ? await client
          .from("memberships")
          .select("user_id,role,active")
          .eq("organization_id", org)
          .order("user_id")
          .returns<Member[]>()
      : null;
  if (members?.error)
    throw new Error("No se pudieron consultar las membresías");
  return (
    <>
      <PageHeading
        title="Configuración"
        description="Preferencias y permisos de tu empresa."
      />
      <div className="settings-grid">
        <section className="surface panel">
          <h2>Empresa</h2>
          <dl className="facts">
            <div>
              <dt>Moneda operativa</dt>
              <dd>
                {organization.currency} · {organization.scale} decimales
              </dd>
            </div>
            <div>
              <dt>Tu rol</dt>
              <dd>{roleLabels[role]}</dd>
            </div>
            {role !== "admin" && (
              <div>
                <dt>Zona horaria</dt>
                <dd>{organization.timezone}</dd>
              </div>
            )}
          </dl>
          {role === "admin" && (
            <MutationForm
              action={saveOrganization.bind(null, org)}
              submit="Guardar configuración"
            >
              <label>
                Nombre de empresa
                <input
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={organization.name}
                />
              </label>
              <label>
                Zona horaria (IANA)
                <input
                  name="timezone"
                  required
                  maxLength={100}
                  defaultValue={organization.timezone}
                />
              </label>
            </MutationForm>
          )}
        </section>
        {members?.data && (
          <section className="surface panel">
            <h2>Membresías</h2>
            <ul className="members">
              {members.data.map((member) => (
                <li key={member.user_id}>
                  <strong>
                    {member.user_id === user.id ? "Tu cuenta" : member.user_id}
                  </strong>
                  <span>
                    {roleLabels[member.role]} ·{" "}
                    {member.active ? "Activa" : "Inactiva"}
                  </span>
                </li>
              ))}
            </ul>
            <details>
              <summary>Administrar membresía</summary>
              <p className="muted">
                Usá el identificador de una cuenta existente para asignar o
                revocar acceso.
              </p>
              <MutationForm
                action={saveMembership.bind(null, org)}
                submit="Guardar membresía"
              >
                <label>
                  Identificador de usuario
                  <input name="user" required maxLength={36} />
                </label>
                <label>
                  Rol
                  <select name="role">
                    {roles.map((value) => (
                      <option key={value} value={value}>
                        {roleLabels[value]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="check-label">
                  <input name="active" type="checkbox" defaultChecked /> Acceso
                  activo
                </label>
              </MutationForm>
            </details>
          </section>
        )}
      </div>
    </>
  );
}
