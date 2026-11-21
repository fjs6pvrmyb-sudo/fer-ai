import { strict as assert } from "node:assert";
import { createHmac, randomUUID } from "node:crypto";
import { after, it } from "node:test";
import {
  accounts,
  ids,
  localClient,
  localConfig,
  localJwtSecret,
  signedIn,
} from "./local-demo.mjs";

const config = localConfig();
const root = localClient(config.url, config.serviceKey);
const [owner, admin, outsider] = await Promise.all(
  [accounts.operator, accounts.admin, accounts.coffee].map((email) =>
    signedIn(email, config),
  ),
);
const drafts = [];
const sales = [];
const products = [];
const users = [];
const gross = {
  total_minor: "500000",
  paid_minor: "200000",
  balance_minor: "300000",
};

function ok({ error, data }) {
  assert.equal(error, null, error?.message);
  return data;
}

const save = (client, key = null, review = null, org = ids.bakery) =>
  client.rpc("save_conversational_sale", {
    p_org: org,
    p_id: key?.id ?? null,
    p_revision: key?.revision ?? null,
    p_document: { items: [], payments: [] },
    p_review: review,
  });
const confirm = (client, key, org = ids.bakery) =>
  client.rpc("confirm_conversational_sale", {
    p_org: org,
    p_id: key.id,
    p_revision: key.revision,
  });
const payload = (product = ids.bread, price = ids.breadPrice) => ({
  lines: [{ product_id: product, price_id: price, quantity: 1 }],
  payments: [{ method: "transfer", amount_minor: "200000" }],
});
async function make(client = owner) {
  const draft = ok(await save(client));
  drafts.push(draft.id);
  return draft;
}
async function requestRows(id) {
  return ok(
    await root
      .from("sale_requests")
      .select("sale_id")
      .eq("organization_id", ids.bakery)
      .eq("request_id", id),
  );
}

after(async () => {
  if (drafts.length)
    ok(await root.from("conversational_sale_drafts").delete().in("id", drafts));
  if (sales.length) {
    for (const [table, key] of [
      ["audit_events", "entity_id"],
      ["sale_requests", "sale_id"],
      ["payments", "sale_id"],
      ["sale_lines", "sale_id"],
      ["sales", "id"],
    ])
      ok(
        await root
          .from(table)
          .delete()
          .eq("organization_id", ids.bakery)
          .in(key, sales),
      );
  }
  if (products.length) {
    for (const [table, key] of [
      ["audit_events", "entity_id"],
      ["product_prices", "product_id"],
      ["products", "id"],
    ])
      ok(
        await root
          .from(table)
          .delete()
          .eq("organization_id", ids.bakery)
          .in(key, products),
      );
  }
  for (const user of users) ok(await root.auth.admin.deleteUser(user));
});

it("separa borrador y venta y confirma la misma revisión una sola vez bajo concurrencia", async () => {
  const first = await make();
  assert.equal(first.status, "editing");
  assert.deepEqual(await requestRows(first.id), []);
  assert.equal(
    (await confirm(owner, first)).error?.message,
    "draft_needs_review",
  );

  const review = ok(await save(owner, first, payload()));
  assert.equal(review.status, "review");
  assert.equal(review.revision, 2);
  assert.deepEqual(await requestRows(first.id), []);

  const responses = await Promise.all(
    Array.from({ length: 5 }, () => confirm(owner, review)),
  );
  const existing = responses.find((result) => !result.error)?.data;
  if (existing) sales.push(existing);
  for (const response of responses) assert.equal(ok(response), existing);
  assert.ok(existing);
  assert.deepEqual(await requestRows(first.id), [{ sale_id: existing }]);
  assert.equal(ok(await confirm(owner, review)), existing);
  const row = ok(
    await owner
      .from("sales_overview")
      .select("total_minor,paid_minor,balance_minor")
      .eq("id", existing)
      .single(),
  );
  assert.deepEqual(row, gross);
  const audits = ok(
    await admin
      .from("audit_events")
      .select("action,details")
      .eq("organization_id", ids.bakery)
      .eq("entity_id", existing),
  );
  assert.deepEqual(audits.map(({ action }) => action).sort(), [
    "conversational_sale_confirmed",
    "sale_confirmed",
  ]);
  assert.equal(
    audits.find(({ action }) => action === "conversational_sale_confirmed")
      .details.draft_id,
    first.id,
  );
  const retired = ok(
    await owner
      .from("conversational_sale_drafts")
      .select("status,document")
      .eq("id", first.id)
      .single(),
  );
  assert.deepEqual(retired, { status: "confirmed", document: {} });
  assert.equal(
    (
      await owner.rpc("confirm_sale", {
        p_org: ids.bakery,
        p_request: first.id,
        p_lines: payload().lines,
        p_payments: [],
      })
    ).error?.message,
    "idempotency_conflict",
  );
});

it("impide confirmar borradores ajenos, organizaciones incorrectas y productos ajenos", async () => {
  const first = await make();
  const review = ok(
    await save(owner, first, payload(ids.coffeeProduct, ids.coffeePrice)),
  );
  assert.equal(
    (await confirm(admin, review)).error?.message,
    "draft_unavailable",
  );
  assert.equal((await confirm(outsider, review)).error?.message, "forbidden");
  assert.equal(
    (await confirm(admin, review, ids.coffee)).error?.message,
    "draft_unavailable",
  );
  assert.deepEqual(
    ok(
      await admin
        .from("conversational_sale_drafts")
        .select("id")
        .eq("id", first.id),
    ),
    [],
  );
  assert.ok(
    (
      await owner
        .from("conversational_sale_drafts")
        .update({ status: "confirmed" })
        .eq("id", first.id)
    ).error,
  );
  assert.equal(
    (await confirm(owner, review)).error?.message,
    "catalog_changed",
  );
  assert.deepEqual(await requestRows(first.id), []);
});

it("una edición invalida la revisión anterior y el borrador cancelado no se confirma", async () => {
  const first = await make();
  const review = ok(await save(owner, first, payload()));
  const changed = ok(await save(owner, review));
  assert.equal((await confirm(owner, review)).error?.message, "draft_revision");
  assert.equal(
    (await confirm(owner, changed)).error?.message,
    "draft_needs_review",
  );
  const next = ok(await save(owner, changed, payload()));
  ok(
    await owner.rpc("cancel_conversational_sale", {
      p_org: ids.bakery,
      p_id: next.id,
      p_revision: next.revision,
    }),
  );
  assert.equal(
    (await confirm(owner, next)).error?.message,
    "draft_needs_review",
  );
  assert.deepEqual(await requestRows(first.id), []);
});

it("impide confirmar borradores vencidos y rechaza una sesión expirada", async () => {
  const first = await make();
  const review = ok(await save(owner, first, payload()));
  ok(
    await root
      .from("conversational_sale_drafts")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", first.id),
  );
  assert.equal((await confirm(owner, review)).error?.message, "draft_expired");
  assert.deepEqual(
    ok(
      await owner
        .from("conversational_sale_drafts")
        .select("id")
        .eq("id", first.id),
    ),
    [],
  );

  const segment = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const actor = ok(await owner.auth.getUser()).user;
  const body = `${segment({ alg: "HS256", typ: "JWT" })}.${segment({
    sub: actor.id,
    role: "authenticated",
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) - 3600,
  })}`;
  const signature = createHmac("sha256", localJwtSecret())
    .update(body)
    .digest("base64url");
  const expired = await confirm(
    localClient(config.url, config.key),
    review,
  ).setHeader("Authorization", `Bearer ${body}.${signature}`);
  assert.equal(expired.status, 401);
  assert.match(expired.error?.message ?? "", /expired/i);
  assert.ok((await confirm(localClient(config.url, config.key), review)).error);
});

it("vuelve a validar la versión de catálogo y los permisos antes del registro", async () => {
  const product = ok(
    await admin.rpc("save_product", {
      p_org: ids.bakery,
      p_id: null,
      p_name: "Producto de revisión",
      p_amount: "500000",
      p_active: true,
    }),
  );
  products.push(product);
  const price = ok(
    await admin.from("catalog").select("price_id").eq("id", product).single(),
  ).price_id;
  const first = await make();
  const review = ok(await save(owner, first, payload(product, price)));
  ok(
    await admin.rpc("save_product", {
      p_org: ids.bakery,
      p_id: product,
      p_name: "Producto de revisión",
      p_amount: "510000",
      p_active: true,
    }),
  );
  assert.equal(
    (await confirm(owner, review)).error?.message,
    "catalog_changed",
  );
  assert.deepEqual(await requestRows(first.id), []);

  const email = `draft-revoke-${randomUUID()}@feria.example`;
  const user = ok(
    await root.auth.admin.createUser({
      email,
      password: config.password,
      email_confirm: true,
    }),
  ).user;
  users.push(user.id);
  ok(
    await root.from("memberships").insert({
      organization_id: ids.bakery,
      user_id: user.id,
      role: "operator",
    }),
  );
  const session = await signedIn(email, config);
  const own = await make(session);
  const ready = ok(await save(session, own, payload()));
  ok(
    await root
      .from("memberships")
      .update({ active: false })
      .eq("organization_id", ids.bakery)
      .eq("user_id", user.id),
  );
  assert.equal((await confirm(session, ready)).error?.message, "forbidden");
  assert.deepEqual(await requestRows(own.id), []);
});

it("el operador conserva la autorización operativa sin ganar acceso gerencial", async () => {
  const params = {
    p_org: ids.bakery,
    p_mode: "demo",
    p_model: "feria-sales-demo-v1",
  };
  assert.equal(
    (await owner.rpc("begin_intelligence_request", params)).error?.message,
    "forbidden",
  );
  const result = ok(await owner.rpc("begin_sale_interpretation", params));
  try {
    assert.ok(result);
    ok(
      await owner.rpc("finish_sale_interpretation", {
        p_org: ids.bakery,
        p_request: result,
        p_status: "answered",
        p_intent: "draft_create",
        p_input: null,
        p_output: null,
      }),
    );
    const log = ok(
      await root
        .from("intelligence_requests")
        .select("status,intent,capability")
        .eq("id", result)
        .single(),
    );
    assert.deepEqual(log, {
      status: "answered",
      intent: "draft_create",
      capability: "sale_draft",
    });
  } finally {
    ok(await root.from("intelligence_requests").delete().eq("id", result));
  }
});

it("rechaza un medio deshabilitado después de revisar y deja el borrador sin venta", async () => {
  const first = await make();
  const review = ok(await save(owner, first, payload()));
  const { conversational_payment_methods: original } = ok(
    await root
      .from("organizations")
      .select("conversational_payment_methods")
      .eq("id", ids.bakery)
      .single(),
  );
  try {
    ok(
      await root
        .from("organizations")
        .update({ conversational_payment_methods: ["cash"] })
        .eq("id", ids.bakery),
    );
    assert.equal(
      (await confirm(owner, review)).error?.message,
      "draft_payment_method_changed",
    );
    assert.deepEqual(await requestRows(first.id), []);
  } finally {
    ok(
      await root
        .from("organizations")
        .update({ conversational_payment_methods: original })
        .eq("id", ids.bakery),
    );
  }
});
