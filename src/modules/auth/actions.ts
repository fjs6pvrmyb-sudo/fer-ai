"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { database } from "./session";
import { supabaseConfig } from "./config";
import { companySelectionPath } from "./destination";

// Sin argumentos vinculados: un envío previo a la hidratación (MPA) con una
// acción enlazada mediante bind() dejaba el SSR de useActionState en un bucle.
export async function signIn(_: string, form: FormData): Promise<string> {
  const forSale = form.get("destino") === "venta";
  if (!supabaseConfig())
    return "El servicio de acceso todavía no está configurado.";
  const input = z
    .object({ email: z.email().max(254), password: z.string().min(1).max(256) })
    .safeParse({
      email: String(form.get("email") ?? "").trim(),
      password: form.get("password"),
    });
  if (!input.success) return "Ingresá tu correo y contraseña.";
  const client = await database();
  const { error } = await client.auth.signInWithPassword(input.data);
  if (error?.status === 429)
    return "Demasiados intentos de acceso. Esperá antes de intentar de nuevo.";
  if (error)
    return error.status && error.status < 500
      ? "El correo o la contraseña no son válidos."
      : "El servicio de acceso no respondió. Intentá de nuevo.";
  redirect(companySelectionPath(forSale));
}

export async function signOut() {
  const client = await database();
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw new Error("No se pudo cerrar la sesión");
  redirect("/acceso");
}
