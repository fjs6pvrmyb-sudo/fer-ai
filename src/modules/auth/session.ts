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

export const currentSession = cache(async () => {
  if (!supabaseConfig()) return null;
  const client = await database();
  const { data, error } = await client.auth.getUser();
  return error || !data.user ? null : { client, user: data.user };
});

export async function requireSession() {
  const session = await currentSession();
  if (!session) redirect("/acceso");
  return session;
}
