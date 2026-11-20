import { paymentLabels } from "@/modules/payments/methods";
import type { Metrics } from "./model";

export function Totals({
  stats,
  money,
}: {
  stats: Metrics;
  money: (value: string) => string;
}) {
  return (
    <dl className="facts">
      <div>
        <dt>Cantidad de ventas</dt>
        <dd>{stats.sale_count}</dd>
      </div>
      <div>
        <dt>Ventas netas registradas</dt>
        <dd>{money(stats.sales_minor)}</dd>
      </div>
      <div>
        <dt>Cobros registrados</dt>
        <dd>{money(stats.collected_minor)}</dd>
      </div>
      <div>
        <dt>Cobros de ventas anteriores</dt>
        <dd>{money(stats.prior_sales_minor)}</dd>
      </div>
      <div className="balance-line">
        <dt>Saldo pendiente al corte</dt>
        <dd>{money(stats.outstanding_minor)}</dd>
      </div>
    </dl>
  );
}

export function PaymentBreakdown({
  stats,
  money,
}: {
  stats: Metrics;
  money: (value: string) => string;
}) {
  return stats.methods.length ? (
    <dl className="facts">
      {stats.methods.map(({ method, amount_minor }) => (
        <div key={method}>
          <dt>{paymentLabels[method]}</dt>
          <dd>{money(amount_minor)}</dd>
        </div>
      ))}
    </dl>
  ) : (
    <p className="muted">No hay cobros en el período.</p>
  );
}
