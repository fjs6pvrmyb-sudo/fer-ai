import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";

export const ids = {
  bakery: "10000000-0000-4000-8000-000000000001",
  coffee: "10000000-0000-4000-8000-000000000002",
  bread: "20000000-0000-4000-8000-000000000001",
  breadPrice: "30000000-0000-4000-8000-000000000001",
  coffeeProduct: "20000000-0000-4000-8000-000000000004",
  coffeePrice: "30000000-0000-4000-8000-000000000004",
};

export const accounts = {
  admin: "admin@feria.example",
  operator: "operador@feria.example",
  coffee: "cafeteria@feria.example",
};

export function localConfig() {
  const {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    FERIA_DEMO_PASSWORD: password,
  } = process.env;
  if (
    !url ||
    !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)
  ) {
    throw new Error(
      "Estas operaciones requieren Supabase local en una dirección de loopback.",
    );
  }
  if (!key || !serviceKey || !password || password.length < 12) {
    throw new Error(
      "Configurá las claves locales y una contraseña de prueba de al menos 12 caracteres.",
    );
  }
  return { url, key, serviceKey, password };
}

export function localClient(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function localJwtSecret() {
  localConfig();
  const secret =
    process.env.FERIA_TEST_JWT_SECRET ||
    JSON.parse(
      execFileSync("./node_modules/.bin/supabase", ["status", "-o", "json"], {
        encoding: "utf8",
        env: { ...process.env, DO_NOT_TRACK: "1" },
        stdio: ["ignore", "pipe", "ignore"],
      }),
    ).JWT_SECRET;
  if (!secret)
    throw new Error("Falta el secreto JWT de la instancia local desechable.");
  return secret;
}

export async function signedIn(email, config = localConfig()) {
  const client = localClient(config.url, config.key);
  const { error } = await client.auth.signInWithPassword({
    email,
    password: config.password,
  });
  if (error)
    throw new Error(`Falló el inicio de sesión de prueba: ${error.message}`);
  return client;
}
