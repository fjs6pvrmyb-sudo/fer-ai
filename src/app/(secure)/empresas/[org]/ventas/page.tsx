import Link from "next/link";
import { Icon } from "@/components/icon";
import { Empty, PageHeading } from "@/components/ui";
import { organizationAccess } from "@/modules/organizations/access";
import { saleStatus, type Sale } from "@/modules/sales/contract";
import { formatMoney } from "@/modules/shared/money";

export const metadata = { title: "Ventas" };

export default async function SalesPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const { client } = await organizationAccess(org);
  const { data, error } = await client
    .from("sales_overview")
    .select(
      "id,day,created_at,currency,scale,total_minor,paid_minor,balance_minor",
    )
    .eq("organization_id", org)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<Sale[]>();
  if (error) throw new Error("No se pudo consultar el historial");
  const newSale = (
    <Link className="button primary" href={`/empresas/${org}/ventas/nueva`}>
      <Icon name="plus" size={18} /> Registrar venta
    </Link>
  );
  return (
    <>
      <PageHeading
        title="Ventas"
        description="Últimas 50 operaciones de esta empresa."
        action={newSale}
      />
      {!data.length ? (
        <Empty icon="receipt" title="Todavía no hay ventas">
          Las ventas confirmadas aparecerán en este historial.
        </Empty>
      ) : (
        <section className="surface list" aria-label="Historial de ventas">
          {data.map((sale) => {
            const status = saleStatus(sale);
            return (
              <Link
                className="list-row sale-row"
                key={sale.id}
                href={`/empresas/${org}/ventas/${sale.id}`}
              >
                <span className="icon-tile compact">
                  <Icon name="receipt" size={18} />
                </span>
                <div>
                  <strong>Venta {sale.id.slice(0, 8)}</strong>
                  <span className="secondary-line">
                    {sale.day} · {status.label}
                  </span>
                </div>
                <div className="row-end">
                  <strong>
                    {formatMoney(sale.total_minor, sale.currency, sale.scale)}
                  </strong>
                  <span className="secondary-line">
                    Saldo{" "}
                    {formatMoney(sale.balance_minor, sale.currency, sale.scale)}
                  </span>
                </div>
              </Link>
            );
          })}
        </section>
      )}
    </>
  );
}
