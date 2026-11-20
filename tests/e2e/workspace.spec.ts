import { expect, test } from "@playwright/test";

const bakery = "10000000-0000-4000-8000-000000000001";
const coffee = "10000000-0000-4000-8000-000000000002";
const password = process.env.FERIA_DEMO_PASSWORD;
if (!password)
  throw new Error("Prepará las cuentas locales antes de ejecutar Playwright.");

test("protege el espacio de trabajo y valida credenciales", async ({
  page,
}) => {
  await page.goto(`/empresas/${bakery}/catalogo`);
  await expect(page).toHaveURL(/\/acceso$/);
  await page.getByLabel("Correo electrónico").fill("operador@feria.example");
  await page.getByLabel("Contraseña").fill("error-intencional");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "El correo o la contraseña" }),
  ).toHaveText("El correo o la contraseña no son válidos.");
  await expect(page).toHaveURL(/\/acceso$/);
});

for (const viewport of [
  { label: "movil", size: { width: 390, height: 844 } },
  { label: "escritorio", size: { width: 1440, height: 900 } },
]) {
  test(`registra una venta parcial desde ${viewport.label} y la recupera del historial`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport.size);
    await page.goto("/acceso");
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Saltar al contenido" }),
    ).toBeFocused();
    await page.getByLabel("Correo electrónico").fill("admin@feria.example");
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(
      page.getByRole("heading", { name: "Elegí una empresa" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Cafetería Demo/ }),
    ).toBeVisible();
    await page.getByRole("link", { name: /Panadería Demo/ }).click();
    await page.getByRole("link", { name: "Ver catálogo" }).click();
    await expect(
      page.getByText("Pan de masa madre", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Café filtrado", { exact: true })).toHaveCount(
      0,
    );

    if (viewport.label === "movil")
      await page.getByRole("button", { name: "Menú" }).click();
    await page.getByRole("link", { name: "Ventas", exact: true }).click();
    await page.getByRole("link", { name: "Registrar venta" }).click();
    await page.getByRole("button", { name: "Revisar venta" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Seleccioná un producto" }),
    ).toBeVisible();
    await page
      .getByLabel("Producto 1")
      .selectOption("20000000-0000-4000-8000-000000000001");
    await page.getByRole("button", { name: "Agregar pago" }).click();
    await page.getByLabel("Importe del pago 1").fill("2000");
    await page.getByRole("button", { name: "Revisar venta" }).click();
    await expect(
      page.getByRole("heading", { name: "Revisión final" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirmar venta" }).click();
    await expect(
      page.getByRole("heading", { name: "Venta registrada" }),
    ).toBeVisible();
    await expect(page.getByText("Pago parcial", { exact: true })).toBeVisible();
    const id = (await page.locator(".record-id code").innerText()).trim();
    await page.screenshot({
      path: testInfo.outputPath(`venta-parcial-${viewport.label}.png`),
      fullPage: true,
    });
    const balance = await page.locator(".balance-line dd").innerText();
    expect(balance.replace(/\D/g, "")).toBe("300000");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("link", { name: "Historial de ventas" }).click();
    await expect(
      page.getByRole("link", { name: new RegExp(id.slice(0, 8)) }),
    ).toHaveCount(1);
    await page.getByRole("link", { name: new RegExp(id.slice(0, 8)) }).click();
    await expect(page.locator(".record-id code")).toHaveText(id);

    await page.getByRole("link", { name: /Cambiar empresa/ }).click();
    await page.getByRole("link", { name: /Cafetería Demo/ }).click();
    await expect(
      page.getByText("Café filtrado", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Todavía no hay ventas" }),
    ).toBeVisible();
    await page.goto(`/empresas/${coffee}/ventas/${id}`);
    await expect(
      page.getByRole("heading", { name: "Página no disponible" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Ir a mis empresas" }).click();
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/acceso$/);
  });
}

test("un operador ve solo su empresa y carece de controles administrativos", async ({
  page,
}) => {
  await page.goto("/acceso");
  await page.getByLabel("Correo electrónico").fill("operador@feria.example");
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(
    page.getByRole("link", { name: /Panadería Demo/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Cafetería Demo/ })).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: /Panadería Demo/ }).click();
  await page.getByRole("link", { name: "Configuración", exact: true }).click();
  await expect(page.getByText("Moneda operativa")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Membresías" })).toHaveCount(
    0,
  );
  await page.goto(`/empresas/${coffee}/catalogo`);
  await expect(
    page.getByRole("heading", { name: "Página no disponible" }),
  ).toBeVisible();
});
