"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { organizationAccess } from "@/modules/organizations/access";
import { operationError, type FormState } from "@/modules/shared/actions";
import { parseAmount } from "@/modules/shared/money";

export async function saveProduct(
  org: string,
  id: string | null,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const { role, client, organization } = await organizationAccess(org);
  if (role !== "admin") return operationError("forbidden");
  const name = z.string().trim().min(1).max(100).safeParse(form.get("name"));
  if (!name.success || (id && !z.uuid().safeParse(id).success))
    return operationError("invalid_product");
  let amount: bigint;
  try {
    amount = parseAmount(String(form.get("amount") ?? ""), organization.scale);
    if (amount <= 0n) return operationError("invalid_product");
  } catch (error) {
    return {
      error: error instanceof RangeError ? error.message : "Importe inválido.",
    };
  }
  const { error } = await client.rpc("save_product", {
    p_org: org,
    p_id: id,
    p_name: name.data,
    p_amount: amount.toString(),
    p_active: form.get("active") === "on",
  });
  if (error) return operationError(error.message);
  revalidatePath(`/empresas/${org}/catalogo`);
  return { success: "Producto guardado." };
}
