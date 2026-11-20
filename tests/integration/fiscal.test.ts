import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createOfflineFiscalService } from "../../src/modules/fiscal/offline";
import {
  fiscalFixture as fixture,
  syntheticIssuers,
} from "../fixtures/fiscal-offline";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const workerKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const password = process.env.FERIA_DEMO_PASSWORD ?? "";
if (
  !url ||
  url !== process.env.FERIA_FISCAL_DISPOSABLE_URL ||
  !/^(http:\/\/(127\.0\.0\.1|\[::1\]):)\d+$/.test(url) ||
  new URL(url).port === "54321" ||
  !key ||
  !workerKey ||
  !password
)
  throw new Error(
    "Se requiere Supabase desechable en loopback, con puerto alternativo y FERIA_FISCAL_DISPOSABLE_URL explícita.",
  );

const localOrigin = new URL(url).origin;
const fetchLocal = globalThis.fetch.bind(globalThis);
vi.stubGlobal("fetch", ((input, init) => {
  const target = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (target.origin !== localOrigin)
    throw new Error("fiscal_network_forbidden");
  return fetchLocal(input, { ...init, redirect: "error" });
}) satisfies typeof fetch);
afterAll(() => vi.unstubAllGlobals());

const auth = { persistSession: false, autoRefreshToken: false };
const worker = createClient(url, workerKey, { auth });
const admin = createClient(url, key, { auth });
const coffeeManager = createClient(url, key, { auth });
const operator = createClient(url, key, { auth });
const prepare = createOfflineFiscalService({
  url,
  publishableKey: key,
  workerKey,
});
const bakery = "10000000-0000-4000-8000-000000000001";
const coffee = "10000000-0000-4000-8000-000000000002";
let adminToken: string;
let adminId: string;
let coffeeToken: string;
let operatorToken: string;
type Spec = {
  productId: string;
  priceId: string;
  profile: Record<string, string | boolean | null>;
};
const products = new Map<string, Spec>();

function ok<T extends { data: unknown; error: { message: string } | null }>(
  result: T,
): T["data"] {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

beforeAll(async () => {
  const adminSession = ok(
    await admin.auth.signInWithPassword({
      email: "admin@feria.example",
      password,
    }),
  ).session!;
  adminToken = adminSession.access_token;
  adminId = adminSession.user.id;
  operatorToken = ok(
    await operator.auth.signInWithPassword({
      email: "operador@feria.example",
      password,
    }),
  ).session!.access_token;
  const email = `fiscal-${randomUUID()}@feria.example`;
  const user = ok(
    await worker.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    }),
  ).user!;
  ok(
    await worker
      .from("memberships")
      .insert({ organization_id: coffee, user_id: user.id, role: "manager" }),
  );
  coffeeToken = ok(
    await coffeeManager.auth.signInWithPassword({ email, password }),
  ).session!.access_token;

  ok(await worker.from("fiscal_cabys_fixtures").upsert(fixture.provenance));
  for (const [index, organization_id] of [bakery, coffee].entries()) {
    const issuer = ok(
      await worker
        .from("fiscal_issuers")
        .upsert(syntheticIssuers[index], {
          onConflict: "identification_type,identification_number",
        })
        .select("id,identification_number")
        .single(),
    )!;
    ok(
      await worker.from("fiscal_organization_settings").upsert({
        organization_id,
        issuer_id: issuer.id,
        supplier_id: issuer.identification_number,
        issuer_activity: "620100",
        branch: "001",
        terminal: "00001",
        offline_enabled: true,
      }),
    );
    const productId = randomUUID();
    const priceId = randomUUID();
    ok(
      await worker.from("products").insert({
        organization_id,
        id: productId,
        name: "Servicio fiscal ficticio",
      }),
    );
    ok(
      await worker.from("product_prices").insert({
        organization_id,
        id: priceId,
        product_id: productId,
        currency: "CRC",
        scale: 2,
        amount_minor: fixture.grossMinor,
      }),
    );
    const profile = {
      organization_id,
      product_id: productId,
      price_id: priceId,
      cabys: fixture.provenance.code,
      unit: "Sp",
      is_service: true,
      tax_treatment: "iva13",
      net_unit: fixture.netUnit,
      price_includes_tax: true,
    };
    ok(await worker.from("fiscal_product_profiles").insert(profile));
    products.set(organization_id, { productId, priceId, profile });
  }
});

async function sale(
  organizationId: string,
  client: SupabaseClient,
  method: "transfer" | "cash" = "transfer",
  amount = fixture.grossMinor,
) {
  const { productId, priceId } = products.get(organizationId)!;
  const id = ok(
    await client.rpc("confirm_sale", {
      p_org: organizationId,
      p_request: randomUUID(),
      p_lines: [{ product_id: productId, price_id: priceId, quantity: 1 }],
      p_payments: [{ method, amount_minor: amount }],
    }),
  );
  const payment = ok(
    await client
      .from("payment_details")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("sale_id", id)
      .single(),
  )!;
  return { id, payment: payment.id };
}

const invoice = (saleId: string, transfers: Record<string, string> = {}) => ({
  organizationId: bakery,
  saleId,
  kind: "01",
  receiver: fixture.receiver,
  transfers,
});
const ticket = (saleId: string, transfers: Record<string, string> = {}) => ({
  organizationId: coffee,
  saleId,
  kind: "04",
  receiver: null,
  transfers,
});

async function financialState() {
  return Promise.all([
    admin.from("sales_overview").select("*").order("id"),
    admin.from("payment_details").select("*").order("id"),
    admin
      .from("operating_days")
      .select("*")
      .order("day")
      .order("organization_id"),
    admin
      .from("day_closures")
      .select("*")
      .order("day")
      .order("organization_id"),
  ]).then((results) => results.map(ok));
}

it("prepara FE y TE desde ventas reales del fixture, separa transferencia y SINPE, y deja intacto el núcleo", async () => {
  const first = await sale(bakery, admin);
  const second = await sale(coffee, coffeeManager);
  const financialBefore = await financialState();
  const bank = invoice(first.id, { [first.payment]: "bank_transfer" });
  const sinpe = ticket(second.id, { [second.payment]: "sinpe_movil" });
  await expect(prepare(adminToken, invoice(first.id))).rejects.toThrow(
    "fiscal_transfer_classification_required",
  );
  const [fe, retry, te] = await Promise.all([
    prepare(adminToken, bank),
    prepare(adminToken, bank),
    prepare(coffeeToken, sinpe),
  ]);
  expect(retry).toEqual(fe);
  expect(te.clave).not.toBe(fe.clave);
  expect(fe.totals).toEqual(fixture.totals);
  expect(te.totals).toEqual(fixture.totals);
  expect(fe.xml).toContain("<TipoMedioPago>04</TipoMedioPago>");
  expect(te.xml).toContain("<TipoMedioPago>06</TipoMedioPago>");
  expect(fe.xml).toContain("<Receptor>");
  expect(te.xml).not.toContain("<Receptor>");
  expect(fe.sha256).toBe(createHash("sha256").update(fe.xml).digest("hex"));
  expect(te.sha256).toBe(createHash("sha256").update(te.xml).digest("hex"));
  expect(await financialState()).toEqual(financialBefore);
  expect(
    ok(
      await admin
        .from("fiscal_history")
        .select("event")
        .eq("intent_id", fe.intentId)
        .order("created_at"),
    ),
  ).toEqual([{ event: "reserved_offline" }, { event: "prepared_offline" }]);
  expect(
    ok(
      await admin
        .from("fiscal_offline_status")
        .select("status")
        .eq("intent_id", fe.intentId)
        .single(),
    ),
  ).toEqual({ status: "prepared_offline" });
  await expect(
    prepare(adminToken, invoice(first.id, { [first.payment]: "sinpe_movil" })),
  ).rejects.toThrow("fiscal_intent_conflict");
  await expect(
    prepare(adminToken, { ...bank, kind: "04", receiver: null }),
  ).rejects.toThrow("fiscal_intent_conflict");
  const output = process.env.FERIA_FISCAL_OUTPUT_DIR;
  if (output) {
    await mkdir(output, { recursive: true, mode: 0o700 });
    await writeFile(
      resolve(output, "factura-ficticia-sin-firma.offline.xml"),
      fe.xml,
      { mode: 0o600 },
    );
    await writeFile(
      resolve(output, "tiquete-ficticio-sin-firma.offline.xml"),
      te.xml,
      { mode: 0o600 },
    );
  }
});

it("reserva consecutivos diferentes en paralelo y protege la instantánea y el XML final", async () => {
  const [a, b] = await Promise.all([
    sale(bakery, admin, "cash"),
    sale(bakery, admin, "cash"),
  ]);
  const [one, two] = await Promise.all([
    prepare(adminToken, invoice(a.id)),
    prepare(adminToken, invoice(b.id)),
  ]);
  expect(one.consecutive).not.toBe(two.consecutive);
  const seq = [one, two]
    .map((document) => Number(document.consecutive.slice(-10)))
    .sort((x, y) => x - y);
  expect(seq[1]).toBe(seq[0] + 1);
  const update = await admin
    .from("fiscal_documents")
    .update({ xml: "changed" })
    .eq("intent_id", one.intentId);
  expect(update.error?.code).toBe("42501");
  const privilegedUpdate = await worker
    .from("fiscal_intents")
    .update({ snapshot: {} })
    .eq("id", one.intentId);
  expect(privilegedUpdate.error?.code).toBe("42501");
  const altered = await worker.rpc("store_fiscal_offline", {
    p_actor: adminId,
    p_org: bakery,
    p_intent: one.intentId,
    p_clave: one.clave,
    p_consecutive: one.consecutive,
    p_xml: one.xml + "\n",
    p_totals: one.totals,
  });
  expect(altered.error?.message).toBe("fiscal_record_immutable");
  ok(
    await worker
      .from("fiscal_product_profiles")
      .update({ net_unit: "900.00000" })
      .eq("price_id", products.get(bakery)!.priceId),
  );
  try {
    expect(await prepare(adminToken, invoice(a.id))).toEqual(one);
  } finally {
    ok(
      await worker
        .from("fiscal_product_profiles")
        .update({ net_unit: fixture.netUnit })
        .eq("price_id", products.get(bakery)!.priceId),
    );
  }
});

it("bloquea roles, llamadas directas y acceso cruzado incluso con IDs conocidos", async () => {
  const entry = await sale(bakery, admin, "cash");
  const document = await prepare(adminToken, invoice(entry.id));
  await expect(prepare(coffeeToken, invoice(entry.id))).rejects.toThrow(
    "fiscal_forbidden",
  );
  await expect(prepare(coffeeToken, ticket(entry.id))).rejects.toThrow(
    "fiscal_sale_unavailable",
  );
  await expect(prepare(operatorToken, invoice(entry.id))).rejects.toThrow(
    "fiscal_forbidden",
  );
  await expect(prepare("bad-token", invoice(entry.id))).rejects.toThrow(
    "fiscal_forbidden",
  );
  const direct = await admin.rpc("reserve_fiscal_offline", {
    p_actor: adminId,
    p_org: bakery,
    p_sale: entry.id,
    p_kind: "01",
    p_receiver: fixture.receiver,
    p_transfers: {},
  });
  expect(direct.error?.code).toBe("42501");
  for (const client of [coffeeManager, operator]) {
    expect(
      ok(
        await client
          .from("fiscal_documents")
          .select("xml")
          .eq("intent_id", document.intentId),
      ),
    ).toEqual([]);
    expect(
      ok(
        await client
          .from("fiscal_intents")
          .select("snapshot")
          .eq("id", document.intentId),
      ),
    ).toEqual([]);
    expect(
      ok(
        await client
          .from("fiscal_history")
          .select("event")
          .eq("intent_id", document.intentId),
      ),
    ).toEqual([]);
  }
});

it("recupera una reserva pendiente con el mismo consecutivo después de una interrupción", async () => {
  const entry = await sale(bakery, admin, "cash");
  const pending = ok(
    await worker.rpc("reserve_fiscal_offline", {
      p_actor: adminId,
      p_org: bakery,
      p_sale: entry.id,
      p_kind: "01",
      p_receiver: fixture.receiver,
      p_transfers: {},
    }),
  );
  expect(
    ok(
      await admin
        .from("fiscal_offline_status")
        .select("status,clave")
        .eq("intent_id", pending.id)
        .single(),
    ),
  ).toEqual({ status: "reserved_offline", clave: null });
  const recovered = await prepare(adminToken, invoice(entry.id));
  expect(recovered.intentId).toBe(pending.id);
  expect(recovered.consecutive.slice(-10)).toBe(
    String(pending.sequence).padStart(10, "0"),
  );
});

it("rechaza CABYS ausente o ajeno al fixture, IVA ausente, importes distintos y pagos incompletos", async () => {
  const entry = await sale(bakery, admin, "cash");
  const price = products.get(bakery)!.priceId;
  const change = (values: object) =>
    worker.from("fiscal_product_profiles").update(values).eq("price_id", price);
  const unknown = await change({ cabys: "8310100009999" });
  expect(unknown.error?.code).toBe("23503");
  try {
    ok(await change({ cabys: null }));
    await expect(prepare(adminToken, invoice(entry.id))).rejects.toThrow(
      "fiscal_cabys_missing",
    );
    ok(await change({ cabys: fixture.provenance.code, tax_treatment: null }));
    await expect(prepare(adminToken, invoice(entry.id))).rejects.toThrow(
      "fiscal_iva_missing",
    );
    ok(await change({ tax_treatment: "iva13", net_unit: "999.99000" }));
    await expect(prepare(adminToken, invoice(entry.id))).rejects.toThrow(
      "fiscal_amount_mismatch",
    );
    expect(
      ok(
        await admin.from("fiscal_intents").select("id").eq("sale_id", entry.id),
      ),
    ).toEqual([]);
  } finally {
    ok(await change({ ...products.get(bakery)!.profile }));
  }
  const partial = await sale(bakery, admin, "cash", "50000");
  await expect(prepare(adminToken, invoice(partial.id))).rejects.toThrow(
    "fiscal_requires_payment_at_sale",
  );
});
