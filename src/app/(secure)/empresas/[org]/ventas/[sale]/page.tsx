import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeading } from "@/components/ui";
import { organizationAccess } from "@/modules/organizations/access";
import { paymentLabels, type PaymentMethod } from "@/modules/payments/methods";
import { saleStatus, type Sale } from "@/modules/sales/contract";
import { formatMoney } from "@/modules/shared/money";

type Line = {
  id: string;
  product_name: string;
  quantity: number;
  unit_minor: string;
};
type Payment = {
  id: string;
  method: PaymentMethod;
  amount_minor: string;
  day: string;
};

export const metadata = { title: "Venta registrada" };

export default async function SalePage({
  params,
}: {
  params: Promise<{ org: string; sale: string }>;
}) {
  const { org, sale } = await params;
  const { client } = await organizationAccess(org);
  if (!z.uuid().safeParse(sale).success) notFound();
  const [entry, lines, payments] = await Promise.all([
    client
      .from("sales_overview")
      .select(
        "id,day,created_at,currency,scale,total_minor,paid_minor,balance_minor",
      )
      .eq("organization_id", org)
      .eq("id", sale)
      .maybeSingle<Sale>(),
    client
      .from("sale_line_details")
      .select("id,product_name,quantity,unit_minor")
      .eq("organization_id", org)
      .eq("sale_id", sale)
      .order("product_name")
      .returns<Line[]>(),
    client
      .from("payment_details")
      .select("id,method,amount_minor,day")
      .eq("organization_id", org)
      .eq("sale_id", sale)
      .order("id")
      .returns<Payment[]>(),
  ]);
  if (entry.error || lines.error || payments.error)
    throw new Error("No se pudo consultar la venta");
  if (!entry.data) notFound();
  const record = entry.data;
  const status = saleStatus(record);
  const currency = (amount: bigint | string) =>
    formatMoney(amount, record.currency, record.scale);
  return (
    <>
      <Link className="back-link" href={`/empresas/${org}/ventas`}>
        ← Historial de ventas
      </Link>
      <PageHeading
        title="Venta registrada"
        description={`Jornada del ${record.day}`}
        action={<span className={`status ${status.tone}`}>{status.label}</span>}
      />
      <p className="record-id">
        Identificador <code>{record.id}</code>
      </p>
      <div className="sale-layout">
        <div className="sale-items">
          <section className="surface panel">
            <h2>Productos</h2>
            <dl className="facts">
              {lines.data.map((line) => (
                <div key={line.id}>
                  <dt>
                    {line.quantity} × {line.product_name}
                  </dt>
                  <dd>
                    {currency(BigInt(line.unit_minor) * BigInt(line.quantity))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="surface panel">
            <h2>Pagos registrados</h2>
            {payments.data.length ? (
              <dl className="facts">
                {payments.data.map((payment) => (
                  <div key={payment.id}>
                    <dt>
                      {paymentLabels[payment.method]}{" "}
                      <span className="secondary-line">{payment.day}</span>
                    </dt>
                    <dd>{currency(payment.amount_minor)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="muted">
                Esta venta todavía no tiene pagos registrados.
              </p>
            )}
          </section>
        </div>
        <section className="surface panel sale-summary">
          <h2>Resumen</h2>
          <dl className="facts">
            <div>
              <dt>Total de venta</dt>
              <dd>{currency(record.total_minor)}</dd>
            </div>
            <div>
              <dt>Pago registrado</dt>
              <dd>{currency(record.paid_minor)}</dd>
            </div>
            <div className="balance-line">
              <dt>Saldo pendiente</dt>
              <dd>{currency(record.balance_minor)}</dd>
            </div>
          </dl>
        </section>
      </div>
    </>
  );
}
