import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeading } from "@/components/ui";
import { organizationAccess } from "@/modules/organizations/access";
import { paymentLabels, type PaymentMethod } from "@/modules/payments/methods";
import { saleStatus, type Sale } from "@/modules/sales/contract";
import { formatMoney } from "@/modules/shared/money";
import { mayCollect } from "@/modules/payments/collection";
import { collectPayment } from "@/modules/payments/actions";
import { CollectionForm } from "./collection-form";

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
  occurred_at: string;
  created_at: string;
};

export const metadata = { title: "Venta registrada" };

export default async function SalePage({
  params,
}: {
  params: Promise<{ org: string; sale: string }>;
}) {
  const { org, sale } = await params;
  const { client, organization, role } = await organizationAccess(org);
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
      .select("id,method,amount_minor,day,occurred_at,created_at")
      .eq("organization_id", org)
      .eq("sale_id", sale)
      .order("created_at")
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
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: organization.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const day = local.format(new Date());
  const timestamp = new Intl.DateTimeFormat("es-CR", {
    timeZone: organization.timezone,
    dateStyle: "short",
    timeStyle: "short",
  });
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
                      <span className="secondary-line">
                        Jornada {payment.day}
                      </span>
                      <span className="secondary-line">
                        {payment.created_at === payment.occurred_at
                          ? "Fecha efectiva y de registro: "
                          : "Fecha efectiva: "}
                        {timestamp.format(new Date(payment.occurred_at))}
                      </span>
                      {payment.created_at !== payment.occurred_at && (
                        <span className="secondary-line">
                          Fecha de registro:{" "}
                          {timestamp.format(new Date(payment.created_at))}
                        </span>
                      )}
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
          {mayCollect(role) && (
            <CollectionForm
              key={sale}
              request={randomUUID()}
              day={day}
              currency={record.currency}
              scale={record.scale}
              balance={record.balance_minor}
              action={collectPayment.bind(null, org, sale)}
            />
          )}
        </section>
      </div>
    </>
  );
}
