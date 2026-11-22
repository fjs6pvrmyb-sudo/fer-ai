import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test("revisa, cierra y concilia dos jornadas desde el dashboard móvil", async ({
  page,
}, testInfo) => {
  const password = process.env.FERIA_DEMO_PASSWORD;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (
    !password ||
    !url ||
    !key ||
    !serviceKey ||
    !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)
  )
    throw new Error("Se requiere una instancia local desechable");

  const org = "10000000-0000-4000-8000-000000000001";
  const historicalDay = "2000-01-07";
  const auth = { persistSession: false, autoRefreshToken: false };
  const root = createClient(url, serviceKey, { auth });
  const client = createClient(url, key, { auth });
  const login = await client.auth.signInWithPassword({
    email: "admin@feria.example",
    password,
  });
  expect(login.error).toBeNull();
  const sale = await client.rpc("confirm_sale", {
    p_org: org,
    p_request: crypto.randomUUID(),
    p_lines: [
      {
        product_id: "20000000-0000-4000-8000-000000000001",
        price_id: "30000000-0000-4000-8000-000000000001",
        quantity: 1,
      },
    ],
    p_payments: [{ method: "transfer", amount_minor: "200000" }],
  });
  expect(sale.error).toBeNull();
  expect(typeof sale.data).toBe("string");
  const id: string = sale.data;
  let createdDay = false;
  const base = `/empresas/${org}`;
  const salePath = `${base}/ventas/${id}`;
  const at = `${historicalDay}T16:00:00Z`;
  try {
    const day = await root
      .from("operating_days")
      .insert({ organization_id: org, day: historicalDay });
    expect(day.error).toBeNull();
    createdDay = true;
    const movement = await root
      .from("payments")
      .update({ day: historicalDay, occurred_at: at, created_at: at })
      .eq("organization_id", org)
      .eq("sale_id", id);
    expect(movement.error).toBeNull();
    const prior = await root
      .from("sales")
      .update({ day: historicalDay, created_at: at })
      .eq("organization_id", org)
      .eq("id", id);
    expect(prior.error).toBeNull();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/acceso");
    await page.getByLabel("Correo electrónico").fill("admin@feria.example");
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await page.getByRole("link", { name: /Panadería Demo/ }).click();
    await page.getByRole("button", { name: "Menú" }).click();
    await page.getByRole("link", { name: "Jornadas", exact: true }).click();
    await page.getByRole("link", { name: new RegExp(historicalDay) }).click();
    await expect(
      page.getByRole("heading", { name: "Jornada diaria" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Iniciar revisión" }).click();
    await expect(
      page.getByRole("heading", { name: "Cierre operativo" }),
    ).toBeVisible();
    await expect(
      page.getByText("Cierre pendiente", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Diferencia prevista:")).toBeVisible();
    await page.getByRole("button", { name: "Confirmar cierre" }).click();
    await expect(
      page.getByRole("heading", { name: "Instantánea del cierre" }),
    ).toBeVisible();
    await expect(
      page.getByText("Pagos por verificar al cierre: 1."),
    ).toBeVisible();
    await expect(
      page.getByText("Efectivo contado", { exact: true }).locator(".."),
    ).toContainText("Pendiente");
    const history = page
      .getByText("Saldo pendiente al corte", { exact: true })
      .locator("..")
      .locator("dd");
    expect((await history.innerText()).replace(/\D/g, "")).toBe("300000");
    await page.screenshot({
      path: testInfo.outputPath("cierre-operativo-movil.png"),
      fullPage: true,
    });

    await page.goto(salePath);
    await page.getByRole("button", { name: "Registrar cobro" }).click();
    await page.getByLabel("Medio de pago").selectOption("transfer");
    await page.getByLabel("Importe del cobro (CRC)").fill("3000");
    await page.getByRole("button", { name: "Confirmar cobro" }).click();
    await expect(
      page.getByText("Cobro registrado.", { exact: true }),
    ).toBeVisible();

    await page.goto(`${base}/conciliacion`);
    const payment = page
      .getByRole("article")
      .filter({ has: page.locator(`a[href="${salePath}"]`) });
    await payment.getByText("Agregar evidencia").click();
    await payment
      .getByLabel("Referencia documental")
      .fill("FICTICIO-SINPE-MOVIL");
    await payment.getByLabel("Importe documental (CRC)").fill("3000");
    await payment.getByLabel("Estado").selectOption("verified");
    await payment.getByRole("button", { name: "Guardar revisión" }).click();
    await expect(
      payment.locator("header").getByText("Verificado", { exact: true }),
    ).toBeVisible();
    await expect(payment.getByText("FICTICIO-SINPE-MOVIL")).toBeVisible();
    await expect(payment.getByLabel("Estado")).toHaveValue("verified");
    await page.screenshot({
      path: testInfo.outputPath("conciliacion-movil.png"),
      fullPage: true,
    });

    await page.goto(base);
    await page.getByLabel("Desde").fill(historicalDay);
    await page.getByLabel("Hasta").fill(historicalDay);
    await page.getByRole("button", { name: "Aplicar período" }).click();
    await expect(
      page.getByText(`${historicalDay} al ${historicalDay}`),
    ).toBeVisible();
    const balance = page
      .getByRole("heading", { name: "Saldo pendiente al corte" })
      .locator("..")
      .locator("p");
    expect((await balance.innerText()).replace(/\D/g, "")).toBe("300000");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("dashboard-gerencial-movil.png"),
      fullPage: true,
    });
    await page.getByRole("link", { name: "Ver jornada del corte" }).click();
    expect((await history.innerText()).replace(/\D/g, "")).toBe("300000");
  } finally {
    const payments = await root
      .from("payments")
      .select("id")
      .eq("organization_id", org)
      .eq("sale_id", id);
    expect(payments.error).toBeNull();
    const closure = createdDay
      ? await root
          .from("day_closures")
          .select("id")
          .eq("organization_id", org)
          .eq("day", historicalDay)
      : { data: [], error: null };
    expect(closure.error).toBeNull();
    const related = [
      id,
      ...(payments.data ?? []).map(({ id }) => id),
      ...(closure.data ?? []).map(({ id }) => id),
    ];
    const removedAudit = await root
      .from("audit_events")
      .delete()
      .eq("organization_id", org)
      .in("entity_id", related);
    expect(removedAudit.error).toBeNull();
    for (const payment of payments.data ?? []) {
      const removed = await root
        .from("payment_evidence")
        .delete()
        .eq("organization_id", org)
        .eq("payment_id", payment.id);
      expect(removed.error).toBeNull();
    }
    for (const [table, key] of [
      ["collection_requests", "sale_id"],
      ["sale_requests", "sale_id"],
      ["payments", "sale_id"],
      ["sale_lines", "sale_id"],
      ["sales", "id"],
    ]) {
      const removed = await root
        .from(table)
        .delete()
        .eq("organization_id", org)
        .eq(key, id);
      expect(removed.error).toBeNull();
    }
    if (createdDay) {
      const started = await root
        .from("audit_events")
        .delete()
        .eq("organization_id", org)
        .eq("action", "day_review_started")
        .contains("details", { day: historicalDay });
      expect(started.error).toBeNull();
      for (const table of ["day_closures", "operating_days"]) {
        const removed = await root
          .from(table)
          .delete()
          .eq("organization_id", org)
          .eq("day", historicalDay);
        expect(removed.error).toBeNull();
      }
    }
  }
});
