import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Icon, type IconName } from "@/components/icon";
import { Empty } from "@/components/ui";
import type { Organization } from "@/modules/organizations/access";
import { formatMoney } from "@/modules/shared/money";
import { operationsMetrics, todayIn, validPeriod } from "./model";
import { PaymentBreakdown } from "./totals";

export async function ManagementDashboard({
  client,
  organization,
  query,
}: {
  client: SupabaseClient;
  organization: Organization;
  query: { desde?: string; hasta?: string };
}) {
  const { id: org, currency, scale, timezone } = organization;
  const today = todayIn(timezone);
  const from = query.desde ?? today;
  const to = query.hasta ?? from;
  const valid = validPeriod(from, to, today);
  const base = `/empresas/${org}`;
  const filter = (
    <form
      className="surface panel operations-filter"
      aria-label="Período del dashboard"
    >
      <label>
        Desde
        <input
          name="desde"
          type="date"
          defaultValue={from}
          max={today}
          required
        />
      </label>
      <label>
        Hasta
        <input
          name="hasta"
          type="date"
          defaultValue={to}
          max={today}
          required
        />
      </label>
      <button className="button secondary">Aplicar período</button>
    </form>
  );
  if (!valid)
    return (
      <>
        {filter}
        <p className="feedback error" role="alert">
          Seleccioná un período válido de hasta 366 días que termine hoy o
          antes.
        </p>
      </>
    );

  const [report, last, cashDifferences] = await Promise.all([
    client.rpc("operations_metrics", { p_org: org, p_from: from, p_to: to }),
    client
      .from("day_closures")
      .select("day")
      .eq("organization_id", org)
      .order("day", { ascending: false })
      .limit(1)
      .maybeSingle<{ day: string }>(),
    client
      .from("day_closures")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .gte("day", from)
      .lte("day", to)
      .neq("cash_difference_minor", 0),
  ]);
  if (
    report.error ||
    last.error ||
    cashDifferences.error ||
    cashDifferences.count === null
  )
    throw new Error("No se pudo consultar el dashboard operativo");

  const stats = operationsMetrics.parse(report.data);
  const money = (amount: string) => formatMoney(amount, currency, scale);
  const cards: {
    label: string;
    value: string;
    icon: IconName;
    tone: string;
  }[] = [
    {
      label: "Ventas del período",
      value: money(stats.sales_minor),
      icon: "trend",
      tone: "blue",
    },
    {
      label: "Cobros registrados",
      value: money(stats.collected_minor),
      icon: "wallet",
      tone: "teal",
    },
    {
      label: "Saldo pendiente al corte",
      value: money(stats.outstanding_minor),
      icon: "receipt",
      tone: "amber",
    },
  ];
  const empty =
    stats.sale_count === "0" &&
    stats.payment_count === "0" &&
    stats.outstanding_minor === "0";
  return (
    <section aria-label="Dashboard gerencial" className="sale-items">
      {filter}
      <p>
        Período consultado:{" "}
        <strong>
          {from} al {to}
        </strong>
        . El saldo incluye ventas de jornadas anteriores al corte.
      </p>
      {empty ? (
        <Empty icon="receipt" title="Todavía no hay ventas">
          No se encontraron ventas, cobros ni saldos para este corte.
        </Empty>
      ) : (
        <div className="metric-grid">
          {cards.map((metric) => (
            <article className="surface metric" key={metric.label}>
              <span className={`icon-tile ${metric.tone}`}>
                <Icon name={metric.icon} />
              </span>
              <h2>{metric.label}</h2>
              <p>{metric.value}</p>
            </article>
          ))}
        </div>
      )}
      <div className="settings-grid">
        <section className="surface panel">
          <h2>Actividad y medios de pago</h2>
          <dl className="facts">
            <div>
              <dt>Transacciones de venta</dt>
              <dd>{stats.sale_count}</dd>
            </div>
            <div>
              <dt>Cobros de ventas anteriores</dt>
              <dd>{money(stats.prior_sales_minor)}</dd>
            </div>
          </dl>
          <PaymentBreakdown stats={stats} money={money} />
          <Link className="text-link" href={`${base}/jornadas/${to}`}>
            Ver jornada del corte
          </Link>
        </section>
        <section className="surface panel">
          <h2>Cierres y conciliación</h2>
          <dl className="facts">
            <div>
              <dt>Jornadas abiertas / en revisión / cerradas</dt>
              <dd>
                {stats.open_days} / {stats.pending_days} / {stats.closed_days}
              </dd>
            </div>
            <div>
              <dt>Pagos por verificar</dt>
              <dd>{stats.unverified_count}</dd>
            </div>
            <div>
              <dt>Discrepancias documentales</dt>
              <dd>{stats.discrepancy_count}</dd>
            </div>
            <div>
              <dt>Cierres con diferencia de conteo</dt>
              <dd>{cashDifferences.count}</dd>
            </div>
            <div>
              <dt>Última jornada cerrada</dt>
              <dd>
                {last.data ? (
                  <Link
                    className="text-link"
                    href={`${base}/jornadas/${last.data.day}`}
                  >
                    Cerrada · {last.data.day}
                  </Link>
                ) : (
                  "Sin cierres"
                )}
              </dd>
            </div>
          </dl>
          <p className="muted">
            Cobertura: jornadas registradas en el período. La revisión
            documental refleja su estado actual.
          </p>
        </section>
      </div>
    </section>
  );
}
