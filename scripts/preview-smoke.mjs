// Smoke test sin credenciales contra una preview privada o un build local.
// Uso:
//   FERIA_PREVIEW_URL=https://<preview>.vercel.app node --test scripts/preview-smoke.mjs
//     → con Deployment Protection activa, verifica que todo queda bloqueado.
//   FERIA_PREVIEW_URL=http://127.0.0.1:3000 FERIA_PREVIEW_OPEN=1 node --test scripts/preview-smoke.mjs
//     → app accesible (local o con bypass de automatización en
//       FERIA_PREVIEW_BYPASS): verifica cabeceras, rutas, CSRF y acceso sin JS.
import assert from "node:assert/strict";
import { test } from "node:test";

const base = process.env.FERIA_PREVIEW_URL;
assert.ok(base && URL.canParse(base), "Definí FERIA_PREVIEW_URL.");
const origin = new URL(base).origin;
const open = process.env.FERIA_PREVIEW_OPEN === "1";
const bypass = process.env.FERIA_PREVIEW_BYPASS;
const headers = bypass ? { "x-vercel-protection-bypass": bypass } : {};
const get = (path, init = {}) =>
  fetch(origin + path, {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    ...init,
    headers: { ...headers, ...init.headers },
  });

if (!open) {
  test("Deployment Protection bloquea todas las rutas sin sesión de Vercel", async () => {
    for (const path of ["/", "/acceso", "/empresas", "/_next/static/"]) {
      const response = await get(path);
      assert.ok(
        response.status === 401 ||
          (response.status >= 300 &&
            response.status < 400 &&
            /vercel\.com\/(sso|login)/.test(
              response.headers.get("location") ?? "",
            )),
        `${path} respondió ${response.status} sin protección`,
      );
    }
  });
} else {
  test("cabeceras de seguridad en páginas públicas y de acceso", async () => {
    for (const path of ["/", "/acceso"]) {
      const response = await get(path);
      assert.equal(response.status, 200, path);
      const h = response.headers;
      assert.equal(h.get("x-frame-options"), "DENY");
      assert.equal(h.get("x-content-type-options"), "nosniff");
      assert.match(
        h.get("content-security-policy") ?? "",
        /frame-ancestors 'none'/,
      );
      assert.equal(h.get("x-powered-by"), null);
      if (origin.startsWith("https:"))
        assert.match(h.get("strict-transport-security") ?? "", /max-age=\d+/);
    }
    assert.match(
      (await get("/acceso")).headers.get("cache-control") ?? "",
      /no-store/,
    );
  });

  test("rutas protegidas redirigen al acceso sin sesión", async () => {
    for (const path of [
      "/empresas",
      "/empresas/10000000-0000-4000-8000-000000000001/conciliacion",
    ]) {
      const response = await get(path);
      assert.equal(response.status, 307, path);
      assert.match(response.headers.get("location") ?? "", /\/acceso$/);
    }
  });

  test("rechaza escrituras entre sitios", async () => {
    const response = await get("/acceso", {
      method: "POST",
      headers: { "Sec-Fetch-Site": "cross-site" },
    });
    assert.equal(response.status, 403);
  });

  test("el acceso sin JavaScript responde con mensaje neutral y la app sigue sana", async () => {
    const page = await (await get("/acceso")).text();
    const form = new FormData();
    const decode = (v) => v.replaceAll("&quot;", '"').replaceAll("&amp;", "&");
    for (const [, tag] of page.matchAll(/(<input[^>]*type="hidden"[^>]*>)/g)) {
      const name = /name="([^"]*)"/.exec(tag)?.[1];
      if (name)
        form.append(
          decode(name),
          decode(/value="([^"]*)"/.exec(tag)?.[1] ?? ""),
        );
    }
    form.append("email", "nadie@feria.example");
    form.append("password", "contraseña-ficticia");
    const started = Date.now();
    const response = await get("/acceso", {
      method: "POST",
      body: form,
      headers: { Origin: origin },
    });
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.ok(Date.now() - started < 10_000);
    assert.match(
      body,
      /El correo o la contraseña no son válidos|Demasiados intentos|El servicio de acceso no respondió/,
    );
    assert.equal((await get("/")).status, 200);
  });
}
