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
const [admin, operator] = await Promise.all(
  [accounts.admin, accounts.operator].map((email) => signedIn(email, config)),
);
const adminId = (await admin.auth.getUser()).data.user.id;
const operatorId = (await operator.auth.getUser()).data.user.id;
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Costa_Rica",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const prior = "2000-01-05";
const organizations = [];

function ok({ data, error }) {
  assert.equal(error, null, error?.message);
  return data;
}

async function fixture() {
  const org = randomUUID();
  ok(
    await root.from("organizations").insert({
      id: org,
      currency: "CRC",
      scale: 2,
      timezone: "America/Costa_Rica",
      name: "Operaciones de prueba",
    }),
  );
  organizations.push(org);
  ok(
    await root.from("memberships").insert([
      { organization_id: org, user_id: adminId, role: "manager" },
      { organization_id: org, user_id: operatorId, role: "operator" },
    ]),
  );
  const product = randomUUID();
  const price = randomUUID();
  ok(
    await root
      .from("products")
      .insert({ id: product, organization_id: org, name: "Producto ficticio" }),
  );
  ok(
    await root.from("product_prices").insert({
      id: price,
      organization_id: org,
      product_id: product,
      currency: "CRC",
      scale: 2,
      amount_minor: "500000",
    }),
  );
  return { org, product, price };
}

const saleRequest = ({ org, product, price }, method = "transfer") => ({
  p_org: org,
  p_request: randomUUID(),
  p_lines: [{ product_id: product, price_id: price, quantity: 1 }],
  p_payments: [{ method, amount_minor: "200000" }],
});

async function makeSaleInPriorDay(fixture) {
  const { org } = fixture;
  const sale = ok(await admin.rpc("confirm_sale", saleRequest(fixture)));
  const at = `${prior}T15:00:00Z`;
  ok(
    await root
      .from("operating_days")
      .insert({ organization_id: org, day: prior }),
  );
  ok(
    await root
      .from("payments")
      .update({ day: prior, occurred_at: at, created_at: at })
      .eq("organization_id", org)
      .eq("sale_id", sale),
  );
  ok(
    await root
      .from("sales")
      .update({ day: prior, created_at: at })
      .eq("organization_id", org)
      .eq("id", sale),
  );
  return sale;
}

const review = async (org, day) =>
  ok(await admin.rpc("day_review", { p_org: org, p_day: day }));
const period = async (org, from, to = from) =>
  ok(
    await admin.rpc("operations_metrics", {
      p_org: org,
      p_from: from,
      p_to: to,
    }),
  );
const start = async (org, day) =>
  ok(await admin.rpc("start_day_close", { p_org: org, p_day: day }));
const confirm = (org, day, version, cash = null) =>
  admin.rpc("complete_day_close", {
    p_org: org,
    p_day: day,
    p_review: version,
    p_cash_counted: cash,
  });
const collect = (org, sale) =>
  admin.rpc("collect_payment", {
    p_org: org,
    p_sale: sale,
    p_request: randomUUID(),
    p_currency: "CRC",
    p_method: "transfer",
    p_amount_minor: "300000",
  });
const evidence = (
  org,
  payment,
  amount = "300000",
  status = "verified",
  notes = "",
) => ({
  p_org: org,
  p_payment: payment,
  p_kind: "transfer",
  p_reference: "FICTICIO-SINPE-002",
  p_amount: amount,
  p_status: status,
  p_notes: notes,
});

after(async () => {
  if (!organizations.length) return;
  for (const table of [
    "payment_evidence",
    "day_closures",
    "collection_requests",
    "sale_requests",
    "payments",
    "sale_lines",
    "sales",
    "operating_days",
    "audit_events",
    "product_prices",
    "products",
    "memberships",
  ]) {
    ok(await root.from(table).delete().in("organization_id", organizations));
  }
  ok(await root.from("organizations").delete().in("id", organizations));
});

it("cierra jornada A y conserva el corte después del cobro y la evidencia de jornada B", async () => {
  const data = await fixture();
  const { org } = data;
  const sale = await makeSaleInPriorDay(data);
  assert.equal((await review(org, prior)).state, "open");
  await start(org, prior);
  const pending = await review(org, prior);
  assert.equal(pending.state, "pending");
  const closeId = ok(await confirm(org, prior, pending.review_version));
  assert.equal(ok(await confirm(org, prior, pending.review_version)), closeId);
  const closures = ok(
    await admin
      .from("audit_events")
      .select("id")
      .eq("organization_id", org)
      .eq("action", "day_closed")
      .eq("entity_id", closeId),
  );
  assert.equal(closures.length, 1);
  const first = (await review(org, prior)).snapshot;
  assert.equal(first.actor_id, adminId);
  assert.equal(first.metrics.sale_count, "1");
  assert.equal(first.metrics.sales_minor, "500000");
  assert.equal(first.metrics.collected_minor, "200000");
  assert.equal(first.metrics.outstanding_minor, "300000");
  assert.equal(first.metrics.unverified_count, "1");
  assert.equal(first.cash_counted_minor, null);
  assert.equal(first.cash_difference_minor, null);
  assert.deepEqual(first.metrics.methods, [
    { method: "transfer", amount_minor: "200000" },
  ]);

  const later = ok(await collect(org, sale));
  assert.equal(later.day, today);
  assert.equal(later.balance_minor, "0");
  assert.equal(
    (
      await admin.rpc(
        "save_payment_evidence",
        evidence(org, later.payment_id, "290000"),
      )
    ).error?.message,
    "evidence_amount_mismatch",
  );
  ok(
    await admin.rpc(
      "save_payment_evidence",
      evidence(
        org,
        later.payment_id,
        "290000",
        "discrepancy",
        "Importe documental diferente",
      ),
    ),
  );
  assert.equal((await period(org, today)).discrepancy_count, "1");
  ok(await admin.rpc("save_payment_evidence", evidence(org, later.payment_id)));
  const reviewed = ok(
    await admin
      .from("reconciliation_payments")
      .select("status,reviewer_id,reviewed_at")
      .eq("organization_id", org)
      .eq("id", later.payment_id)
      .single(),
  );
  assert.equal(reviewed.status, "verified");
  assert.equal(reviewed.reviewer_id, adminId);
  assert.ok(reviewed.reviewed_at);
  const changes = ok(
    await admin
      .from("audit_events")
      .select("details")
      .eq("organization_id", org)
      .eq("entity_id", later.payment_id)
      .eq("action", "payment_evidence_reviewed")
      .order("created_at"),
  );
  assert.deepEqual(
    changes.map((event) => event.details.after.status),
    ["discrepancy", "verified"],
  );

  const second = await period(org, today);
  assert.equal(second.sale_count, "0");
  assert.equal(second.sales_minor, "0");
  assert.equal(second.outstanding_minor, "0");
  assert.equal(second.collected_minor, "300000");
  assert.equal(second.prior_sales_minor, "300000");
  assert.equal(second.unverified_count, "0");
  assert.equal(second.verified_minor, "300000");
  assert.equal((await period(org, prior)).outstanding_minor, "300000");
  assert.deepEqual((await review(org, prior)).snapshot, first);
  const records = ok(
    await admin.from("sales").select("id,day").eq("organization_id", org),
  );
  assert.deepEqual(records, [{ id: sale, day: prior }]);
  const payments = ok(
    await admin
      .from("reconciliation_payments")
      .select("day,status")
      .eq("organization_id", org)
      .order("day"),
  );
  assert.deepEqual(payments, [
    { day: prior, status: "missing" },
    { day: today, status: "verified" },
  ]);

  const initialPayment = ok(
    await admin
      .from("reconciliation_payments")
      .select("id")
      .eq("organization_id", org)
      .eq("day", prior)
      .single(),
  );
  ok(
    await admin.rpc(
      "save_payment_evidence",
      evidence(org, initialPayment.id, "200000"),
    ),
  );
  const afterEvidence = await review(org, prior);
  assert.equal(afterEvidence.metrics.unverified_count, "0");
  assert.deepEqual(afterEvidence.snapshot, first);

  assert.deepEqual(
    ok(
      await operator
        .from("day_closures")
        .select("id")
        .eq("organization_id", org),
    ),
    [],
  );
  assert.equal(
    (await operator.rpc("start_day_close", { p_org: org, p_day: today })).error
      ?.message,
    "forbidden",
  );
  assert.equal(
    (
      await operator.rpc(
        "save_payment_evidence",
        evidence(org, later.payment_id),
      )
    ).error?.message,
    "forbidden",
  );
  assert.equal(
    (
      await admin.rpc(
        "save_payment_evidence",
        evidence(ids.coffee, later.payment_id),
      )
    ).error?.message,
    "payment_unavailable",
  );
  assert.deepEqual(
    ok(
      await admin
        .from("reconciliation_payments")
        .select("id")
        .eq("organization_id", ids.coffee)
        .eq("id", later.payment_id),
    ),
    [],
  );
  assert.ok(
    (
      await admin
        .from("day_closures")
        .update({ cash_counted_minor: 0 })
        .eq("id", closeId)
    ).error,
  );
  assert.ok(
    (
      await admin
        .from("payment_evidence")
        .update({ notes: "Prohibido" })
        .eq("payment_id", later.payment_id)
    ).error,
  );
});

it("una venta concurrente se incluye tras revisar de nuevo o se rechaza por cierre", async () => {
  const data = await fixture();
  const { org } = data;
  await start(org, today);
  const before = await review(org, today);
  const [sale, closed] = await Promise.all([
    admin.rpc("confirm_sale", saleRequest(data, "cash")),
    confirm(org, today, before.review_version, "0"),
  ]);
  if (sale.error) {
    assert.equal(sale.error.message, "day_closed");
    ok(closed);
  } else {
    assert.equal(closed.error?.message, "review_changed");
    ok(
      await confirm(org, today, (await review(org, today)).review_version, "0"),
    );
  }
  const snapshot = (await review(org, today)).snapshot;
  assert.equal(snapshot.metrics.sale_count, sale.error ? "0" : "1");
  assert.equal(snapshot.cash_counted_minor, "0");
  assert.equal(snapshot.cash_difference_minor, sale.error ? "0" : "-200000");
  assert.equal(
    (await admin.rpc("confirm_sale", saleRequest(data))).error?.message,
    "day_closed",
  );
});

it("un cobro concurrente se incluye tras revisar de nuevo o se rechaza por cierre", async () => {
  const data = await fixture();
  const { org } = data;
  const sale = await makeSaleInPriorDay(data);
  await start(org, today);
  const before = await review(org, today);
  const [payment, closed] = await Promise.all([
    collect(org, sale),
    confirm(org, today, before.review_version),
  ]);
  if (payment.error) {
    assert.equal(payment.error.message, "collection_day_closed");
    ok(closed);
  } else {
    assert.equal(closed.error?.message, "review_changed");
    ok(await confirm(org, today, (await review(org, today)).review_version));
  }
  const snapshot = (await review(org, today)).snapshot;
  assert.equal(
    snapshot.metrics.collected_minor,
    payment.error ? "0" : "300000",
  );
  assert.equal(
    snapshot.metrics.outstanding_minor,
    payment.error ? "300000" : "0",
  );
});

it("un cierre conserva una diferencia de conteo con cero declarado", async () => {
  const data = await fixture();
  const { org } = data;
  await start(org, today);
  const staleReview = (await review(org, today)).review_version;
  ok(await admin.rpc("confirm_sale", saleRequest(data, "cash")));
  assert.equal(
    (await confirm(org, today, staleReview, "0")).error?.message,
    "review_changed",
  );
  ok(await confirm(org, today, (await review(org, today)).review_version, "0"));
  const snapshot = (await review(org, today)).snapshot;
  assert.equal(snapshot.metrics.cash_minor, "200000");
  assert.equal(snapshot.cash_counted_minor, "0");
  assert.equal(snapshot.cash_difference_minor, "-200000");
});

it("otra organización y una sesión expirada no pueden consultar ni cerrar la jornada", async () => {
  const { org } = await fixture();
  await start(org, today);
  const outsider = await signedIn(accounts.coffee, config);
  assert.equal(
    (await outsider.rpc("day_review", { p_org: org, p_day: today })).error
      ?.message,
    "forbidden",
  );
  assert.equal(
    (
      await outsider.rpc("complete_day_close", {
        p_org: org,
        p_day: today,
        p_review: "0",
        p_cash_counted: null,
      })
    ).error?.message,
    "forbidden",
  );
  assert.deepEqual(
    ok(
      await outsider
        .from("operating_days")
        .select("day")
        .eq("organization_id", org),
    ),
    [],
  );

  const segment = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const expired = Math.floor(Date.now() / 1000) - 3600;
  const body = `${segment({ alg: "HS256", typ: "JWT" })}.${segment({ sub: adminId, role: "authenticated", aud: "authenticated", exp: expired })}`;
  const signed = createHmac("sha256", localJwtSecret())
    .update(body)
    .digest("base64url");
  const anonymous = localClient(config.url, config.key);
  const result = await anonymous
    .rpc("day_review", { p_org: org, p_day: today })
    .setHeader("Authorization", `Bearer ${body}.${signed}`);
  assert.equal(result.status, 401);
  assert.match(result.error?.message ?? "", /expired/i);
});
