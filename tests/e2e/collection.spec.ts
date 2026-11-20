import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test("registra un cobro posterior completo desde móvil y actualiza el historial", async ({
  page,
}, testInfo) => {
  const password = process.env.FERIA_DEMO_PASSWORD;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (
    !password ||
    !url ||
    !key ||
    !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)
  )
    throw new Error(
      "Se requiere una instancia Supabase local con cuentas ficticias",
    );

  const org = "10000000-0000-4000-8000-000000000001";
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword({
    email: "admin@feria.example",
    password,
  });
  expect(signedIn.error).toBeNull();
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

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/acceso");
  await page.getByLabel("Correo electrónico").fill("admin@feria.example");
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(
    page.getByRole("heading", { name: "Elegí una empresa" }),
  ).toBeVisible();

  const path = `/empresas/${org}/ventas/${sale.data}`;
  await page.goto(path);
  const initial = page.locator(".balance-line dd");
  expect((await initial.innerText()).replace(/\D/g, "")).toBe("300000");
  await page.getByRole("button", { name: "Registrar cobro" }).click();
  await expect(page.getByText("Jornada de cobro:")).toBeVisible();
  await page.getByLabel("Medio de pago").selectOption("transfer");
  await page.getByLabel("Importe del cobro (CRC)").fill("3001");
  await page.getByRole("button", { name: "Confirmar cobro" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Saldo insuficiente" }),
  ).toBeVisible();
  await page.getByLabel("Importe del cobro (CRC)").fill("3000");
  await page.getByRole("button", { name: "Confirmar cobro" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Cobro registrado." }),
  ).toBeVisible();
  await expect(page.getByText("La venta ya está pagada.")).toBeVisible();
  await expect(
    page.getByText("Transferencia / SINPE", { exact: false }),
  ).toHaveCount(2);
  expect((await initial.innerText()).replace(/\D/g, "")).toBe("000");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("cobro-posterior-movil.png"),
    fullPage: true,
  });

  await page.getByRole("link", { name: "Historial de ventas" }).click();
  await expect(
    page.getByRole("link", { name: new RegExp(sale.data.slice(0, 8)) }),
  ).toContainText("Pagada");
});
