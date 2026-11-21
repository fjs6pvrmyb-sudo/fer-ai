import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import {
  accounts,
  ids,
  localClient,
  localConfig,
  signedIn,
} from "./local-demo.mjs";

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
const claimsFor = (session) =>
  JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url"));
const organizationMetrics = (client, org = ids.bakery) =>
  client.rpc("operations_metrics", {
    p_org: org,
    p_from: "2026-01-01",
    p_to: "2026-01-02",
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
  const refresh = await signed.auth.refreshSession({
    refresh_token: data.session.refresh_token,
  });
  assert.ok(refresh.error);
  assert.equal(refresh.data.session, null);
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
  const client = await signedIn(accounts.operator, config);
  try {
    const { data, error } = await client.auth.getSession();
    assert.ifError(error);
    const [header, payload, signature] = data.session.access_token.split(".");
    const wrongSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
    for (const credential of [
      "token-invalido-de-prueba",
      `${header}.${payload}.${wrongSignature}`,
    ]) {
      const invalid = await catalog(withToken(credential));
      assert.equal(invalid.status, 401);
      assert.equal(invalid.data, null);
    }
  } finally {
    assert.ifError((await client.auth.signOut({ scope: "local" })).error);
  }
});

test("la renovación mantiene la sesión activa hasta cerrar esa sesión", async () => {
  const client = await signedIn(accounts.operator, config);
  try {
    const initial = await client.auth.getSession();
    assert.ifError(initial.error);
    const before = initial.data.session;
    assert.ok(before);
    const renewed = await client.auth.refreshSession();
    assert.ifError(renewed.error);
    const after = renewed.data.session;
    assert.ok(after);
    assert.notEqual(before.refresh_token, after.refresh_token);
    assert.equal(claimsFor(before).session_id, claimsFor(after).session_id);
    assert.match(claimsFor(after).session_id, /^[0-9a-f-]{36}$/);
    const rows = await catalog(withToken(after.access_token));
    assert.ifError(rows.error);
    assert.equal(rows.data.length, 1);
    assert.ifError((await client.auth.signOut({ scope: "local" })).error);
    const revoked = await catalog(withToken(after.access_token));
    assert.ifError(revoked.error);
    assert.deepEqual(revoked.data, []);
  } finally {
    assert.ifError((await client.auth.signOut({ scope: "local" })).error);
  }
});

test("RLS y RPC leen el rol y la membresía vigentes en cada solicitud", async () => {
  const root = localClient(config.url, config.serviceKey);
  const email = `qa-roles-${randomUUID()}@feria.example`;
  const created = await root.auth.admin.createUser({
    email,
    password: config.password,
    email_confirm: true,
  });
  assert.ifError(created.error);
  const userId = created.data.user.id;
  try {
    assert.ifError(
      (
        await root.from("memberships").insert({
          organization_id: ids.bakery,
          user_id: userId,
          role: "manager",
        })
      ).error,
    );
    const client = await signedIn(email, config);
    assert.ifError((await organizationMetrics(client)).error);
    const other = await client
      .from("catalog")
      .select("id")
      .eq("organization_id", ids.coffee);
    assert.ifError(other.error);
    assert.deepEqual(other.data, []);
    assert.equal(
      (await organizationMetrics(client, ids.coffee)).error?.code,
      "42501",
    );
    const authorizationHelper = await client
      .schema("feria_private")
      .rpc("active_organization_roles");
    assert.equal(authorizationHelper.error?.code, "PGRST106");
    const downgraded = await root
      .from("memberships")
      .update({ role: "operator" })
      .eq("organization_id", ids.bakery)
      .eq("user_id", userId);
    assert.ifError(downgraded.error);
    assert.equal((await organizationMetrics(client)).error?.code, "42501");
    assert.equal((await catalog(client)).data?.length, 1);
    const disabled = await root
      .from("memberships")
      .update({ active: false })
      .eq("organization_id", ids.bakery)
      .eq("user_id", userId);
    assert.ifError(disabled.error);
    assert.ifError((await client.auth.getUser()).error);
    for (const table of ["products", "memberships", "sales", "payments"]) {
      const rows = await client
        .from(table)
        .select("organization_id")
        .eq("organization_id", ids.bakery)
        .limit(1);
      assert.ifError(rows.error);
      assert.deepEqual(rows.data, []);
    }
    assert.equal(
      (
        await client.rpc("confirm_sale", {
          p_org: ids.bakery,
          p_request: randomUUID(),
          p_lines: [
            { product_id: ids.bread, price_id: ids.breadPrice, quantity: 1 },
          ],
          p_payments: [],
        })
      ).error?.code,
      "42501",
    );
    assert.equal(
      (
        await client.rpc("collect_payment", {
          p_org: ids.bakery,
          p_sale: randomUUID(),
          p_request: randomUUID(),
          p_currency: "CRC",
          p_method: "cash",
          p_amount_minor: "100",
        })
      ).error?.code,
      "42501",
    );
    const admin = await signedIn(accounts.admin, config);
    try {
      const retained = await admin
        .from("memberships")
        .select("active")
        .eq("organization_id", ids.bakery)
        .eq("user_id", userId)
        .single();
      assert.ifError(retained.error);
      assert.equal(retained.data.active, false);
    } finally {
      assert.ifError((await admin.auth.signOut({ scope: "local" })).error);
    }
  } finally {
    assert.ifError((await root.auth.admin.deleteUser(userId)).error);
  }
});

const dbContainer = process.env.FERIA_TEST_DB_CONTAINER;
test(
  "RLS rechaza una sesión con not_after vencido aunque el JWT siga vigente",
  {
    skip:
      !dbContainer &&
      "Configurá el contenedor local desechable en FERIA_TEST_DB_CONTAINER",
  },
  async () => {
    assert.match(dbContainer, /^supabase_db_feria(?:-[a-z0-9-]+)?$/);
    const client = await signedIn(accounts.operator, config);
    try {
      const { data, error } = await client.auth.getSession();
      assert.ifError(error);
      const {
        session_id: sessionId,
        sub: userId,
        exp,
      } = claimsFor(data.session);
      assert.ok(exp > Date.now() / 1000);
      for (const id of [sessionId, userId]) assert.match(id, /^[0-9a-f-]{36}$/);
      assert.equal((await catalog(client)).data?.length, 1);
      const output = execFileSync(
        "docker",
        [
          "exec",
          "-i",
          dbContainer,
          "psql",
          "-U",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
          "-Atq",
        ],
        {
          input: `update auth.sessions set not_after = statement_timestamp() - interval '1 minute'
        where id = '${sessionId}' and user_id = '${userId}' returning 1;`,
          encoding: "utf8",
        },
      );
      assert.equal(output.trim(), "1");
      const expired = await catalog(withToken(data.session.access_token));
      assert.ifError(expired.error);
      assert.deepEqual(expired.data, []);
    } finally {
      assert.ifError((await client.auth.signOut({ scope: "local" })).error);
    }
  },
);
