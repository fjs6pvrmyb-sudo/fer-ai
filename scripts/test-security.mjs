import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { accounts, ids, localConfig, signedIn } from "./local-demo.mjs";

const config = localConfig();
const auth = { persistSession: false, autoRefreshToken: false };
const catalog = (client) =>
  client
    .from("catalog")
    .select("id")
    .eq("organization_id", ids.bakery)
    .limit(1);
const withToken = (token) =>
  createClient(config.url, config.key, {
    auth,
    accessToken: async () => token,
  });

test("cerrar una sesión invalida inmediatamente su acceso a RLS y RPC sin cerrar otra sesión", async () => {
  const signed = await signedIn(accounts.operator, config);
  const other = await signedIn(accounts.operator, config);
  const { data, error } = await signed.auth.getSession();
  assert.ifError(error);
  assert.ok(data.session);
  const detached = withToken(data.session.access_token);
  const open = await catalog(detached);
  assert.ifError(open.error);
  assert.equal(open.data.length, 1);
  assert.ifError((await signed.auth.signOut({ scope: "local" })).error);
  const revoked = await catalog(detached);
  assert.ifError(revoked.error);
  assert.deepEqual(revoked.data, []);

  const membership = await detached.from("memberships").select("role");
  assert.ifError(membership.error);
  assert.deepEqual(membership.data, []);

  const denied = await detached.rpc("confirm_sale", {
    p_org: ids.bakery,
    p_request: randomUUID(),
    p_lines: [{ product_id: ids.bread, price_id: ids.breadPrice, quantity: 1 }],
    p_payments: [],
  });
  assert.equal(denied.error?.code, "42501");
  const allowed = await catalog(other);
  assert.ifError(allowed.error);
  assert.equal(allowed.data.length, 1);
  assert.ifError((await other.auth.signOut({ scope: "local" })).error);
});

test("PostgREST rechaza credenciales que no corresponden a un JWT vigente", async () => {
  const invalid = await catalog(withToken("token-invalido-de-prueba"));
  assert.equal(invalid.status, 401);
  assert.equal(invalid.data, null);
});
