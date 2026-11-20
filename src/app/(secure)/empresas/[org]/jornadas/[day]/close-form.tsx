"use client";

import { useState } from "react";
import { MutationForm } from "@/components/form";
import type { FormState } from "@/modules/shared/actions";
import { formatMoney, parseAmount } from "@/modules/shared/money";

export function CloseReviewForm({
  action,
  expected,
  currency,
  scale,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  expected: string;
  currency: string;
  scale: number;
}) {
  const [amount, setAmount] = useState("");
  let difference = "Sin determinar";
  if (amount.trim()) {
    try {
      difference = formatMoney(
        parseAmount(amount, scale) - BigInt(expected),
        currency,
        scale,
      );
    } catch {
      difference = "Importe inválido";
    }
  }
  return (
    <MutationForm action={action} submit="Confirmar cierre">
      <label>
        Efectivo contado ({currency})
        <input
          name="cash"
          inputMode="decimal"
          maxLength={30}
          placeholder="Dejalo vacío si falta el conteo"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      <p aria-live="polite">
        Diferencia prevista: <strong>{difference}</strong>
      </p>
      <p>
        Al confirmar se guardarán estas cifras. Podés completar la conciliación
        después.
      </p>
    </MutationForm>
  );
}
