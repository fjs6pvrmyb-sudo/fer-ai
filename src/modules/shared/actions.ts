export type FormState = { error?: string; success?: string };

export function operationError(message?: string): FormState {
  const errors: Record<string, string> = {
    forbidden: "Tu rol no permite esta operación.",
    last_admin: "La empresa necesita al menos un administrador activo.",
    invalid_member: "No encontramos una cuenta con ese identificador.",
    invalid_product: "Revisá el producto y el precio.",
    invalid_organization: "Revisá el nombre y la zona horaria.",
    invalid_sale: "Revisá los productos y las cantidades.",
    invalid_payment: "Revisá los medios de pago y sus importes.",
    overpayment: "La suma de los pagos supera el total de la venta.",
    invalid_total: "El total excede el importe admitido.",
    catalog_changed:
      "El catálogo cambió. Actualizá la página y revisá los precios.",
    idempotency_conflict:
      "Esta solicitud ya corresponde a otra venta. Revisá el historial antes de iniciar una nueva.",
    day_closed: "La jornada está cerrada. No se registró la venta.",
  };
  return {
    error: Object.hasOwn(errors, message ?? "")
      ? errors[message!]
      : "No se pudo completar la operación. Intentá de nuevo.",
  };
}
