import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, PageHeading } from "@/components/ui";
import { MutationForm } from "@/components/form";
import { organizationAccess } from "@/modules/organizations/access";
import { saveEvidence } from "@/modules/operations/actions";
import {
  canManageOperations,
  daySchema,
  evidenceKindLabels,
  evidenceKinds,
  evidenceLabels,
  evidenceStatus,
  operationsMetrics,
  reconciliationState,
  todayIn,
} from "@/modules/operations/model";
import { paymentLabels, type PaymentMethod } from "@/modules/payments/methods";
import { decimalAmount, formatMoney } from "@/modules/shared/money";

type Movement = {
  id: string;
  sale_id: string;
  method: PaymentMethod;
  amount_minor: string;
  kind: (typeof evidenceKinds)[number] | null;
  reference: string | null;
  evidence_minor: string | null;
  status: keyof typeof evidenceLabels;
  reviewer_id: string | null;
  reviewed_at: string | null;
  notes: string | null;
};

export const metadata = { title: "Conciliación" };

export default async function Reconciliation({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ fecha?: string; pagina?: string }>;
}) {
  const { org } = await params;
  const { organization, role, client, user } = await organizationAccess(org);
  if (!canManageOperations(role)) notFound();
  const query = await searchParams;
  const today = todayIn(organization.timezone);
  const valid =
    !query.fecha ||
    (daySchema.safeParse(query.fecha).success && query.fecha <= today);
  const day = valid && query.fecha ? query.fecha : today;
  const page = /^\d{1,4}$/.test(query.pagina ?? "")
    ? Math.max(1, Number(query.pagina))
    : 1;
  const offset = (page - 1) * 50;
  const [payments, metrics] = await Promise.all([
    client
      .from("reconciliation_payments")
      .select(
        "id,sale_id,method,amount_minor,kind,reference,evidence_minor,status,reviewer_id,reviewed_at,notes",
      )
      .eq("organization_id", org)
      .eq("day", day)
      .order("created_at")
      .order("id")
      .range(offset, offset + 50)
      .returns<Movement[]>(),
    client.rpc("operations_metrics", { p_org: org, p_from: day, p_to: day }),
  ]);
  if (payments.error || metrics.error)
    throw new Error("No se pudo consultar la conciliación");
  const report = operationsMetrics.parse(metrics.data);
  const money = (amount: string) =>
    formatMoney(amount, organization.currency, organization.scale);
  const timestamp = new Intl.DateTimeFormat("es-CR", {
    timeZone: organization.timezone,
    dateStyle: "short",
    timeStyle: "short",
  });
  const base = `/empresas/${org}`;
  const pageLink = (number: number) =>
    `${base}/conciliacion?fecha=${day}&pagina=${number}`;
  return (
    <>
      <PageHeading
        title="Conciliación"
        description={`Revisión documental · ${organization.name} · ${day}`}
        action={
          <Link className="button secondary" href={`${base}/jornadas/${day}`}>
            Ver jornada
          </Link>
        }
      />
      <form className="surface panel operations-filter">
        <label>
          Fecha de cobro
          <input
            type="date"
            name="fecha"
            defaultValue={day}
            max={today}
            required
          />
        </label>
        <button className="button secondary">Consultar</button>
      </form>
      {!valid && (
        <p className="feedback error" role="alert">
          Elegí una jornada válida. Se muestra la fecha actual.
        </p>
      )}
      <section
        className="surface panel operations-block"
        aria-label="Estado documental"
      >
        <h2>{reconciliationState(report)}</h2>
        <p>
          Verificados: {money(report.verified_minor)} · Pagos por verificar:{" "}
          {report.unverified_count} · Discrepancias: {report.discrepancy_count}.
        </p>
        <p>
          La revisión documental conserva los importes de los cobros
          registrados.
        </p>
      </section>
      {payments.data.length ? (
        <section className="sale-items" aria-label="Movimientos para conciliar">
          {payments.data.slice(0, 50).map((payment) => (
            <article className="surface panel" key={payment.id}>
              <header className="section-heading operations-row">
                <h2>
                  {paymentLabels[payment.method]} ·{" "}
                  {money(payment.amount_minor)}
                </h2>
                <span
                  className={`status ${payment.status === "verified" ? "success" : "warning"}`}
                >
                  {evidenceLabels[payment.status]}
                </span>
              </header>
              <p className="record-id">
                Movimiento <code>{payment.id}</code>
              </p>
              <Link
                className="text-link"
                href={`${base}/ventas/${payment.sale_id}`}
              >
                Ver venta
              </Link>
              {payment.reference && (
                <dl className="facts">
                  <div>
                    <dt>Referencia documental</dt>
                    <dd>{payment.reference}</dd>
                  </div>
                  {payment.evidence_minor && (
                    <div>
                      <dt>Importe documental</dt>
                      <dd>{money(payment.evidence_minor)}</dd>
                    </div>
                  )}
                  {payment.reviewed_at && (
                    <div>
                      <dt>Revisión</dt>
                      <dd>
                        {timestamp.format(new Date(payment.reviewed_at))} ·{" "}
                        {payment.reviewer_id === user.id
                          ? "Tu cuenta"
                          : payment.reviewer_id}
                      </dd>
                    </div>
                  )}
                  {payment.notes && (
                    <div>
                      <dt>Observaciones</dt>
                      <dd>{payment.notes}</dd>
                    </div>
                  )}
                </dl>
              )}
              <details>
                <summary>
                  {payment.reference
                    ? "Actualizar revisión"
                    : "Agregar evidencia"}
                </summary>
                <MutationForm
                  action={saveEvidence.bind(null, org, payment.id, day)}
                  submit="Guardar revisión"
                >
                  <label>
                    Tipo de comprobante
                    <select
                      name="kind"
                      defaultValue={
                        payment.kind ??
                        (payment.method === "cash" ? "receipt" : payment.method)
                      }
                    >
                      {evidenceKinds.map((kind) => (
                        <option key={kind} value={kind}>
                          {evidenceKindLabels[kind]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Referencia documental
                    <input
                      name="reference"
                      required
                      maxLength={120}
                      defaultValue={payment.reference ?? ""}
                    />
                  </label>
                  <label>
                    Importe documental ({organization.currency})
                    <input
                      name="amount"
                      required
                      inputMode="decimal"
                      maxLength={30}
                      defaultValue={
                        payment.evidence_minor === null
                          ? ""
                          : decimalAmount(
                              payment.evidence_minor,
                              organization.scale,
                            )
                      }
                    />
                  </label>
                  <label>
                    Estado
                    <select
                      key={payment.status}
                      name="status"
                      defaultValue={
                        payment.status === "missing"
                          ? "pending"
                          : payment.status
                      }
                    >
                      {evidenceStatus.map((status) => (
                        <option key={status} value={status}>
                          {evidenceLabels[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Observaciones
                    <textarea
                      className="operations-notes"
                      name="notes"
                      rows={2}
                      maxLength={500}
                      defaultValue={payment.notes ?? ""}
                    />
                  </label>
                </MutationForm>
              </details>
            </article>
          ))}
        </section>
      ) : (
        <Empty icon="wallet" title="No hay movimientos para mostrar">
          Consultá otra fecha o volvé a la página anterior.
        </Empty>
      )}
      {(page > 1 || payments.data.length > 50) && (
        <nav className="operations-filter" aria-label="Páginas de conciliación">
          {page > 1 && (
            <Link className="button secondary" href={pageLink(page - 1)}>
              Anterior
            </Link>
          )}
          {payments.data.length > 50 && (
            <Link className="button secondary" href={pageLink(page + 1)}>
              Siguiente
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
