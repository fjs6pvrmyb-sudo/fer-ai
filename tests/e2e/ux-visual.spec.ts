import { expect, test, type Page } from "@playwright/test";

const bakery = "/empresas/10000000-0000-4000-8000-000000000001";
const password = process.env.FERIA_DEMO_PASSWORD;

async function openBakery(page: Page) {
  if (!password)
    throw new Error("Prepará las cuentas ficticias de Playwright.");
  await page.goto("/acceso");
  await page.getByLabel("Correo electrónico").fill("admin@feria.example");
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.getByRole("link", { name: /Panadería Demo/ }).click();
  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
}

function contrast(first: string, second: string) {
  function luminance(color: string) {
    const channels = (color.match(/\d+(?:\.\d+)?/g) ?? []).slice(0, 3);
    const weights = [0.2126, 0.7152, 0.0722];
    return channels.reduce((sum, channel, index) => {
      const value = Number(channel) / 255;
      const linear =
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      return sum + weights[index] * linear;
    }, 0);
  }
  const light = luminance(first);
  const dark = luminance(second);
  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
}

test("el menú comercial lleva el foco a la sección y continúa con Tab", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Saltar al contenido" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#contenido")).toBeFocused();

  const menu = page.getByRole("button", { name: "Menú" });
  await menu.focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("navigation", { name: "Navegación comercial" })
    .getByRole("link", { name: "Preguntas" })
    .focus();
  await page.keyboard.press("Enter");
  const faq = page.locator("#faq");
  await expect(page).toHaveURL(/#faq$/);
  await expect(faq).toBeFocused();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Tab");
  await expect(faq.locator("summary").first()).toBeFocused();
});

test("el menú operativo conserva el foco y deja espacio para cerrar sesión", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 768 });
  await openBakery(page);
  const menu = page.getByRole("button", { name: "Menú" });
  const logout = page.getByRole("button", { name: "Cerrar sesión" });
  const menuRect = (await menu.boundingBox())!;
  const logoutRect = (await logout.boundingBox())!;
  expect(menuRect.height).toBeGreaterThanOrEqual(48);
  expect(logoutRect.height).toBeGreaterThanOrEqual(48);
  expect(menuRect.y + menuRect.height).toBeLessThanOrEqual(logoutRect.y);

  await menu.focus();
  const colors = await menu.evaluate((node) => ({
    outline: getComputedStyle(node).outlineColor,
    background: getComputedStyle(node.closest(".sidebar")!).backgroundColor,
  }));
  expect(contrast(colors.outline, colors.background)).toBeGreaterThanOrEqual(3);
  await page.keyboard.press("Enter");
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  const sales = nav.getByRole("link", { name: "Ventas", exact: true });
  await sales.focus();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await sales.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/ventas$/);
  await expect(page.getByRole("heading", { name: "Ventas" })).toBeVisible();
  await expect(page.locator("#contenido")).toBeFocused();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
});

test("el formulario y el borrador tienen controles táctiles y un borde visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/acceso");
  const email = page.getByLabel("Correo electrónico");
  const styles = await email.evaluate((node) => ({
    height: node.getBoundingClientRect().height,
    border: getComputedStyle(node).borderTopColor,
    background: getComputedStyle(node.closest(".login-layout")!)
      .backgroundColor,
  }));
  expect(styles.height).toBeGreaterThanOrEqual(48);
  expect(contrast(styles.border, styles.background)).toBeGreaterThanOrEqual(3);

  await openBakery(page);
  await page.goto(bakery + "/ventas/nueva");
  const review = page.getByRole("button", { name: "Revisar venta" });
  expect((await review.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await review.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Seleccioná un producto" }),
  ).toBeVisible();

  await page.goto(bakery + "/ventas/conversacional");
  await page
    .getByLabel("Tu mensaje")
    .fill(
      "FER, vendí un pan de masa madre de cinco mil colones. Me pagaron dos mil por SINPE y quedaron tres mil pendientes",
    );
  await page.getByRole("button", { name: "Enviar a FER" }).click();
  const draft = page.getByRole("region", { name: "Borrador de venta" });
  const checkbox = draft.getByRole("checkbox", {
    name: /Usar las cifras del catálogo/,
  });
  const label = draft.locator(".conversation-checkbox");
  await expect(checkbox).toBeVisible();
  expect((await checkbox.boundingBox())!.width).toBeGreaterThanOrEqual(18);
  expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  const back = page.getByRole("button", { name: "Volver al mensaje" });
  expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(48);
});
