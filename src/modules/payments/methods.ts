export const paymentMethods = ["cash", "transfer", "card"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];
export const paymentLabels: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  transfer: "Transferencia / SINPE",
  card: "Tarjeta",
};
