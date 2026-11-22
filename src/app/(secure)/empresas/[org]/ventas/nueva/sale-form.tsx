"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { FormFeedback, Submit } from "@/components/form";
import { Icon } from "@/components/icon";
import { type Product } from "@/modules/catalog/data";
import {
  paymentLabels,
  paymentMethods,
  type PaymentMethod,
} from "@/modules/payments/methods";
import {
  normalizePayments,
  quoteSale,
  saleDraft,
  type SaleDraft,
} from "@/modules/sales/contract";
import { type FormState } from "@/modules/shared/actions";
import { formatMoney } from "@/modules/shared/money";

type EditableLine = { key: number; product: string; quantity: string };
type EditablePayment = { key: number; method: PaymentMethod; amount: string };
type Props = {
  products: Product[];
  currency: string;
  scale: number;
  request: string;
  action: (state: FormState, form: FormData) => Promise<FormState>;
};

export function SaleForm({
  products,
  currency,
  scale,
  request,
  action,
}: Props) {
  const [lines, setLines] = useState<EditableLine[]>([
    { key: 0, product: "", quantity: "1" },
  ]);
  const [payments, setPayments] = useState<EditablePayment[]>([]);
  const [review, setReview] = useState<SaleDraft | null>(null);
  const [validation, setValidation] = useState<{
    message: string;
    product?: number;
  } | null>(null);
  const [state, run, pending] = useActionState(action, {});
  const nextKey = useRef(1);
  const productFields = useRef(new Map<number, HTMLSelectElement>());
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const returningToEdit = useRef(false);
  const feedbackId = useId();
  const byId = new Map(products.map((product) => [product.id, product]));
  const amount = (minor: bigint | string) =>
    formatMoney(minor, currency, scale);

  useEffect(() => {
    if (validation?.product !== undefined) {
      productFields.current.get(validation.product)?.focus();
    }
  }, [validation]);

  useEffect(() => {
    if (review) {
      reviewHeading.current?.focus();
    } else if (returningToEdit.current) {
      returningToEdit.current = false;
      productFields.current.values().next().value?.focus();
    }
  }, [review]);

  const draftLines = lines.map((line) => ({
    product_id: line.product,
    price_id: byId.get(line.product)?.price_id ?? "",
    quantity: Number(line.quantity),
  }));
  const draftPayments = payments.map(({ method, amount }) => ({
    method,
    amount,
  }));
  let quote: ReturnType<typeof quoteSale> | null = null;
  let issue = "";
  try {
    quote = quoteSale(
      draftLines
        .filter((line) => byId.has(line.product_id))
        .map((line) => ({
          unit: byId.get(line.product_id)!.amount_minor,
          quantity: line.quantity,
        })),
      normalizePayments(
        draftPayments.filter((payment) => payment.amount.trim()),
        scale,
      ),
    );
  } catch (error) {
    issue =
      error instanceof RangeError
        ? error.message
        : "Revisá los importes de la operación.";
  }

  function prepare() {
    const draft = saleDraft.safeParse({
      request,
      lines: draftLines,
      payments: draftPayments,
    });
    if (!draft.success) {
      const missing = lines.findIndex((line) => !byId.has(line.product));
      if (missing >= 0) {
        setValidation({
          message: `Seleccioná un producto en la línea ${missing + 1}.`,
          product: lines[missing].key,
        });
      } else {
        setValidation({
          message:
            "Seleccioná un producto distinto en cada línea, revisá las cantidades y completá los pagos agregados.",
        });
      }
      return;
    }
    if (!quote || quote.total === 0n) {
      setValidation({
        message: issue || "Revisá los importes antes de continuar.",
      });
      return;
    }
    setValidation(null);
    setReview(draft.data);
  }

  return (
    <div className="sale-layout">
      <div className="sale-items">
        <section className="surface panel">
          <h2>Productos</h2>
          {review ? (
            <dl className="facts">
              {draftLines.map((line) => (
                <div key={line.product_id}>
                  <dt>
                    {line.quantity} × {byId.get(line.product_id)?.name}
                  </dt>
                  <dd>
                    {amount(
                      BigInt(byId.get(line.product_id)!.amount_minor) *
                        BigInt(line.quantity),
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="form-stack">
              {lines.map((line, index) => (
                <div key={line.key} className="entry">
                  <label>
                    Producto {index + 1}
                    <select
                      ref={(element) => {
                        if (element)
                          productFields.current.set(line.key, element);
                        else productFields.current.delete(line.key);
                      }}
                      aria-invalid={
                        validation?.product === line.key || undefined
                      }
                      aria-describedby={
                        validation?.product === line.key
                          ? feedbackId
                          : undefined
                      }
                      value={line.product}
                      onChange={(event) => {
                        if (validation?.product === line.key)
                          setValidation(null);
                        setLines(
                          lines.map((current) =>
                            current.key === line.key
                              ? { ...current, product: event.target.value }
                              : current,
                          ),
                        );
                      }}
                    >
                      <option value="">Elegí un producto</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} · {amount(product.amount_minor)}
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
                      value={line.quantity}
                      onChange={(event) =>
                        setLines(
                          lines.map((current) =>
                            current.key === line.key
                              ? { ...current, quantity: event.target.value }
                              : current,
                          ),
                        )
                      }
                    />
                  </label>
                  {lines.length > 1 && (
                    <button
                      className="button ghost"
                      type="button"
                      aria-label={`Quitar producto ${index + 1}`}
                      onClick={() =>
                        setLines(
                          lines.filter((current) => current.key !== line.key),
                        )
                      }
                    >
                      Quitar
                    </button>
                  )}
                </div>
              ))}
              {lines.length < 50 && (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() =>
                    setLines([
                      ...lines,
                      { key: nextKey.current++, product: "", quantity: "1" },
                    ])
                  }
                >
                  <Icon name="plus" size={17} /> Agregar producto
                </button>
              )}
            </div>
          )}
        </section>
        <section className="surface panel">
          <h2>Pagos recibidos</h2>
          {!payments.length && (
            <p className="muted">
              Si todavía no recibiste un pago, la venta puede quedar pendiente.
            </p>
          )}
          {review ? (
            <dl className="facts">
              {payments.map((payment) => (
                <div key={payment.key}>
                  <dt>{paymentLabels[payment.method]}</dt>
                  <dd>
                    {amount(
                      normalizePayments([payment], scale)[0].amount_minor,
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="form-stack">
              {payments.map((payment, index) => (
                <div className="entry" key={payment.key}>
                  <label>
                    Medio de pago {index + 1}
                    <select
                      value={payment.method}
                      onChange={(event) =>
                        setPayments(
                          payments.map((current) =>
                            current.key === payment.key
                              ? {
                                  ...current,
                                  method: event.target.value as PaymentMethod,
                                }
                              : current,
                          ),
                        )
                      }
                    >
                      {paymentMethods.map((method) => (
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
                      value={payment.amount}
                      onChange={(event) =>
                        setPayments(
                          payments.map((current) =>
                            current.key === payment.key
                              ? { ...current, amount: event.target.value }
                              : current,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    className="button ghost"
                    type="button"
                    aria-label={`Quitar pago ${index + 1}`}
                    onClick={() =>
                      setPayments(
                        payments.filter(
                          (current) => current.key !== payment.key,
                        ),
                      )
                    }
                  >
                    Quitar
                  </button>
                </div>
              ))}
              {payments.length < 10 && (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() =>
                    setPayments([
                      ...payments,
                      { key: nextKey.current++, method: "cash", amount: "" },
                    ])
                  }
                >
                  <Icon name="plus" size={17} /> Agregar pago
                </button>
              )}
            </div>
          )}
        </section>
      </div>
      <section
        className="surface panel sale-summary"
        aria-label="Resumen de venta"
      >
        <h2 ref={reviewHeading} tabIndex={review ? -1 : undefined}>
          {review ? "Revisión final" : "Resumen"}
        </h2>
        <dl className="facts">
          <div>
            <dt>Total de venta</dt>
            <dd>{quote ? amount(quote.total) : "—"}</dd>
          </div>
          <div>
            <dt>Pago registrado</dt>
            <dd>{quote ? amount(quote.paid) : "—"}</dd>
          </div>
          <div className="balance-line">
            <dt>Saldo pendiente</dt>
            <dd>{quote ? amount(quote.balance) : "—"}</dd>
          </div>
        </dl>
        {review ? (
          <form action={run} className="form-stack">
            <input type="hidden" name="draft" value={JSON.stringify(review)} />
            <FormFeedback state={state} />
            <Submit pending="Confirmando…">
              <Icon name="check" size={17} /> Confirmar venta
            </Submit>
            <button
              className="button secondary"
              type="button"
              disabled={pending}
              onClick={() => {
                returningToEdit.current = true;
                setReview(null);
              }}
            >
              Editar venta
            </button>
          </form>
        ) : (
          <>
            {validation && (
              <div id={feedbackId}>
                <FormFeedback state={{ error: validation.message }} />
              </div>
            )}
            <button className="button primary" type="button" onClick={prepare}>
              Revisar venta <Icon name="arrow" size={17} />
            </button>
          </>
        )}
      </section>
    </div>
  );
}
