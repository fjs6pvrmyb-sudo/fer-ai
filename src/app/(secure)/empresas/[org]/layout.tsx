import Link from "next/link";
import { Brand, Icon } from "@/components/icon";
import { Navigation } from "@/components/navigation";
import { canManageOperations } from "@/modules/operations/model";
import { signOut } from "@/modules/auth/actions";
import { organizationAccess, roleLabels } from "@/modules/organizations/access";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const { organization, role } = await organizationAccess(org);
  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="workspace-identity">
          <Link href={`/empresas/${org}`} aria-label="FER AI, inicio">
            <Brand />
          </Link>
          <Link
            href="/empresas"
            className="company-switch"
            aria-label={`Cambiar empresa. Empresa actual: ${organization.name}`}
          >
            <span className="company-symbol">
              <Icon name="shop" size={17} />
            </span>
            <span>{organization.name}</span>
            <Icon name="switch" size={15} />
          </Link>
        </div>
        <Navigation org={org} operations={canManageOperations(role)} />
        <form action={signOut} className="sign-out">
          <button>
            <Icon name="exit" size={18} /> Cerrar sesión
          </button>
        </form>
      </aside>
      <div className="workspace-body">
        <header className="topbar">
          <span>{organization.name}</span>
          <span className="role-pill">{roleLabels[role]}</span>
        </header>
        <main id="contenido" tabIndex={-1} className="workspace-main">
          {children}
        </main>
      </div>
    </div>
  );
}
