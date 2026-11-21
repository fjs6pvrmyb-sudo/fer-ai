import { expect, test } from "@playwright/test";

const password = process.env.FERIA_DEMO_PASSWORD;
if (!password) throw new Error("Prepará las cuentas de prueba.");
const bakery = "/empresas/10000000-0000-4000-8000-000000000001";

test("comprueba cabeceras reales y conserva la hidratación con CSP en observación", async ({
  page,
  request,
}) => {
  for (const path of ["/", "/acceso", bakery]) {
    const result = await request.get(path, { maxRedirects: 0 });
    const headers = result.headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers["content-security-policy-report-only"]).toContain(
      "script-src 'self'",
    );
    expect(headers["x-powered-by"]).toBeUndefined();
    if (path !== "/") expect(headers["cache-control"]).toMatch(/no-store/i);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const reports: string[] = [];
  page.on("console", (message) => {
    if (/report.only/i.test(message.text())) reports.push(message.text());
  });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Menú" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("navigation", { name: "Navegación comercial" }),
  ).toBeVisible();
  await expect
    .poll(() => reports.some((report) => /script-src/i.test(report)))
    .toBe(true);
});

test("rechaza un envío cross-site y conserva una sesión del mismo sitio con cookies protegidas", async ({
  page,
  request,
}) => {
  const refused = await request.post("/acceso", {
    headers: { "sec-fetch-site": "cross-site" },
    form: { email: "admin@feria.example", password },
  });
  expect(refused.status()).toBe(403);
  expect(refused.headers()["set-cookie"]).toBeUndefined();

  await page.goto("/acceso");
  await page.getByLabel("Correo electrónico").fill("admin@feria.example");
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/empresas$/);
  const cookies = (await page.context().cookies()).filter(({ name }) =>
    /^sb-.*-auth-token/.test(name),
  );
  expect(cookies.length).toBeGreaterThan(0);
  for (const cookie of cookies)
    expect(cookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    });

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/acceso$/);
  await page.goto(bakery);
  await expect(page).toHaveURL(/\/acceso$/);
});
