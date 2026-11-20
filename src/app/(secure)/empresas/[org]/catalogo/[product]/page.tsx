import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeading } from "@/components/ui";
import { organizationAccess } from "@/modules/organizations/access";
import { formatMoney } from "@/modules/shared/money";

type Price = {
  id: string;
  currency: string;
  scale: number;
  amount_minor: string;
  effective_at: string;
  ended_at: string | null;
};

export const metadata = { title: "Historial de precios" };

export default async function PriceHistory({
  params,
}: {
  params: Promise<{ org: string; product: string }>;
}) {
  const { org, product } = await params;
  const { client, organization } = await organizationAccess(org);
  if (!z.uuid().safeParse(product).success) notFound();
  const [item, prices] = await Promise.all([
    client
      .from("products")
      .select("name")
      .eq("organization_id", org)
      .eq("id", product)
      .maybeSingle<{ name: string }>(),
    client
      .from("catalog_price_history")
      .select("id,currency,scale,amount_minor,effective_at,ended_at")
      .eq("organization_id", org)
      .eq("product_id", product)
      .order("effective_at", { ascending: false })
      .limit(50)
      .returns<Price[]>(),
  ]);
  if (item.error || prices.error)
    throw new Error("No se pudo consultar el historial de precios");
  if (!item.data) notFound();
  const date = new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: organization.timezone,
  });
  return (
    <>
      <Link className="back-link" href={`/empresas/${org}/catalogo`}>
        ← Catálogo
      </Link>
      <PageHeading
        title={item.data.name}
        description="Últimas 50 versiones de precio."
      />
      <section className="surface panel">
        <h2>Historial de precios</h2>
        <dl className="facts">
          {prices.data.map((price) => (
            <div key={price.id}>
              <dt>
                {price.ended_at ? "Anterior" : "Vigente"}{" "}
                <span className="secondary-line">
                  Desde {date.format(new Date(price.effective_at))}
                </span>
              </dt>
              <dd>
                {formatMoney(price.amount_minor, price.currency, price.scale)}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
