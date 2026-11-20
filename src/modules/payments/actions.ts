"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { organizationAccess } from "@/modules/organizations/access";
import { parseAmount } from "@/modules/shared/money";
import {
  collectionInput,
  collectionReceipt,
  mayCollect,
  type CollectionState,
} from "./collection";

const errors: Record<string, string> = {
  forbidden: "Tu rol no permite registrar cobros posteriores.",
  invalid_collection: "Revisá el medio de pago y el importe.",
  sale_unavailable: "La venta no está disponible para esta empresa.",
  currency_mismatch: "La moneda del cobro debe coincidir con la de la venta.",
  insufficient_balance:
    "Saldo insuficiente. La venta ya podría estar pagada. Revisá el saldo actual antes de volver a intentar.",
  collection_conflict:
    "La solicitud ya se usó con otros datos. Consultá los pagos registrados antes de iniciar otro cobro.",
  collection_day_closed:
    "La jornada actual está cerrada. No se registró el cobro.",
  invalid_collection_day:
    "La jornada de cobro es anterior a la jornada de la venta.",
};

export async function collectPayment(
  org: string,
  sale: string,
  raw: unknown,
): Promise<CollectionState> {
  const input = collectionInput.safeParse(raw);
  if (!input.success || !z.uuid().safeParse(sale).success)
    return { error: errors.invalid_collection };
  const { client, organization, role } = await organizationAccess(org);
  if (!mayCollect(role)) return { error: errors.forbidden };

  let minor: bigint;
  try {
    minor = parseAmount(input.data.amount, organization.scale);
    if (minor === 0n) return { error: "Ingresá un importe mayor que cero." };
  } catch (error) {
    return {
      error:
        error instanceof RangeError ? error.message : errors.invalid_collection,
    };
  }

  const path = `/empresas/${org}/ventas`;
  const { data, error } = await client.rpc("collect_payment", {
    p_org: org,
    p_sale: sale,
    p_request: input.data.request,
    p_currency: organization.currency,
    p_method: input.data.method,
    p_amount_minor: minor.toString(),
  });
  if (error && Object.hasOwn(errors, error.message)) {
    if (
      error.message === "insufficient_balance" ||
      error.message === "collection_conflict"
    )
      revalidatePath(`${path}/${sale}`);
    return { error: errors[error.message] };
  }

  const receipt = collectionReceipt.safeParse(data);
  if (error || !receipt.success) {
    return {
      error:
        "No se pudo confirmar el resultado. Reintentá la misma solicitud para evitar duplicados.",
      retry: true,
    };
  }

  revalidatePath(`${path}/${sale}`);
  revalidatePath(path);
  revalidatePath(`/empresas/${org}`);
  return { receipt: receipt.data };
}
