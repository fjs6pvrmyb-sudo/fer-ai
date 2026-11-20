import Link from "next/link";
import { z } from "zod";
import { Icon, type IconName } from "@/components/icon";
import { Empty, PageHeading } from "@/components/ui";
import { organizationAccess } from "@/modules/organizations/access";
import { formatMoney } from "@/modules/shared/money";
import { catalog } from "@/modules/catalog/data";

const summarySchema = z.object({
  sale_count: z.string(),
  total_minor: z.string(),
  paid_minor: z.string(),
  balance_minor: z.string(),
});

export const metadata = { title: "Inicio" };

export default async function Dashboard({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const { client, organization, role } = await organizationAccess(org);
  const newSale = (
    <Link className="button primary" href={`/empresas/${org}/ventas/nueva`}>
      <Icon name="plus" size={18} /> Registrar venta
    </Link>
  );
  const products = await catalog(client, org, true);
  let summary: z.infer<typeof summarySchema> | null = null;
  if (role !== "operator") {
    const result = await client.rpc("dashboard_summary", { p_org: org });
    if (result.error) throw new Error("No se pudo consultar el resumen");
    summary = result.data === null ? null : summarySchema.parse(result.data);
  }
  const currency = (amount: string) =>
    formatMoney(amount, organization.currency, organization.scale);
  const metrics: {
    label: string;
    icon: IconName;
    value: string;
    tone: string;
  }[] =
    summary && summary.sale_count !== "0"
      ? [
          {
            label: "Ventas registradas",
            icon: "trend",
            value: currency(summary.total_minor),
            tone: "blue",
          },
          {
            label: "Pagos registrados",
            icon: "wallet",
            value: currency(summary.paid_minor),
            tone: "teal",
          },
          {
            label: "Saldo por cobrar",
            icon: "receipt",
            value: currency(summary.balance_minor),
            tone: "amber",
          },
        ]
      : [];
  return (
    <>
      <PageHeading
        title="Inicio"
        description={`Resumen operativo de ${organization.name}.`}
        action={newSale}
      />
      {role !== "operator" &&
        (metrics.length ? (
          <section
            aria-label="Totales de todas las ventas"
            className="metric-grid"
          >
            {metrics.map((metric) => (
              <article className="surface metric" key={metric.label}>
                <span className={`icon-tile ${metric.tone}`}>
                  <Icon name={metric.icon} />
                </span>
                <h2>{metric.label}</h2>
                <p>{metric.value}</p>
              </article>
            ))}
          </section>
        ) : (
          <Empty icon="receipt" title="Todavía no hay ventas">
            Los totales de ventas, pagos y saldos aparecerán al registrar la
            primera operación.
          </Empty>
        ))}
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
