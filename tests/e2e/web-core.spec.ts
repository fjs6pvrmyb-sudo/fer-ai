import { expect, test, type Page } from "@playwright/test";

const bakery = "10000000-0000-4000-8000-000000000001";
const coffee = "10000000-0000-4000-8000-000000000002";
const bread = "20000000-0000-4000-8000-000000000001";
const workspace = `/empresas/${bakery}`;
const password = process.env.FERIA_DEMO_PASSWORD;
if (!password) throw new Error("Prepará las cuentas de prueba.");
const demoPassword = password;

async function credentials(page: Page, email: string) {
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(demoPassword);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
}

async function noHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
}

test("la landing es pública y la demostración y la lista cerrada carecen de escrituras", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const writes: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method()))
      writes.push(request.url());
  });

  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Tu negocio, más inteligente.",
  );
  await expect(
    page.getByRole("navigation", { name: "Navegación comercial" }),
  ).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({
    path: info.outputPath("fer-landing-escritorio.png"),
    animations: "disabled",
  });

  await page.getByRole("link", { name: "Ver demostración" }).click();
  await expect(page).toHaveURL(/#demostracion$/);
  await expect(
    page.getByText("Demostración ficticia sin persistencia."),
  ).toBeVisible();
  await page.getByText("Ver desglose del ejemplo").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#demostracion details[open]")).toBeVisible();

  const waitlist = page.locator("#espera");
  await expect(
    waitlist.getByText(/La lista de espera aún está cerrada/),
  ).toBeVisible();
  await expect(
    waitlist.getByRole("link", { name: "Ingresar con mi cuenta" }),
  ).toHaveAttribute("href", "/acceso");
  await expect(page.locator("form, input")).toHaveCount(0);
  await expect(
    page.getByText(/Registro recibido|SINPE validado|Venta registrada/i),
  ).toHaveCount(0);
  expect(writes).toEqual([]);

  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await noHorizontalOverflow(page);
  const menu = page.getByRole("button", { name: "Menú" });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page
    .getByRole("navigation", { name: "Navegación comercial" })
    .getByRole("link", { name: "Preguntas" })
    .focus();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: info.outputPath("fer-landing-movil.png"),
    animations: "disabled",
  });
});

test("el acceso comercial abre la empresa real y el operador registra un pago dividido que persiste", async ({
  browser,
  page,
  baseURL,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("link", { name: "Entrar a mi empresa" }).click();
  await expect(page).toHaveURL(/\/acceso$/);

  // El destino comercial es cerrado, incluso si alguien manipula la URL de acceso.
  await page.goto("/acceso?destino=https%3A%2F%2Fexterno.example");
  await credentials(page, "admin@feria.example");
  await expect(page).toHaveURL(/\/empresas$/);
  await page.getByRole("link", { name: /Cafetería Demo/ }).click();
  await expect(page.getByText("Gerente", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Dashboard gerencial" }),
  ).toBeVisible();
  await expect(page.getByText("Café filtrado", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Pan de masa madre", { exact: true }),
  ).toHaveCount(0);
  await page.goto(`${workspace}/configuracion`);
  await expect(page.getByRole("heading", { name: "Membresías" })).toBeVisible();
  await page.goto(workspace);
  const amount = (label: string) =>
    page
      .getByRole("heading", { name: label, exact: true })
      .locator("..")
      .locator("p");
  const digits = (value: string) => BigInt(value.replace(/\D/g, ""));
  await expect(
    page
      .getByRole("heading", { name: "Ventas del período", exact: true })
      .or(
        page.getByRole("heading", {
          name: "Todavía no hay ventas",
          exact: true,
        }),
      ),
  ).toBeVisible();
  const prior = (await amount("Ventas del período").count())
    ? digits(await amount("Ventas del período").innerText())
    : 0n;
  const priorCollected = (await amount("Cobros registrados").count())
    ? digits(await amount("Cobros registrados").innerText())
    : 0n;

  const operatorContext = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
  });
  try {
    const operator = await operatorContext.newPage();
    await operator.goto("/");
    await operator
      .getByRole("link", { name: "Acceso para colaboradores" })
      .click();
    await expect(operator).toHaveURL(/\/acceso\?destino=venta$/);
    await credentials(operator, "operador@feria.example");
    await expect(operator).toHaveURL(/\/empresas\?destino=venta$/);
    await expect(
      operator.getByRole("link", { name: /Cafetería Demo/ }),
    ).toHaveCount(0);
    await operator.getByRole("link", { name: /Panadería Demo/ }).click();
    await expect(operator).toHaveURL(new RegExp(`${workspace}/ventas/nueva$`));
    await operator.getByRole("button", { name: "Revisar venta" }).click();
    await expect(
      operator.getByRole("alert").filter({ hasText: "Seleccioná un producto" }),
    ).toBeVisible();
    await operator.getByLabel("Producto 1").selectOption(bread);
    await operator.getByRole("button", { name: "Agregar pago" }).click();
    await operator.getByLabel("Medio de pago 1").selectOption("cash");
    await operator.getByLabel("Importe del pago 1").fill("1000");
    await operator.getByRole("button", { name: "Agregar pago" }).click();
    await operator.getByLabel("Medio de pago 2").selectOption("transfer");
    await operator.getByLabel("Importe del pago 2").fill("2000");
    await operator.getByRole("button", { name: "Revisar venta" }).click();
    await expect(
      operator.getByRole("heading", { name: "Revisión final" }),
    ).toBeVisible();
    await expect(
      operator.getByRole("heading", { name: "Venta registrada" }),
    ).toHaveCount(0);
    await operator.getByRole("button", { name: "Confirmar venta" }).click();
    await expect(
      operator.getByRole("heading", { name: "Venta registrada" }),
    ).toBeVisible();
    const receipt = operator.url();
    const id = await operator.locator(".record-id code").innerText();
    await operator.reload();
    await expect(operator.locator(".record-id code")).toHaveText(id);
    await expect(
      operator.getByText("Pago parcial", { exact: true }),
    ).toBeVisible();
    expect(digits(await operator.locator(".balance-line dd").innerText())).toBe(
      200_000n,
    );
    await noHorizontalOverflow(operator);
    await operator.screenshot({
      path: info.outputPath("fer-venta-movil.png"),
      animations: "disabled",
    });

    await operator.goto("/colaborador");
    await expect(operator).toHaveURL(/\/empresas\?destino=venta$/);
    await operator.goto(`${workspace}/intelligence`);
    await expect(
      operator.getByRole("heading", { name: "Página no disponible" }),
    ).toBeVisible();
    await operator.goto(receipt.replace(bakery, coffee));
    await expect(
      operator.getByRole("heading", { name: "Página no disponible" }),
    ).toBeVisible();

    await page.reload();
    expect(digits(await amount("Ventas del período").innerText())).toBe(
      prior + 500_000n,
    );
    expect(digits(await amount("Cobros registrados").innerText())).toBe(
      priorCollected + 300_000n,
    );
    await page.screenshot({
      path: info.outputPath("fer-dashboard-escritorio.png"),
      animations: "disabled",
    });
  } finally {
    await operatorContext.close();
  }
});
