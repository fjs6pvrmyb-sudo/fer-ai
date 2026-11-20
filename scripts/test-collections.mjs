import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { after, it } from "node:test";
import {
  accounts,
  ids,
  localClient,
  localConfig,
  signedIn,
} from "./local-demo.mjs";

const config = localConfig();
const root = localClient(config.url, config.serviceKey);
const anon = localClient(config.url, config.key);
const [admin, operator, coffee] = await Promise.all(
  [accounts.admin, accounts.operator, accounts.coffee].map((email) =>
    signedIn(email, config),
  ),
);
const adminId = (await admin.auth.getUser()).data.user.id;
const sales = [];
const past = "2000-01-04";
let createdPastDay = false;

function ok({ error, data }) {
  assert.equal(error, null, error?.message);
  return data;
}

async function saleFixture(previous = false) {
  const sale = ok(
    await admin.rpc("confirm_sale", {
      p_org: ids.bakery,
      p_request: randomUUID(),
      p_lines: [
        { product_id: ids.bread, price_id: ids.breadPrice, quantity: 1 },
      ],
      p_payments: [{ method: "transfer", amount_minor: "200000" }],
    }),
  );
  sales.push(sale);
  if (previous) {
    const at = `${past}T15:00:00Z`;
    const inserted = ok(
      await root
        .from("operating_days")
        .upsert(
          {
            organization_id: ids.bakery,
            day: past,
            closed_at: `${past}T23:00:00Z`,
          },
          { ignoreDuplicates: true },
        )
        .select("day"),
    );
    createdPastDay ||= inserted.length > 0;
    ok(
      await root
        .from("sales")
        .update({ day: past, created_at: at })
        .eq("organization_id", ids.bakery)
        .eq("id", sale),
    );
    ok(
      await root
        .from("payments")
        .update({ day: past, occurred_at: at, created_at: at })
        .eq("organization_id", ids.bakery)
        .eq("sale_id", sale),
    );
  }
  return sale;
}

function input(sale, minor = "300000") {
  return {
    p_org: ids.bakery,
    p_sale: sale,
    p_request: randomUUID(),
    p_currency: "CRC",
    p_method: "transfer",
    p_amount_minor: minor,
  };
}

const collect = (data, client = admin) => client.rpc("collect_payment", data);
const overview = async (sale) =>
  ok(
    await admin
      .from("sales_overview")
      .select("id,day,total_minor,paid_minor,balance_minor")
      .eq("organization_id", ids.bakery)
      .eq("id", sale)
      .single(),
  );
const payments = async (sale) =>
  ok(
    await admin
      .from("payment_details")
      .select("id,day,method,amount_minor,occurred_at,created_at")
      .eq("organization_id", ids.bakery)
      .eq("sale_id", sale)
      .order("created_at"),
  );

after(async () => {
  if (!sales.length) return;
  const rows = ok(
    await root
      .from("payments")
      .select("id")
      .eq("organization_id", ids.bakery)
      .in("sale_id", sales),
  );
  ok(
    await root
      .from("audit_events")
      .delete()
      .eq("organization_id", ids.bakery)
      .in("entity_id", [...sales, ...rows.map(({ id }) => id)]),
  );
  for (const [table, key] of [
    ["collection_requests", "sale_id"],
    ["sale_requests", "sale_id"],
    ["payments", "sale_id"],
    ["sale_lines", "sale_id"],
    ["sales", "id"],
  ]) {
    ok(
      await root
        .from(table)
        .delete()
        .eq("organization_id", ids.bakery)
        .in(key, sales),
    );
  }
  if (createdPastDay) {
    ok(
      await root
        .from("operating_days")
        .delete()
        .eq("organization_id", ids.bakery)
        .eq("day", past),
    );
  }
});

it("saldo parcial posterior, cierre del saldo y reintento normalizado con recibo original", async () => {
  const sale = await saleFixture();
  const draft = input(sale, "100050");
  const partial = ok(await collect(draft));
  assert.equal(partial.balance_minor, "199950");
  assert.equal(partial.sale_id, sale);
  assert.equal(ok(await collect(input(sale, "199950"))).balance_minor, "0");
  const replay = ok(await collect({ ...draft, p_amount_minor: "0100050" }));
  assert.deepEqual(replay, { ...partial, replayed: true });
  assert.equal(
    (await collect({ ...draft, p_method: "cash" })).error?.message,
    "collection_conflict",
  );
  assert.equal(
    (await collect(input(sale, "1"))).error?.message,
    "insufficient_balance",
  );
  assert.equal((await payments(sale)).length, 3);
});

it("rechaza formatos, moneda incompatible y sobrepago sin modificar el saldo", async () => {
  const sale = await saleFixture();
  for (const invalid of ["0", "-1", "1.25", "9223372036854775808"]) {
    assert.equal(
      (await collect(input(sale, invalid))).error?.message,
      "invalid_collection",
    );
  }
  assert.equal(
    (await collect({ ...input(sale), p_currency: "USD" })).error?.message,
    "currency_mismatch",
  );
  assert.equal(
    (await collect(input(sale, "300001"))).error?.message,
    "insufficient_balance",
  );
  assert.equal((await overview(sale)).balance_minor, "300000");
  assert.equal((await payments(sale)).length, 1);
});

it("dos cobros simultáneos dejan un solo movimiento nuevo sobre la venta de una jornada anterior", async () => {
  const sale = await saleFixture(true);
  const before = await overview(sale);
  assert.deepEqual(before, {
    id: sale,
    day: past,
    total_minor: "500000",
    paid_minor: "200000",
    balance_minor: "300000",
  });
  assert.equal((await payments(sale)).length, 1);

  const drafts = [input(sale), input(sale)];
  const attempts = await Promise.all(drafts.map((draft) => collect(draft)));
  const winner = attempts.findIndex(({ error }) => !error);
  assert.notEqual(winner, -1);
  const receipt = ok(attempts[winner]);
  assert.equal(attempts[1 - winner].error?.message, "insufficient_balance");
  assert.deepEqual(ok(await collect(drafts[winner])), {
    ...receipt,
    replayed: true,
  });
  assert.equal(receipt.balance_minor, "0");
  assert.ok(receipt.day > past);
  const registered = await payments(sale);
  assert.deepEqual(
    registered.map(({ day, amount_minor }) => [day, amount_minor]),
    [
      [past, "200000"],
      [receipt.day, "300000"],
    ],
  );
  assert.equal(registered[1].id, receipt.payment_id);
  assert.equal(registered[1].occurred_at, registered[1].created_at);
  assert.equal(
    receipt.day,
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Costa_Rica",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(registered[1].occurred_at)),
  );
  assert.deepEqual(await overview(sale), {
    ...before,
    paid_minor: "500000",
    balance_minor: "0",
  });
  const audit = ok(
    await admin
      .from("audit_events")
      .select("actor_id,action,details")
      .eq("organization_id", ids.bakery)
      .eq("entity_id", receipt.payment_id)
      .single(),
  );
  assert.equal(audit.actor_id, adminId);
  assert.equal(audit.action, "payment_collected");
  assert.equal(audit.details.sale_id, sale);
  assert.equal(audit.details.day, receipt.day);
  assert.equal(audit.details.balance_minor, "0");
});

it("deniega anónimos, token inválido, rol insuficiente, ventas ajenas y escrituras directas", async () => {
  const sale = await saleFixture();
  const draft = input(sale);
  assert.ok((await collect(draft, anon)).error);
  const invalid = localClient(config.url, config.key);
  const invalidToken = await invalid
    .rpc("collect_payment", draft)
    .setHeader("Authorization", "Bearer invalid");
  assert.ok(invalidToken.error);
  assert.equal((await collect(draft, operator)).error?.message, "forbidden");
  assert.equal((await collect(draft, coffee)).error?.message, "forbidden");
  // The same actor is manager in Cafetería, so this also checks scoped sale IDs.
  assert.equal(
    (await collect({ ...draft, p_org: ids.coffee })).error?.message,
    "sale_unavailable",
  );
  assert.ok(
    (
      await admin
        .from("payments")
        .update({ amount_minor: 1 })
        .eq("sale_id", sale)
    ).error,
  );
  assert.ok(
    (await admin.from("collection_requests").select("payment_id")).error,
  );
  assert.equal((await payments(sale)).length, 1);
});
