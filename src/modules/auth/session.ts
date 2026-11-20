import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { sessionCookieOptions, supabaseConfig } from "./config";

export async function database() {
  const config = supabaseConfig();
  if (!config) throw new Error("Falta configurar Supabase");
  const jar = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        try {
          for (const { name, value, options } of values)
            jar.set(name, value, options);
        } catch {
          // Solo los handlers, Server Actions y el proxy pueden actualizar cookies.
        }
      },
    },
  });
}

export const requireSession = cache(async () => {
  if (!supabaseConfig()) redirect("/acceso");
  const client = await database();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) redirect("/acceso");
  return { client, user: data.user };
});
