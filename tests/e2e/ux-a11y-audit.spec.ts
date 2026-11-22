import { expect, test, type Page } from "@playwright/test";

// Auditoría sistemática WCAG 2.2 AA del área autenticada, sin dependencias
// externas. Cubre lo verificable automáticamente: nombres accesibles,
// contraste de texto, foco visible con teclado, landmarks, encabezados, IDs
// duplicados, desbordamiento horizontal y tamaño mínimo de objetivos (2.5.8).
// No sustituye la prueba con lector de pantalla.

const password = process.env.FERIA_DEMO_PASSWORD;
if (!password) throw new Error("Prepará las cuentas ficticias de Playwright.");
const bakery = "/empresas/10000000-0000-4000-8000-000000000001";

type Issue = { rule: string; target: string; detail: string };

async function signIn(page: Page, email: string) {
  await page.goto("/acceso");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password!);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(
    page.getByRole("heading", { name: "Elegí una empresa" }),
  ).toBeVisible();
}

async function audit(page: Page): Promise<Issue[]> {
  return page.evaluate(() => {
    const issues: { rule: string; target: string; detail: string }[] = [];
    const canvas = document.createElement("canvas").getContext("2d", {
      willReadFrequently: true,
    })!;
    const rgba = (color: string) => {
      canvas.clearRect(0, 0, 1, 1);
      canvas.fillStyle = "rgba(0,0,0,0)";
      canvas.fillStyle = color;
      canvas.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const blend = (top: number[], bottom: number[]) => {
      const a = top[3];
      return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1);
    };
    const luminance = (c: number[]) =>
      [0.2126, 0.7152, 0.0722].reduce((sum, w, i) => {
        const v = c[i] / 255;
        return (
          sum + w * (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
        );
      }, 0);
    const ratio = (a: number[], b: number[]) => {
      const [x, y] = [luminance(a), luminance(b)];
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const describe = (el: Element) => {
      const id = el.id ? `#${el.id}` : "";
      const cls =
        typeof el.className === "string" && el.className
          ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
          : "";
      const text = (el.textContent ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 40);
      return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` «${text}»` : ""}`;
    };
    const visible = (el: Element) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        rect.width > 0 &&
        rect.height > 0 &&
        !el.closest("[hidden],[aria-hidden='true'],[inert]")
      );
    };
    const background = (el: Element): number[] | null => {
      let color = [0, 0, 0, 0];
      for (let node: Element | null = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.backgroundImage !== "none") return null;
        const layer = rgba(style.backgroundColor);
        if (layer[3] > 0) {
          color = color[3] === 0 ? layer : blend(color, layer);
          if (color[3] >= 1) return color;
        }
      }
      return color[3] === 0
        ? [255, 255, 255, 1]
        : blend(color, [255, 255, 255, 1]);
    };
    const name = (el: Element) => {
      const labelled = el.getAttribute("aria-labelledby");
      if (labelled)
        return labelled
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ")
          .trim();
      const aria = el.getAttribute("aria-label");
      if (aria) return aria.trim();
      if ("labels" in el && (el as HTMLInputElement).labels?.length)
        return [...(el as HTMLInputElement).labels!]
          .map((l) => l.textContent ?? "")
          .join(" ")
          .trim();
      const alt = [...el.querySelectorAll("img[alt],svg[aria-label]")]
        .map((i) => i.getAttribute("alt") ?? i.getAttribute("aria-label"))
        .join(" ");
      return (
        ((el as HTMLElement).innerText ?? el.textContent ?? "").trim() ||
        alt.trim() ||
        el.getAttribute("title") ||
        ""
      );
    };

    // Landmarks y encabezados
    if (document.querySelectorAll("main").length !== 1)
      issues.push({
        rule: "landmark-main",
        target: "main",
        detail: `${document.querySelectorAll("main").length} <main>`,
      });
    const h1 = [...document.querySelectorAll("h1")].filter(visible);
    if (h1.length !== 1)
      issues.push({
        rule: "heading-h1",
        target: "h1",
        detail: `${h1.length} h1 visibles`,
      });
    let previous = 0;
    for (const heading of [
      ...document.querySelectorAll("h1,h2,h3,h4,h5,h6"),
    ].filter(visible)) {
      const level = Number(heading.tagName[1]);
      if (previous && level > previous + 1)
        issues.push({
          rule: "heading-order",
          target: describe(heading),
          detail: `h${previous} → h${level}`,
        });
      previous = level;
    }
    if (!document.documentElement.lang)
      issues.push({ rule: "html-lang", target: "html", detail: "sin lang" });
    if (!document.title.trim())
      issues.push({ rule: "document-title", target: "title", detail: "vacío" });

    // IDs duplicados
    const ids = new Map<string, number>();
    for (const el of document.querySelectorAll("[id]"))
      ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
    for (const [id, count] of ids)
      if (count > 1)
        issues.push({
          rule: "duplicate-id",
          target: `#${id}`,
          detail: `${count} veces`,
        });

    // Nombres accesibles
    for (const el of document.querySelectorAll(
      "a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=link],[role=tab],[role=switch],[role=checkbox],[role=radio],summary",
    )) {
      if (
        !visible(el) &&
        !(
          el instanceof HTMLInputElement &&
          ["radio", "checkbox"].includes(el.type)
        )
      )
        continue;
      if (!name(el))
        issues.push({
          rule: "accessible-name",
          target: describe(el),
          detail: "sin nombre accesible",
        });
    }
    for (const img of document.querySelectorAll("img"))
      if (visible(img) && !img.hasAttribute("alt"))
        issues.push({
          rule: "img-alt",
          target: describe(img),
          detail: "sin alt",
        });

    // Contraste de texto (1.4.3)
    const seen = new Set<Element>();
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || seen.has(el) || !node.textContent?.trim() || !visible(el))
        continue;
      seen.add(el);
      if (
        el.closest("[disabled],[aria-disabled='true']") ||
        el.closest(".sr-only")
      )
        continue;
      const style = getComputedStyle(el);
      const bg = background(el);
      if (!bg) continue;
      const fg = rgba(style.color);
      const color = fg[3] < 1 ? blend(fg, bg) : fg;
      const size = parseFloat(style.fontSize);
      const large =
        size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      const value = ratio(color, bg);
      if (value < (large ? 3 : 4.5))
        issues.push({
          rule: "color-contrast",
          target: describe(el),
          detail: `${value.toFixed(2)}:1 (${style.color} sobre rgb(${bg.slice(0, 3).join(",")}), ${size}px)`,
        });
    }

    // Desbordamiento horizontal (1.4.10)
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    if (overflow > 1) {
      const wide = [...document.body.querySelectorAll("*")]
        .filter(
          (el) =>
            visible(el) &&
            el.getBoundingClientRect().right > window.innerWidth + 1,
        )
        .slice(0, 3)
        .map(describe)
        .join(" | ");
      issues.push({
        rule: "reflow",
        target: "document",
        detail: `+${overflow}px: ${wide}`,
      });
    }

    // Tamaño de objetivos (2.5.8, mínimo 24×24 salvo enlaces en línea)
    for (const el of document.querySelectorAll(
      "button,a[href],input:not([type=hidden]),select,[role=button]",
    )) {
      if (!visible(el)) continue;
      const rect = el.getBoundingClientRect();
      const inline =
        el.tagName === "A" &&
        getComputedStyle(el).display === "inline" &&
        el.closest("p,li,td");
      if (!inline && (rect.width < 24 || rect.height < 24))
        issues.push({
          rule: "target-size",
          target: describe(el),
          detail: `${Math.round(rect.width)}×${Math.round(rect.height)}`,
        });
    }
    return issues;
  });
}

async function focusAudit(page: Page): Promise<Issue[]> {
  const issues: Issue[] = [];
  await page.locator("body").evaluate((body) => (body as HTMLElement).focus());
  const visited = new Set<string>();
  for (let step = 0; step < 60; step++) {
    await page.keyboard.press("Tab");
    const state = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const outline =
        style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
      const ring = style.boxShadow !== "none";
      const key = `${el.tagName}|${el.getAttribute("href") ?? ""}|${el.getAttribute("name") ?? ""}|${(el.textContent ?? "").trim().slice(0, 30)}|${Math.round(rect.top + scrollY)}`;
      return {
        key,
        target: `${el.tagName.toLowerCase()} «${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40)}»`,
        indicator: outline || ring,
        inView:
          rect.bottom > 0 &&
          rect.top < innerHeight &&
          rect.right > 0 &&
          rect.left < innerWidth,
      };
    });
    if (!state) break;
    if (visited.has(state.key)) break;
    visited.add(state.key);
    if (!state.indicator)
      issues.push({
        rule: "focus-visible",
        target: state.target,
        detail: "sin outline ni box-shadow al enfocar con Tab",
      });
    if (!state.inView)
      issues.push({
        rule: "focus-obscured",
        target: state.target,
        detail: "fuera del viewport al enfocar",
      });
  }
  return issues;
}

async function pages(page: Page) {
  const list = [
    "/empresas",
    bakery,
    `${bakery}/ventas`,
    `${bakery}/ventas/nueva`,
    `${bakery}/ventas/conversacional`,
    `${bakery}/catalogo`,
    `${bakery}/jornadas`,
    `${bakery}/conciliacion`,
    `${bakery}/configuracion`,
    `${bakery}/intelligence`,
  ];
  for (const [index, pattern] of [
    [`${bakery}/ventas`, /\/ventas\/[0-9a-f-]{36}$/],
    [`${bakery}/catalogo`, /\/catalogo\/[0-9a-f-]{36}$/],
    [`${bakery}/jornadas`, /\/jornadas\/\d{4}-\d{2}-\d{2}$/],
  ] as const) {
    await page.goto(index);
    const href = await page
      .locator("a[href]")
      .evaluateAll(
        (links, source) =>
          links
            .map((link) => link.getAttribute("href") ?? "")
            .find((href) => new RegExp(source).test(href)) ?? null,
        pattern.source,
      );
    if (href) list.push(href);
  }
  return list;
}

for (const viewport of [
  { label: "escritorio", width: 1280, height: 800 },
  { label: "movil", width: 390, height: 844 },
]) {
  test(`auditoría WCAG del área autenticada en ${viewport.label}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    await signIn(page, "admin@feria.example");
    const report: Record<string, Issue[]> = {};
    for (const path of await pages(page)) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const issues = [...(await audit(page)), ...(await focusAudit(page))];
      if (issues.length)
        report[path.replace(bakery, "/empresas/:panaderia")] = issues;
    }
    const total = Object.values(report).flat().length;
    await testInfo.attach(`a11y-${viewport.label}.json`, {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });
    for (const [path, issues] of Object.entries(report))
      for (const issue of issues)
        console.log(
          `A11Y ${viewport.label} ${path} · ${issue.rule} · ${issue.target} · ${issue.detail}`,
        );
    console.log(`A11Y ${viewport.label} total=${total}`);
    expect(total, "hallazgos de accesibilidad").toBe(0);
  });
}
