import Link from "next/link";
import { Icon } from "@/components/icon";
import { Empty, PageHeading } from "@/components/ui";
import { organizationAccess } from "@/modules/organizations/access";
import { formatMoney } from "@/modules/shared/money";
import { catalog } from "@/modules/catalog/data";

import { canManageOperations } from "@/modules/operations/model";
import { ManagementDashboard } from "@/modules/operations/dashboard";

export const metadata = { title: "Inicio" };

export default async function Dashboard({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const { org } = await params;
  const { client, organization, role } = await organizationAccess(org);
  const newSale = (
    <Link className="button primary" href={`/empresas/${org}/ventas/nueva`}>
      <Icon name="plus" size={18} /> Registrar venta
    </Link>
  );
  const products = await catalog(client, org, true);
  const currency = (amount: string) =>
    formatMoney(amount, organization.currency, organization.scale);
  return (
    <>
      <PageHeading
        title="Inicio"
        description={`Resumen operativo de ${organization.name}.`}
        action={newSale}
      />
      {canManageOperations(role) && (
        <ManagementDashboard
          client={client}
          organization={organization}
          query={await searchParams}
        />
      )}
      <div className="section-heading">
        <h2>Catálogo vigente</h2>
        <Link className="text-link" href={`/empresas/${org}/catalogo`}>
          Ver catálogo <Icon name="arrow" size={16} />
        </Link>
      </div>
      {products.length ? (
        <div className="surface list">
          {products.slice(0, 4).map((product) => (
            <div className="list-row" key={product.id}>
              <span className="icon-tile compact">
                <Icon name="box" size={17} />
              </span>
              <span>{product.name}</span>
              <strong>{currency(product.amount_minor)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon="box" title="El catálogo está vacío">
          Agregá un producto con precio vigente para poder registrar ventas.
        </Empty>
      )}
    </>
  );
}
