"use client";

import { useActionState, useState } from "react";
import { FormFeedback, Submit } from "@/components/form";
import {
  paymentLabels,
  paymentMethods,
  type PaymentMethod,
} from "@/modules/payments/methods";
import type { CollectionState } from "@/modules/payments/collection";
import { formatMoney } from "@/modules/shared/money";

type Props = {
  request: string;
  day: string;
  currency: string;
  scale: number;
  balance: string;
  action: (input: unknown) => Promise<CollectionState>;
};

export function CollectionForm(props: Props) {
  const [attempt, setAttempt] = useState({ id: props.request, open: false });
  return (
    <CollectionAttempt
      key={attempt.id}
      {...props}
      request={attempt.id}
      initiallyOpen={attempt.open}
      restart={() => setAttempt({ id: crypto.randomUUID(), open: true })}
    />
  );
}

function CollectionAttempt({
  day,
  currency,
  scale,
  balance,
  action,
  request,
  restart,
  initiallyOpen,
}: Props & { restart: () => void; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState("");
  const [result, submit, pending] = useActionState(
    async (): Promise<CollectionState> => {
      try {
        return await action({ request, method, amount });
      } catch {
        return {
          error:
            "Error de conexión. Reintentá el mismo cobro para evitar duplicados.",
          retry: true,
        };
      }
    },
    null,
  );

  const paid = BigInt(balance) === 0n;
  const receipt = result && "receipt" in result ? result.receipt : null;
  const error = result && "error" in result ? result : null;
  const display = (minor: string) => formatMoney(minor, currency, scale);

  return (
    <div id="cobro" className="form-stack">
      {receipt && (
        <div className="feedback success" role="status">
          <strong>
            {receipt.replayed
              ? "Solicitud repetida. Cobro recuperado."
              : "Cobro registrado."}
          </strong>
          <div>
            Jornada {receipt.day} · {display(receipt.amount_minor)}
          </div>
          <div>Saldo después del cobro: {display(receipt.balance_minor)}</div>
          <div className="secondary-line">Movimiento {receipt.payment_id}</div>
        </div>
      )}
      {open && !receipt && (!paid || error?.retry || pending) ? (
        <form className="form-stack" action={submit}>
          <p>
            Jornada de cobro: <strong>{day}</strong>
          </p>
          <label>
            Medio de pago
            <select
              value={method}
              disabled={pending || error?.retry}
              onChange={(event) =>
                setMethod(event.target.value as PaymentMethod)
              }
            >
              {paymentMethods.map((item) => (
                <option key={item} value={item}>
                  {paymentLabels[item]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Importe del cobro ({currency})
            <input
              inputMode="decimal"
              maxLength={30}
              required
              value={amount}
              readOnly={pending || error?.retry}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <FormFeedback state={{ error: error?.error }} />
          <Submit pending="Registrando cobro…">
            {error?.retry ? "Reintentar cobro" : "Confirmar cobro"}
          </Submit>
          {!error?.retry && (
            <button
              type="button"
              className="button secondary"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </button>
          )}
        </form>
      ) : (
        <>
          <FormFeedback state={{ error: error?.error }} />
          {paid ? (
            <p>La venta ya está pagada.</p>
          ) : (
            <button
              type="button"
              className="button primary"
              onClick={() => (receipt ? restart() : setOpen(true))}
            >
              Registrar cobro
            </button>
          )}
        </>
      )}
    </div>
  );
}
