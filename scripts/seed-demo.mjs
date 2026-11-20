import { accounts, ids, localClient, localConfig } from "./local-demo.mjs";

const { url, serviceKey, password } = localConfig();
const supabase = localClient(url, serviceKey);
const { data, error } = await supabase.auth.admin.listUsers({
  perPage: 100,
  page: 1,
});
if (error)
  throw new Error(
    `No se pudieron consultar las cuentas locales: ${error.message}`,
  );

const definitions = [
  [
    accounts.admin,
    [
      [ids.bakery, "admin"],
      [ids.coffee, "manager"],
    ],
  ],
  [accounts.operator, [[ids.bakery, "operator"]]],
  [accounts.coffee, [[ids.coffee, "operator"]]],
];
for (const [email, memberships] of definitions) {
  const existing = data.users.find((user) => user.email === email);
  const attributes = { email, password, email_confirm: true };
  const result = existing
    ? await supabase.auth.admin.updateUserById(existing.id, attributes)
    : await supabase.auth.admin.createUser(attributes);
  if (result.error || !result.data.user)
    throw new Error(
      `No se pudo preparar una cuenta local: ${result.error?.message}`,
    );
  const saved = await supabase.from("memberships").upsert(
    memberships.map(([organization_id, role]) => ({
      organization_id,
      user_id: result.data.user.id,
      role,
      active: true,
    })),
  );
  if (saved.error)
    throw new Error(
      `No se pudo preparar una membresía local: ${saved.error.message}`,
    );
}
console.log("Tres cuentas ficticias y sus membresías quedaron preparadas.");
