import { z } from "zod";
import { MAX_MINOR, parseAmount } from "@/modules/shared/money";
import { paymentMethods } from "@/modules/payments/methods";

export const saleDraft = z
  .object({
    request: z.uuid(),
    lines: z
      .array(
        z.object({
          product_id: z.uuid(),
          price_id: z.uuid(),
          quantity: z.number().int().min(1).max(1000),
        }),
      )
      .min(1)
      .max(50),
    payments: z
      .array(
        z.object({
          method: z.enum(paymentMethods),
          amount: z.string().trim().min(1).max(30),
        }),
      )
      .max(10),
  })
  .refine(
    (draft) =>
      new Set(draft.lines.map((line) => line.product_id)).size ===
      draft.lines.length,
    {
      message: "Usá una línea por producto",
    },
  );

export type SaleDraft = z.infer<typeof saleDraft>;
export type Sale = {
  id: string;
  day: string;
  created_at: string;
  currency: string;
  scale: number;
  total_minor: string;
  paid_minor: string;
  balance_minor: string;
};

export function normalizePayments(
  payments: SaleDraft["payments"],
  scale: number,
) {
  return payments.map(({ method, amount }) => {
    const minor = parseAmount(amount, scale);
    if (minor <= 0n) throw new RangeError("Cada pago debe ser mayor que cero");
    return { method, amount_minor: minor.toString() };
  });
}

export function quoteSale(
  lines: { unit: string; quantity: number }[],
  payments: { amount_minor: string }[],
) {
  const total = lines.reduce((sum, line) => {
    const amount = BigInt(line.unit);
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 1000 ||
      amount <= 0n
    )
      throw new RangeError("Revisá las cantidades y los precios");
    return sum + amount * BigInt(line.quantity);
  }, 0n);
  const paid = payments.reduce((sum, payment) => {
    const amount = BigInt(payment.amount_minor);
    if (amount <= 0n || amount > MAX_MINOR)
      throw new RangeError("Revisá los importes de los pagos");
    return sum + amount;
  }, 0n);
  if (total > MAX_MINOR)
    throw new RangeError("El total excede el importe admitido");
  if (paid > total)
    throw new RangeError("La suma de los pagos supera el total");
  return { total, paid, balance: total - paid };
}

export function saleStatus(sale: Pick<Sale, "balance_minor" | "paid_minor">) {
  if (BigInt(sale.balance_minor) === 0n)
    return { label: "Pagada", tone: "success" };
  if (BigInt(sale.paid_minor) === 0n)
    return { label: "Pendiente", tone: "warning" };
  return { label: "Pago parcial", tone: "warning" };
}
