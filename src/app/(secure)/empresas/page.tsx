import Link from "next/link";
import { Brand, Icon } from "@/components/icon";
import { Empty, PageHeading } from "@/components/ui";
import { signOut } from "@/modules/auth/actions";
import { requireSession } from "@/modules/auth/session";
import {
  roleLabels,
  type Organization,
  type Role,
} from "@/modules/organizations/access";

export const metadata = { title: "Elegí una empresa" };

export default async function CompaniesPage() {
  const { client, user } = await requireSession();
  const [companies, memberships] = await Promise.all([
    client
      .from("organizations")
      .select("id,name,currency,scale,timezone")
      .order("name")
      .returns<Organization[]>(),
    client
      .from("memberships")
      .select("organization_id,role")
      .eq("user_id", user.id)
      .eq("active", true)
      .returns<{ organization_id: string; role: Role }[]>(),
  ]);
  if (companies.error || memberships.error)
    throw new Error("No se pudieron cargar las empresas");
  const roles = new Map(
    memberships.data.map(({ organization_id, role }) => [
      organization_id,
      role,
    ]),
  );
  const available = companies.data.filter(({ id }) => roles.has(id));
  return (
    <>
      <header className="selection-header">
        <Brand />
        <form action={signOut}>
          <button className="button secondary">
            <Icon name="exit" size={17} /> Cerrar sesión
          </button>
        </form>
      </header>
      <main id="contenido" tabIndex={-1} className="standalone selection">
        <PageHeading
          title="Elegí una empresa"
          description="Seleccioná el espacio de trabajo que querés abrir."
        />
        {available.length ? (
          <div className="company-grid">
            {available.map((company) => (
              <Link
                key={company.id}
                href={`/empresas/${company.id}`}
                className="surface company-card"
              >
                <span className="icon-tile">
                  <Icon name="shop" size={24} />
                </span>
                <h2>{company.name}</h2>
                <span className="company-meta">
                  {roleLabels[roles.get(company.id)!]} · {company.currency}
                </span>
                <span className="company-open">
                  Abrir empresa <Icon name="arrow" size={18} />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <Empty icon="shop" title="Todavía no tenés empresas">
            Solicitá acceso a un administrador de la organización.
          </Empty>
        )}
      </main>
    </>
  );
}
