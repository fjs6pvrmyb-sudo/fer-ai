import Link from "next/link";
import { notFound } from "next/navigation";
import { MutationForm } from "@/components/form";
import { PageHeading } from "@/components/ui";
import { organizationAccess } from "@/modules/organizations/access";
import { updateClosing } from "@/modules/operations/actions";
import {
  canManageOperations,
  dayReview,
  daySchema,
  operatingState,
  reconciliationState,
  todayIn,
} from "@/modules/operations/model";
import { PaymentBreakdown, Totals } from "@/modules/operations/totals";
import { formatMoney } from "@/modules/shared/money";
import { CloseReviewForm } from "./close-form";

type Sale = { id: string; total_minor: string };
export const metadata = { title: "Cierre operativo" };

export default async function DayPage({
  params,
}: {
  params: Promise<{ org: string; day: string }>;
}) {
  const { org, day } = await params;
  const { organization, role, client, user } = await organizationAccess(org);
  if (
    !canManageOperations(role) ||
    !daySchema.safeParse(day).success ||
    day > todayIn(organization.timezone)
  )
    notFound();
  const [review, sales] = await Promise.all([
    client.rpc("day_review", { p_org: org, p_day: day }),
    client
      .from("sales_overview")
      .select("id,total_minor")
      .eq("organization_id", org)
      .eq("day", day)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<Sale[]>(),
  ]);
  if (review.error || sales.error)
    throw new Error("No se pudo consultar la jornada");
  const { state, snapshot, metrics, review_version } = dayReview.parse(
    review.data,
  );
  const figures = snapshot?.metrics ?? metrics;
  const money = (amount: string) =>
    formatMoney(
      amount,
      snapshot?.currency ?? organization.currency,
      snapshot?.scale ?? organization.scale,
    );
  const base = `/empresas/${org}`;
  return (
    <>
      <Link className="back-link" href={`${base}/jornadas`}>
        ← Historial de jornadas
      </Link>
      <PageHeading
        title={state === "open" ? "Jornada diaria" : "Cierre operativo"}
        description={`${organization.name} · ${day}`}
        action={
          <span
            className={`status ${state === "closed" ? "success" : "warning"}`}
          >
            {operatingState[state]}
          </span>
        }
      />
      <div className="sale-layout">
        <div className="sale-items">
          <section className="surface panel">
            <h2>
              {snapshot
                ? "Instantánea del cierre"
                : "Movimientos de la jornada"}
            </h2>
            <Totals stats={figures} money={money} />
          </section>
          <section className="surface panel">
            <h2>Cobros por medio</h2>
            <PaymentBreakdown stats={figures} money={money} />
            <p>
              Conciliación actual:{" "}
              <strong>{reconciliationState(metrics)}</strong>. Pagos por
              verificar: {metrics.unverified_count}.
            </p>
            {snapshot && (
              <p>Pagos por verificar al cierre: {figures.unverified_count}.</p>
            )}
            <Link
              className="text-link"
              href={`${base}/conciliacion?fecha=${day}`}
            >
              Ver conciliación
            </Link>
          </section>
          {sales.data.length > 0 && (
            <section className="surface panel">
              <h2>Ventas de la jornada</h2>
              <dl className="facts">
                {sales.data.map((sale) => (
                  <div key={sale.id}>
                    <dt>
                      <Link
                        className="text-link"
                        href={`${base}/ventas/${sale.id}`}
                      >
                        Venta {sale.id.slice(0, 8)}
                      </Link>
                    </dt>
                    <dd>{money(sale.total_minor)}</dd>
                  </div>
                ))}
              </dl>
              <p>Se muestran hasta 50 ventas.</p>
            </section>
          )}
        </div>
        <section className="surface panel sale-summary">
          <h2>Conteo de efectivo</h2>
          <dl className="facts">
            <div>
              <dt>Efectivo esperado</dt>
              <dd>{money(figures.cash_minor)}</dd>
            </div>
            <div>
              <dt>Efectivo contado</dt>
              <dd>
                {snapshot?.cash_counted_minor == null
                  ? "Pendiente"
                  : money(snapshot.cash_counted_minor)}
              </dd>
            </div>
            <div>
              <dt>Diferencia de conteo</dt>
              <dd>
                {snapshot?.cash_difference_minor == null
                  ? "Sin determinar"
                  : money(snapshot.cash_difference_minor)}
              </dd>
            </div>
          </dl>
          <p className="muted">
            El esperado solo incluye cobros en efectivo registrados. El conteo
            no contempla fondo inicial ni retiros.
          </p>
          {snapshot ? (
            <>
              <p>
                Cierre {snapshot.id.slice(0, 8)} · Versión {snapshot.version}
              </p>
              <p>
                Responsable:{" "}
                {snapshot.actor_id === user.id
                  ? "Tu cuenta"
                  : snapshot.actor_id}
              </p>
              <p>
                Confirmado el{" "}
                {new Intl.DateTimeFormat("es-CR", {
                  dateStyle: "short",
                  timeStyle: "short",
                  timeZone: organization.timezone,
                }).format(new Date(snapshot.closed_at))}
              </p>
            </>
          ) : state === "closed" ? (
            <p className="feedback error">
              La jornada está cerrada y no tiene instantánea registrada.
            </p>
          ) : (
            <>
              <p className="muted">
                Responsable de la confirmación: {user.email ?? user.id}
              </p>
              {state === "open" ? (
                <MutationForm
                  action={updateClosing.bind(null, org, day, null)}
                  submit="Iniciar revisión"
                >
                  {null}
                </MutationForm>
              ) : (
                <CloseReviewForm
                  action={updateClosing.bind(null, org, day, review_version)}
                  expected={figures.cash_minor}
                  currency={organization.currency}
                  scale={organization.scale}
                />
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
