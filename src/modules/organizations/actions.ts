"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { organizationAccess, roles } from "./access";
import { operationError, type FormState } from "@/modules/shared/actions";

export async function saveOrganization(
  org: string,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const { role, client } = await organizationAccess(org);
  if (role !== "admin") return operationError("forbidden");
  const fields = z
    .object({
      name: z.string().trim().min(1).max(100),
      timezone: z.string().trim().min(1).max(100),
    })
    .safeParse({ name: form.get("name"), timezone: form.get("timezone") });
  if (!fields.success) return operationError("invalid_organization");
  const { name, timezone } = fields.data;
  const { error } = await client.rpc("update_organization", {
    p_org: org,
    p_name: name,
    p_timezone: timezone,
  });
  if (error) return operationError(error.message);
  revalidatePath(`/empresas/${org}`, "layout");
  return { success: "Configuración guardada." };
}

export async function saveMembership(
  org: string,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const { role, client } = await organizationAccess(org);
  if (role !== "admin") return operationError("forbidden");
  const fields = z
    .object({ user: z.uuid(), role: z.enum(roles) })
    .safeParse({
      user: String(form.get("user") ?? "").trim(),
      role: form.get("role"),
    });
  if (!fields.success)
    return {
      error: "Ingresá el identificador de una cuenta existente y su rol.",
    };
  const { error } = await client.rpc("set_membership", {
    p_org: org,
    p_user: fields.data.user,
    p_role: fields.data.role,
    p_active: form.get("active") === "on",
  });
  if (error) return operationError(error.message);
  revalidatePath(`/empresas/${org}/configuracion`);
  return { success: "Membresía guardada." };
}
