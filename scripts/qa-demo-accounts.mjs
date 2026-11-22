// Cuentas ficticias para la demo en QA (bloque C de #10).
// Uso: node --env-file=.env.qa.local scripts/qa-demo-accounts.mjs create|cleanup
// create: crea o reinicia las cuentas y membresías, y guarda las contraseñas
//         aleatorias en ~/FERIA-demo-credenciales.txt (permisos 600), nunca en
//         la salida ni en el repo.
// cleanup: borra las membresías y los usuarios de la demo.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { writeFileSync, chmodSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const qa = "https://lqqeisjzoajtvwcifard.supabase.co";
const { FERIA_QA_URL: url, FERIA_QA_ADMIN_KEY: key } = process.env;
assert.equal(url, qa, "El host no corresponde al QA aprobado.");
assert.ok(
  key?.startsWith("sb_secret_"),
  "Falta la clave secreta efímera de QA.",
);
const mode = process.argv[2];
assert.ok(["create", "cleanup"].includes(mode), "Usá create o cleanup.");

const bakery = "10000000-0000-4000-8000-000000000001";
const coffee = "10000000-0000-4000-8000-000000000002";
const accounts = [
  {
    email: "admin@feria.example",
    roles: [
      [bakery, "admin"],
      [coffee, "manager"],
    ],
  },
  { email: "operador@feria.example", roles: [[bakery, "operator"]] },
  { email: "cafeteria@feria.example", roles: [[coffee, "operator"]] },
];
const file = join(homedir(), "FERIA-demo-credenciales.txt");
const root = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const code = (error) => String(error?.code ?? error?.status ?? "error");

const listed = await root.auth.admin.listUsers({ perPage: 200, page: 1 });
assert.ok(!listed.error, `Listar usuarios: ${code(listed.error)}`);
const existing = new Map(listed.data.users.map((u) => [u.email, u.id]));

if (mode === "create") {
  const lines = [
    "# Cuentas ficticias de demo FER AI (QA). No compartir ni versionar.",
  ];
  for (const account of accounts) {
    const password = randomBytes(15).toString("base64url");
    const attributes = { email: account.email, password, email_confirm: true };
    const id = existing.get(account.email);
    const result = id
      ? await root.auth.admin.updateUserById(id, attributes)
      : await root.auth.admin.createUser(attributes);
    assert.ok(!result.error, `Cuenta ${account.email}: ${code(result.error)}`);
    const saved = await root.from("memberships").upsert(
      account.roles.map(([organization_id, role]) => ({
        organization_id,
        user_id: result.data.user.id,
        role,
        active: true,
      })),
    );
    assert.ok(
      !saved.error,
      `Membresías ${account.email}: ${code(saved.error)}`,
    );
    lines.push(
      `${account.email}\t${password}\t${account.roles.map((r) => r[1]).join(",")}`,
    );
    console.log(
      `Cuenta lista: ${account.email} (${account.roles.map((r) => r[1]).join(", ")})`,
    );
  }
  writeFileSync(file, lines.join("\n") + "\n", { mode: 0o600 });
  chmodSync(file, 0o600);
  console.log(`Contraseñas guardadas en ${file} (600).`);
} else {
  for (const account of accounts) {
    const id = existing.get(account.email);
    if (!id) continue;
    const memberships = await root
      .from("memberships")
      .delete()
      .eq("user_id", id);
    assert.ok(
      !memberships.error,
      `Membresías ${account.email}: ${code(memberships.error)}`,
    );
    const removed = await root.auth.admin.deleteUser(id);
    assert.ok(
      !removed.error,
      `Borrar ${account.email}: ${code(removed.error)}`,
    );
    console.log(`Cuenta borrada: ${account.email}`);
  }
  rmSync(file, { force: true });
}
