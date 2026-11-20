import Link from "next/link";
import { Icon } from "@/components/icon";
import { formatMoney } from "@/modules/shared/money";

const example = {
  product: "Pan de masa madre",
  total: 500_000n,
  reported: 200_000n,
};
const amounts = [
  ["Total de la venta", example.total],
  ["Pago informado", example.reported],
  ["Saldo pendiente", example.total - example.reported],
] as const;
const money = (amount: bigint) => formatMoney(amount, "CRC", 2);

function Amounts() {
  return (
    <dl className="marketing-amounts">
      {amounts.map(([label, amount]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{money(amount)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ExamplePreview() {
  return (
    <aside
      className="marketing-preview"
      aria-label="Ejemplo ficticio de una venta"
    >
      <div className="marketing-preview-top">
        <span className="marketing-icon">
          <Icon name="chat" size={20} />
        </span>
        <div>
          <strong>Preguntale a FER</strong>
          <p>Panadería Demo · Ejemplo ficticio</p>
        </div>
      </div>
      <div className="marketing-preview-body">
        <p className="marketing-example-message">
          «Vendí un pan de masa madre. Me pagaron ₡2.000 por SINPE y quedaron
          ₡3.000 pendientes».
        </p>
        <div className="marketing-example-draft">
          <div className="marketing-draft-title">
            <h2>Borrador de venta</h2>
            <span className="status warning">En revisión</span>
          </div>
          <p>1 × {example.product}</p>
          <Amounts />
        </div>
      </div>
    </aside>
  );
}

export function ProductDemo() {
  return (
    <section id="demostracion" className="marketing-section marketing-demo">
      <div className="marketing-shell marketing-split">
        <div className="marketing-section-copy">
          <h2>Una venta, desde el mensaje hasta el saldo</h2>
          <p>
            Contale a FER qué vendiste. El asistente prepara un borrador que
            podés revisar y corregir antes de guardar la venta.
          </p>
          <Link className="text-link" href="/colaborador">
            Ir al espacio de ventas <Icon name="arrow" size={17} />
          </Link>
        </div>
        <div className="surface marketing-demo-panel">
          <p>
            <strong>Demostración ficticia sin persistencia.</strong>
          </p>
          <p>
            Este ejemplo muestra cómo se desglosa el pago informado y el saldo.
          </p>
          <details>
            <summary>Ver desglose del ejemplo</summary>
            <p>1 × {example.product} · Transferencia/SINPE informado.</p>
            <Amounts />
          </details>
        </div>
      </div>
    </section>
  );
}
