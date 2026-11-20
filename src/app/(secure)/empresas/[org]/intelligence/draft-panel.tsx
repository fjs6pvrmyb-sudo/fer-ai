"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { Product } from "@/modules/catalog/data";
import type {
  DraftDocument,
  DraftKey,
  DraftView,
} from "@/modules/conversation/contract";
import { paymentLabels, type PaymentMethod } from "@/modules/payments/methods";
import { formatMoney } from "@/modules/shared/money";

type Result = { message: string; draft?: DraftView | null };
export type DraftControls = {
  base: string;
  currency: string;
  scale: number;
  products: Product[];
  methods: readonly PaymentMethod[];
  initial: DraftView | null;
  review: (key: DraftKey, document: DraftDocument) => Promise<Result>;
  confirm: (key: DraftKey) => Promise<Result>;
  cancel: (key: DraftKey) => Promise<Result>;
};

export function DraftPanel({
  draft,
  controls,
  onChange,
}: {
  draft: DraftView;
  controls: DraftControls;
  onChange: (draft: DraftView | null, message: string) => void;
}) {
  const [editor, setEditor] = useState(draft.document);
  const [editing, setEditing] = useState(draft.status === "editing");
  const [message, setMessage] = useState("");
  const [discard, setDiscard] = useState(false);
  const [pending, run] = useTransition();
  const key = { id: draft.id, revision: draft.revision };
  const { base, currency, scale, products, methods } = controls;
  const money = (value: string) => formatMoney(value, currency, scale);

  function process(action: () => Promise<Result>) {
    setMessage("");
    run(async () => {
      try {
        const result = await action();
        setMessage(result.message);
        if (result.draft !== undefined) onChange(result.draft, result.message);
      } catch {
        setMessage(
          "Se interrumpió la conexión. Reintentá con este mismo borrador.",
        );
      }
    });
  }

  if (draft.status === "confirmed" && draft.saleId) {
    return (
      <section
        className="surface panel sale-conversation-draft"
        aria-label="Resultado de la venta"
      >
        <h2>Venta registrada</h2>
        <p>
          Identificador: <strong>{draft.saleId}</strong>
        </p>
        <nav
          className="intelligence-sources"
          aria-label="Consultar la venta registrada"
        >
          <Link className="text-link" href={`${base}/ventas/${draft.saleId}`}>
            Abrir detalle
          </Link>
          <Link className="text-link" href={`${base}/ventas`}>
            Ver historial
          </Link>
          <Link className="text-link" href={base}>
            Ver dashboard
          </Link>
        </nav>
      </section>
    );
  }
  if (!editor) return null;

  return (
    <section
      className="surface panel sale-conversation-draft"
      aria-label="Borrador de venta"
    >
      <header>
        <span className="status warning">
          {draft.status === "review" && !editing
            ? "Pendiente de confirmación"
            : "Borrador editable"}
        </span>
        <h2>{editing ? "Borrador de venta" : "Revisión de la venta"}</h2>
        <p>
          Revisión {draft.revision} · {currency}
        </p>
      </header>
      {draft.problems.length > 0 && (
        <div className="feedback error" role="status">
          <strong>Datos para revisar</strong>
          <ul>
            {draft.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}
      {draft.quote && (
        <dl
          className="intelligence-indicators"
          aria-label="Resumen financiero del borrador"
        >
          {[
            ["Total calculado", draft.quote.total],
            ["Pago registrado en el borrador", draft.quote.paid],
            ["Saldo pendiente", draft.quote.balance],
          ].map(([label, amount]) => (
            <div className="intelligence-indicator" key={label}>
              <dt>{label}</dt>
              <dd>
                <strong>{money(amount)}</strong>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {editing ? (
        <form
          className="form-stack"
          action={() =>
            process(() =>
              controls.review(
                key,
                discard
                  ? {
                      ...editor,
                      items: editor.items.map((line) => ({
                        ...line,
                        reportedUnit: null,
                      })),
                      total: null,
                      balance: null,
                      issues: [],
                    }
                  : editor,
              ),
            )
          }
        >
          <fieldset disabled={pending} className="conversation-fields">
            <legend>Productos</legend>
            {editor.items.map((line, index) => (
              <div className="conversation-row" key={index}>
                {line.name && <p>Mención: {line.name}</p>}
                {draft.candidates[index]?.length > 0 && !line.productId && (
                  <p>
                    Candidatos:{" "}
                    {products
                      .filter((p) => draft.candidates[index].includes(p.id))
                      .map((p) => p.name)
                      .join(", ")}
                  </p>
                )}
                <label>
                  Producto {index + 1}
                  <select
                    value={line.productId ?? ""}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        items: editor.items.map((item, i) =>
                          i === index
                            ? { ...item, productId: event.target.value || null }
                            : item,
                        ),
                      })
                    }
                  >
                    <option value="">Elegí un producto</option>
                    {products.map(({ id, name, amount_minor }) => (
                      <option key={id} value={id}>
                        {name} · {money(amount_minor)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Cantidad {index + 1}
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    step={1}
                    value={line.quantity ?? ""}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        items: editor.items.map((item, i) =>
                          i === index
                            ? {
                                ...item,
                                quantity:
                                  event.target.value === ""
                                    ? null
                                    : event.target.valueAsNumber,
                              }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() =>
                    setEditor({
                      ...editor,
                      items: editor.items.filter((_, i) => i !== index),
                    })
                  }
                >
                  Quitar producto {index + 1}
                </button>
              </div>
            ))}
            <button
              className="button secondary"
              type="button"
              disabled={editor.items.length >= 20}
              onClick={() =>
                setEditor({
                  ...editor,
                  items: [
                    ...editor.items,
                    {
                      name: "",
                      productId: null,
                      quantity: null,
                      reportedUnit: null,
                    },
                  ],
                })
              }
            >
              Agregar producto
            </button>
          </fieldset>
          <fieldset disabled={pending} className="conversation-fields">
            <legend>Pagos recibidos</legend>
            {!editor.payments.length && <p>No se reportó un cobro inicial.</p>}
            {editor.payments.map((payment, index) => (
              <div className="conversation-row" key={index}>
                <label>
                  Medio del pago {index + 1}
                  <select
                    value={payment.method ?? ""}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        payments: editor.payments.map((item, i) =>
                          i === index
                            ? {
                                ...item,
                                method: (event.target.value ||
                                  null) as PaymentMethod | null,
                              }
                            : item,
                        ),
                      })
                    }
                  >
                    <option value="">Elegí un medio</option>
                    {methods.map((method) => (
                      <option key={method} value={method}>
                        {paymentLabels[method]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Importe del pago {index + 1}
                  <input
                    inputMode="decimal"
                    maxLength={30}
                    value={payment.amount ?? ""}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        payments: editor.payments.map((item, i) =>
                          i === index
                            ? { ...item, amount: event.target.value || null }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() =>
                    setEditor({
                      ...editor,
                      payments: editor.payments.filter((_, i) => i !== index),
                    })
                  }
                >
                  Quitar pago {index + 1}
                </button>
              </div>
            ))}
            <button
              className="button secondary"
              type="button"
              disabled={editor.payments.length >= 10}
              onClick={() =>
                setEditor({
                  ...editor,
                  payments: [
                    ...editor.payments,
                    { method: null, amount: null },
                  ],
                })
              }
            >
              Agregar pago
            </button>
          </fieldset>
          {editor.observation && (
            <p>Observación del borrador: {editor.observation}</p>
          )}
          {(editor.total !== null ||
            editor.balance !== null ||
            editor.items.some((line) => line.reportedUnit !== null) ||
            editor.issues.length > 0) && (
            <label className="conversation-checkbox">
              <input
                type="checkbox"
                checked={discard}
                disabled={pending}
                onChange={(event) => setDiscard(event.target.checked)}
              />
              Usar las cifras del catálogo y descartar los importes declarados
            </label>
          )}
          <div className="intelligence-sources">
            <button className="button primary" disabled={pending}>
              Revisar borrador
            </button>
          </div>
        </form>
      ) : (
        <div className="form-stack">
          <dl className="facts">
            {editor.items.map((line, index) => {
              const product = products.find(({ id }) => id === line.productId);
              return (
                <div key={index}>
                  <dt>
                    {product?.name ?? line.name} × {line.quantity}
                  </dt>
                  <dd>
                    {product ? money(product.amount_minor) : "Precio pendiente"}
                  </dd>
                </div>
              );
            })}
            {editor.payments.map((payment, index) => (
              <div key={index}>
                <dt>{payment.method && paymentLabels[payment.method]}</dt>
                <dd>
                  {payment.amount} {currency}
                </dd>
              </div>
            ))}
          </dl>
          <p>Al confirmar se registrará la venta con los pagos revisados.</p>
          <div className="intelligence-sources">
            <button
              className="button primary"
              type="button"
              disabled={pending || draft.problems.length > 0}
              onClick={() => process(() => controls.confirm(key))}
            >
              Confirmar venta
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={pending}
              onClick={() => setEditing(true)}
            >
              Editar borrador
            </button>
          </div>
        </div>
      )}
      <button
        className="button secondary conversation-cancel"
        type="button"
        disabled={pending}
        onClick={() => process(() => controls.cancel(key))}
      >
        Cancelar borrador
      </button>
      {pending && <p role="status">Procesando el borrador…</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
