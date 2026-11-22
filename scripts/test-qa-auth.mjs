import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";

const approvedRef = "lqqeisjzoajtvwcifard";
const hostedOrigin = `https://${approvedRef}.supabase.co`;
const auth = { persistSession: false, autoRefreshToken: false };
const mode = process.env.FERIA_QA_MODE;
const origin = process.env.FERIA_QA_URL;
const publishable = process.env.FERIA_QA_PUBLISHABLE_KEY;
const adminKey = process.env.FERIA_QA_ADMIN_KEY;

function target() {
  assert.ok(origin && publishable && adminKey, "Falta acceso efímero para QA.");
  assert.ok(URL.canParse(origin), "Usá una URL de QA válida.");
  const url = new URL(origin);
  assert.ok(
    origin === url.origin,
    "Usá el origen exacto, sin ruta ni credenciales.",
  );
  if (mode === "local") {
    assert.equal(url.protocol, "http:");
    assert.equal(url.hostname, "127.0.0.1");
    assert.ok(
      url.port && url.port !== "54321",
      "Usá una instancia local desechable en un puerto alternativo.",
    );
  } else {
    assert.equal(mode, "hosted", "Elegí local o hosted explícitamente.");
    assert.equal(
      origin,
      hostedOrigin,
      "El host no corresponde al QA aprobado.",
    );
    assert.equal(
      process.env.FERIA_QA_APPROVED_REF,
      approvedRef,
      "Falta confirmar el ref QA ya verificado.",
    );
  }
  // En modo alojado la separación también se verifica con la credencial de cuenta.
  assert.ok(
    publishable !== adminKey,
    "La clave de usuario y la de aprovisionamiento deben ser distintas.",
  );
  if (mode === "hosted") {
    assert.ok(
      publishable.startsWith("sb_publishable_"),
      "Usá la clave publicable del proyecto QA.",
    );
    assert.ok(
      adminKey.startsWith("sb_secret_"),
      "Usá una credencial administrativa aislada de QA.",
    );
  }
  return url.origin;
}

const qaOrigin = target();

function restrictedFetch(input, init) {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.origin !== qaOrigin) throw new Error("Destino fuera del entorno QA.");
  const limit = AbortSignal.timeout(10_000);
  return fetch(input, {
    ...init,
    redirect: "error",
    signal: init?.signal ? AbortSignal.any([init.signal, limit]) : limit,
  });
}

function client(key = publishable, token) {
  return createClient(qaOrigin, key, {
    auth,
    global: { fetch: restrictedFetch },
    ...(token ? { accessToken: async () => token } : {}),
  });
}

function ok(result, stage) {
  if (result.error) {
    const code = result.error.code;
    const safe =
      typeof code === "string" && /^[a-z0-9_]{1,50}$/i.test(code)
        ? code
        : "error";
    throw new Error(`${stage} · ${safe}`);
  }
  return result.data;
}

function denied(result, stage) {
  assert.ok(result.error, `${stage} debía rechazarse`);
  assert.equal(result.error.code, "42501", stage);
}

const root = client(adminKey);
const run = randomUUID();
const organizations = Array.from({ length: 2 }, () => ({
  id: randomUUID(),
  product: randomUUID(),
  price: randomUUID(),
}));
const users = [];
const sessions = [];
const row = (organization, fields) => ({
  organization_id: organization.id,
  ...fields,
});

async function createUser(role) {
  const email = `qa-${run}-${role}@feria.example`;
  const password = randomBytes(32).toString("base64url");
  const { user } = ok(
    await root.auth.admin.createUser({ email, password, email_confirm: true }),
    "Crear usuario ficticio mediante Auth Admin",
  );
  assert.ok(user?.id, "Auth Admin debe devolver el ID del usuario ficticio.");
  const account = { id: user.id, email, password };
  users.push(account);
  assert.ok(
    user.email_confirmed_at,
    "El alta administrativa debe quedar confirmada.",
  );
  return account;
}

async function signIn(account) {
  const signed = client();
  const { session, user } = ok(
    await signed.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    }),
    "Iniciar sesión",
  );
  sessions.push(signed);
  assert.ok(
    session && user?.id === account.id,
    "La sesión corresponde al usuario de prueba.",
  );
  return { signed, session };
}

function claims(session) {
  return JSON.parse(
    Buffer.from(session.access_token.split(".")[1], "base64url"),
  );
}

function catalog(actor, organization) {
  return actor
    .from("catalog")
    .select("id")
    .eq("organization_id", organization.id);
}

function sale(organization) {
  return {
    p_org: organization.id,
    p_request: randomUUID(),
    p_lines: [
      {
        product_id: organization.product,
        price_id: organization.price,
        quantity: 1,
      },
    ],
    p_payments: [
      { method: "cash", amount_minor: "200000" },
      { method: "card", amount_minor: "50000" },
    ],
  };
}

async function provision() {
  const response = await restrictedFetch(`${qaOrigin}/auth/v1/settings`, {
    headers: { apikey: publishable },
  });
  assert.ok(response.ok, "No se pudo verificar la configuración de Auth.");
  const settings = await response.json();
  assert.equal(
    settings.disable_signup,
    true,
    "El registro público debe estar cerrado.",
  );
  assert.equal(
    settings.external?.anonymous_users,
    false,
    "Auth anónimo debe estar deshabilitado.",
  );
  assert.equal(
    settings.external?.email,
    true,
    "El proveedor de email debe estar habilitado.",
  );

  const admin = await createUser("admin");
  const operator = await createUser("operador");
  const [first, second] = organizations;
  for (const [org, name] of [
    [first, "Panadería ficticia"],
    [second, "Cafetería ficticia"],
  ]) {
    ok(
      await root.from("organizations").insert({
        id: org.id,
        name: `QA ${name} ${run}`,
        currency: "CRC",
        scale: 2,
        timezone: "America/Costa_Rica",
      }),
      "Crear organización ficticia",
    );
    ok(
      await root
        .from("products")
        .insert(row(org, { id: org.product, name: "Producto ficticio QA" })),
      "Crear producto ficticio",
    );
    ok(
      await root.from("product_prices").insert(
        row(org, {
          id: org.price,
          product_id: org.product,
          currency: "CRC",
          scale: 2,
          amount_minor: "500000",
        }),
      ),
      "Crear precio ficticio",
    );
  }
  ok(
    await root
      .from("memberships")
      .insert([
        row(first, { user_id: admin.id, role: "admin" }),
        row(second, { user_id: admin.id, role: "admin" }),
        row(second, { user_id: operator.id, role: "operator" }),
      ]),
    "Asignar membresías de QA",
  );
  return { admin, operator, first, second };
}

async function cleanup() {
  const issues = [];
  const attempt = async (name, work) => {
    try {
      await work();
    } catch {
      issues.push(name);
    }
  };
  for (const signed of sessions) {
    await attempt("cerrar sesión temporal", async () => {
      ok(await signed.auth.signOut({ scope: "local" }), "Cerrar sesión");
    });
  }
  if (users.length) {
    const ids = organizations.map(({ id }) => id);
    for (const table of [
      "conversational_sale_drafts",
      "intelligence_requests",
      "audit_events",
      "collection_requests",
      "sale_requests",
      "payment_evidence",
      "day_closures",
      "payments",
      "sale_lines",
      "sales",
      "operating_days",
      "product_prices",
      "products",
      "memberships",
    ]) {
      await attempt(table, async () => {
        ok(
          await root.from(table).delete().in("organization_id", ids),
          "Limpiar fixture",
        );
      });
    }
    await attempt("organizations", async () => {
      ok(
        await root.from("organizations").delete().in("id", ids),
        "Limpiar organizaciones esperadas",
      );
      const rows = ok(
        await root.from("organizations").select("id").in("id", ids),
        "Verificar organizaciones remanentes",
      );
      assert.equal(rows.length, 0);
    });
    for (const { id } of users) {
      await attempt("usuario Auth", async () => {
        ok(
          await root.auth.admin.deleteUser(id),
          "Eliminar usuario ficticio mediante Auth Admin",
        );
        const result = await root.auth.admin.getUserById(id);
        assert.equal(
          result.error?.status,
          404,
          "El usuario temporal ya no debe existir.",
        );
      });
    }
  }
  assert.deepEqual(
    issues,
    [],
    `Falló la limpieza de fixtures QA. Identificador no secreto: ${run}`,
  );
}

test("Auth real y aislamiento del conjunto de QA", async (t) => {
  t.diagnostic(`Identificador de fixtures QA: ${run}`);
  try {
    const { admin, operator, first, second } = await provision();

    await t.test(
      "acceso anónimo, catálogo propio, roles y escritura financiera autorizada",
      async () => {
        const guest = client();
        const guestRows = await catalog(guest, second);
        assert.ok(
          guestRows.error?.code === "42501" ||
            (guestRows.error === null && guestRows.data.length === 0),
          "El catálogo no es público.",
        );
        denied(await guest.rpc("confirm_sale", sale(second)), "RPC anónimo");
        const { signed } = await signIn(operator);
        const { signed: privileged } = await signIn(admin);
        assert.deepEqual(
          ok(await catalog(privileged, first), "Catálogo de A"),
          [{ id: first.product }],
        );
        assert.deepEqual(
          ok(await catalog(privileged, second), "Catálogo de B como admin"),
          [{ id: second.product }],
        );
        assert.deepEqual(ok(await catalog(signed, second), "Catálogo propio"), [
          { id: second.product },
        ]);
        assert.deepEqual(
          ok(await catalog(signed, first), "Lectura cruzada"),
          [],
        );
        denied(await signed.rpc("confirm_sale", sale(first)), "RPC cruzado");
        denied(
          await signed.rpc("operations_metrics", {
            p_org: second.id,
            p_from: "2026-01-01",
            p_to: "2026-01-01",
          }),
          "Métricas reservadas para gerencia",
        );
        const input = sale(second);
        const id = ok(
          await signed.rpc("confirm_sale", input),
          "Venta con pago dividido",
        );
        assert.equal(
          ok(await signed.rpc("confirm_sale", input), "Reintento idempotente"),
          id,
        );
        const balance = ok(
          await signed
            .from("sales_overview")
            .select("total_minor,paid_minor,balance_minor")
            .eq("id", id)
            .single(),
          "Movimientos autorizados",
        );
        assert.deepEqual(balance, {
          total_minor: "500000",
          paid_minor: "250000",
          balance_minor: "250000",
        });
        const foreignSale = ok(
          await signed
            .from("sales")
            .select("id")
            .eq("organization_id", first.id),
          "Ventas de empresa ajena",
        );
        assert.deepEqual(foreignSale, []);
      },
    );

    await t.test(
      "refresh, dos sesiones y denegación del JWT de la sesión cerrada",
      async () => {
        const a = await signIn(operator);
        const b = await signIn(operator);
        assert.ok(
          claims(a.session).session_id !== claims(b.session).session_id,
          "Dos sesiones independientes.",
        );
        const { session: renewed } = ok(
          await a.signed.auth.refreshSession(),
          "Renovar la sesión A",
        );
        assert.ok(
          renewed && renewed.refresh_token !== a.session.refresh_token,
          "Rotación del refresh token.",
        );
        assert.ok(
          claims(renewed).session_id === claims(a.session).session_id,
          "El refresh mantiene el ID de sesión.",
        );
        assert.ok(
          claims(renewed).exp > Date.now() / 1_000,
          "El JWT sigue vigente al probar revocación.",
        );
        const detached = client(publishable, renewed.access_token);
        assert.equal(
          ok(await catalog(detached, second), "JWT antes del cierre").length,
          1,
        );
        ok(
          await a.signed.auth.signOut({ scope: "local" }),
          "Cerrar solamente A",
        );
        const retry = await a.signed.auth.refreshSession({
          refresh_token: renewed.refresh_token,
        });
        assert.ok(
          retry.error && !retry.data.session,
          "La sesión A no puede renovar después del cierre.",
        );
        const blocked = await catalog(detached, second);
        assert.ok(
          blocked.status === 401 ||
            (blocked.error === null && blocked.data.length === 0),
          "El JWT cerrado no puede leer RLS.",
        );
        const write = await detached.rpc("confirm_sale", sale(second));
        assert.ok(
          write.status === 401 || write.error?.code === "42501",
          "El JWT cerrado no puede escribir por RPC.",
        );
        assert.equal(
          ok(await catalog(b.signed, second), "Sesión B vigente").length,
          1,
        );
      },
    );

    await t.test(
      "revocar membresía corta acceso con la sesión todavía válida",
      async () => {
        const repair = await signIn(admin);
        const actor = await signIn(operator);
        ok(
          await repair.signed.rpc("set_membership", {
            p_org: second.id,
            p_user: operator.id,
            p_role: "operator",
            p_active: false,
          }),
          "Revocar membresía",
        );
        ok(await actor.signed.auth.getUser(), "La identidad Auth sigue válida");
        assert.deepEqual(
          ok(
            await catalog(actor.signed, second),
            "Lecturas tras revocación de membresía",
          ),
          [],
        );
        denied(
          await actor.signed.rpc("confirm_sale", sale(second)),
          "Escrituras tras revocación de membresía",
        );
      },
    );
  } finally {
    await cleanup();
  }
});
