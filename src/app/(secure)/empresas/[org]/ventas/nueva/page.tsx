import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Empty, PageHeading } from "@/components/ui";
import { organizationAccess } from "@/modules/organizations/access";
import { catalog } from "@/modules/catalog/data";
import { confirmSale } from "@/modules/sales/actions";
import { SaleForm } from "./sale-form";

export const metadata = { title: "Registrar venta" };

export default async function NewSalePage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const { client, organization } = await organizationAccess(org);
  const products = await catalog(client, org, true);
  return (
    <>
      <Link className="back-link" href={`/empresas/${org}/ventas`}>
        ← Historial de ventas
      </Link>
      <PageHeading
        title="Registrar venta"
        description="Agregá los productos y registrá los pagos recibidos."
      />
      {products.length ? (
        <SaleForm
          products={products}
          currency={organization.currency}
          scale={organization.scale}
          request={randomUUID()}
          action={confirmSale.bind(null, org)}
        />
      ) : (
        <Empty
          icon="box"
          title="Necesitás un producto disponible"
          action={
            <Link
              className="button secondary"
              href={`/empresas/${org}/catalogo`}
            >
              Ver catálogo
            </Link>
          }
        >
          Agregá un producto activo con precio vigente.
        </Empty>
      )}
    </>
  );
}
