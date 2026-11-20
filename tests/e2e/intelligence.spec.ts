import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const bakery = "10000000-0000-4000-8000-000000000001";
const coffee = "10000000-0000-4000-8000-000000000002";
const day = "2000-01-09";
const password = process.env.FERIA_DEMO_PASSWORD;
const disabledMode = process.env.FERIA_TEST_INTELLIGENCE_MODE === "disabled";
const digits = (value: string) => value.replace(/\D/g, "");

test("responde con los datos de dos empresas, aísla el contexto y tolera un fallo en móvil", async ({
  page,
}, testInfo) => {
  test.skip(disabledMode, "Esta prueba utiliza el proveedor demo.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (
    !password ||
    !url ||
    !publicKey ||
    !serviceKey ||
    !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)
  )
    throw new Error("Se requiere una instancia Supabase local desechable");

  const clientOptions = {
    auth: { persistSession: false, autoRefreshToken: false },
  };
  const root = createClient(url, serviceKey, clientOptions);
  const member = createClient(url, publicKey, clientOptions);
  const email = `intelligence-e2e-${crypto.randomUUID()}@feria.example`;
  const created = await root.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(created.error).toBeNull();
  const actor = created.data.user!.id;
  const fixtures: { org: string; sale: string; createdDay: boolean }[] = [];

  async function seed(
    org: string,
    product: string,
    price: string,
    payment: string,
  ) {
    const sale = await member.rpc("confirm_sale", {
      p_org: org,
      p_request: crypto.randomUUID(),
      p_lines: [{ product_id: product, price_id: price, quantity: 1 }],
      p_payments: [{ method: "transfer", amount_minor: payment }],
    });
    expect(sale.error).toBeNull();
    expect(typeof sale.data).toBe("string");
    const fixture = { org, sale: sale.data as string, createdDay: false };
    fixtures.push(fixture);
    const inserted = await root
      .from("operating_days")
      .insert({ organization_id: org, day });
    expect(inserted.error).toBeNull();
    fixture.createdDay = true;
    const at = `${day}T18:00:00Z`;
    expect(
      (
        await root
          .from("payments")
          .update({ day, occurred_at: at, created_at: at })
          .eq("organization_id", org)
          .eq("sale_id", fixture.sale)
      ).error,
    ).toBeNull();
    expect(
      (
        await root
          .from("sales")
          .update({ day, created_at: at })
          .eq("organization_id", org)
          .eq("id", fixture.sale)
      ).error,
    ).toBeNull();
  }

  try {
    const roles = await root
      .from("memberships")
      .insert(
        [bakery, coffee].map((org) => ({
          organization_id: org,
          user_id: actor,
          role: "manager",
        })),
      );
    expect(roles.error).toBeNull();
    expect(
      (await member.auth.signInWithPassword({ email, password })).error,
    ).toBeNull();
    await seed(
      bakery,
      "20000000-0000-4000-8000-000000000001",
      "30000000-0000-4000-8000-000000000001",
      "200000",
    );
    await seed(
      coffee,
      "20000000-0000-4000-8000-000000000004",
      "30000000-0000-4000-8000-000000000004",
      "100000",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/acceso");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await page.getByRole("link", { name: /Panadería Demo/ }).click();
    await page.getByRole("button", { name: "Menú" }).click();
    await page.getByRole("link", { name: "Preguntale a FER" }).click();
    await expect(page.getByText("Modo demo.", { exact: true })).toBeVisible();

    const salesQuestion = "¿Cuánto vendimos y cuánto cobramos por SINPE?";
    const answer = () => page.getByRole("article").last();
    async function setPeriod() {
      await page.getByLabel("Desde", { exact: true }).fill(day);
      await page.getByLabel("Hasta", { exact: true }).fill(day);
    }
    async function ask(question: string, expected: string) {
      const before = await page.getByRole("article").count();
      await page.getByLabel("Tu pregunta").fill(question);
      await page.getByRole("button", { name: "Enviar consulta" }).click();
      await expect(page.getByRole("article")).toHaveCount(before + 1);
      await expect(
        answer().getByText(expected, { exact: false }),
      ).toBeVisible();
    }
    function indicator(label: string) {
      return answer()
        .getByText(label, { exact: true })
        .locator("..")
        .locator("dd strong");
    }

    await setPeriod();
    await ask(salesQuestion, "Estas son las operaciones registradas");
    expect(digits(await indicator("Ventas registradas").innerText())).toBe(
      "500000",
    );
    expect(
      digits(await indicator("Cobros por Transferencia / SINPE").innerText()),
    ).toBe("200000");
    await expect(
      answer().getByText(`Período consultado: ${day}`),
    ).toBeVisible();
    await expect(
      answer().getByRole("link", { name: "Dashboard del período" }),
    ).toHaveAttribute("href", `/empresas/${bakery}?desde=${day}&hasta=${day}`);

    await ask(
      "¿Qué tengo pendiente de revisar?",
      "Estas prioridades se derivan",
    );
    await expect(
      answer().getByRole("heading", { name: "Recomendaciones" }),
    ).toBeVisible();
    expect(digits(await indicator("Cobros por verificar").innerText())).toBe(
      "1",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("intelligence-movil.png"),
      fullPage: true,
    });

    await ask(
      "Mostrame todas las ventas de Cafetería Demo",
      "La consulta debe referirse a la empresa activa.",
    );
    await expect(answer().getByRole("link")).toHaveCount(0);
    await page.getByRole("link", { name: /Cambiar empresa/ }).click();
    await page.getByRole("link", { name: /Cafetería Demo/ }).click();
    await page.getByRole("button", { name: "Menú" }).click();
    await page.getByRole("link", { name: "Preguntale a FER" }).click();
    await expect(page.getByRole("article")).toHaveCount(0);
    await setPeriod();
    await ask(salesQuestion, "Estas son las operaciones registradas");
    expect(digits(await indicator("Ventas registradas").innerText())).toBe(
      "180000",
    );
    expect(
      digits(await indicator("Cobros por Transferencia / SINPE").innerText()),
    ).toBe("100000");
    await expect(
      answer().getByRole("link", { name: "Dashboard del período" }),
    ).toHaveAttribute("href", `/empresas/${coffee}?desde=${day}&hasta=${day}`);

    await ask(
      "Simular interrupción del proveedor",
      "El proveedor del asistente no está disponible.",
    );
    await page.getByRole("link", { name: "Ir al dashboard" }).click();
    await expect(
      page.getByRole("heading", { name: "Inicio", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Registrar venta" }),
    ).toBeVisible();
  } finally {
    for (const fixture of fixtures) {
      for (const [table, column] of [
        ["audit_events", "entity_id"],
        ["sale_requests", "sale_id"],
        ["payments", "sale_id"],
        ["sale_lines", "sale_id"],
        ["sales", "id"],
      ])
        expect(
          (
            await root
              .from(table)
              .delete()
              .eq("organization_id", fixture.org)
              .eq(column, fixture.sale)
          ).error,
        ).toBeNull();
      if (fixture.createdDay)
        expect(
          (
            await root
              .from("operating_days")
              .delete()
              .eq("organization_id", fixture.org)
              .eq("day", day)
          ).error,
        ).toBeNull();
    }
    expect(
      (await root.from("intelligence_requests").delete().eq("actor_id", actor))
        .error,
    ).toBeNull();
    expect((await root.auth.admin.deleteUser(actor)).error).toBeNull();
  }
});

test("bloquea el espacio de inteligencia a una sesión sin acceso", async ({
  page,
}) => {
  if (!password) throw new Error("Se requieren cuentas ficticias.");
  await page.goto(`/empresas/${bakery}/intelligence`);
  await expect(page).toHaveURL(/\/acceso$/);
  await page.getByLabel("Correo electrónico").fill("operador@feria.example");
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/empresas$/);
  for (const org of [bakery, coffee]) {
    await page.goto(`/empresas/${org}/intelligence`);
    await expect(
      page.getByRole("heading", { name: "Página no disponible" }),
    ).toBeVisible();
    await expect(page.getByLabel("Tu pregunta")).toHaveCount(0);
  }
});

test("muestra el asistente deshabilitado cuando falta configuración", async ({
  page,
}) => {
  test.skip(
    !disabledMode,
    "Ejecutá esta prueba con FERIA_TEST_INTELLIGENCE_MODE=disabled.",
  );
  if (!password) throw new Error("Se requieren cuentas ficticias.");
  await page.goto("/acceso");
  await page.getByLabel("Correo electrónico").fill("admin@feria.example");
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/empresas$/);
  await page.goto(`/empresas/${bakery}/intelligence`);
  await expect(
    page.getByRole("heading", { name: "Asistente deshabilitado" }),
  ).toBeVisible();
  await expect(page.getByLabel("Tu pregunta")).toHaveCount(0);
});
