// Regresión: un envío del formulario de acceso sin JavaScript (antes de la
// hidratación o con JS deshabilitado) debe responder rápido y no bloquear el
// servidor. Con signIn.bind() en el componente cliente, el SSR de
// useActionState entraba en un bucle al 100 % de CPU.
// Uso: con la app corriendo, FERIA_APP_URL=http://127.0.0.1:3000 node --test scripts/test-login-no-js.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

const base = process.env.FERIA_APP_URL ?? "http://127.0.0.1:3000";
const decode = (value) =>
  value
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&#x27;", "'");

async function submit(path, email, password) {
  const page = await (
    await fetch(base + path, { signal: AbortSignal.timeout(10_000) })
  ).text();
  const form = new FormData();
  for (const [, tag] of page.matchAll(/(<input[^>]*type="hidden"[^>]*>)/g)) {
    const name = /name="([^"]*)"/.exec(tag)?.[1];
    if (name)
      form.append(decode(name), decode(/value="([^"]*)"/.exec(tag)?.[1] ?? ""));
  }
  form.append("email", email);
  form.append("password", password);
  const started = Date.now();
  const response = await fetch(base + "/acceso", {
    method: "POST",
    body: form,
    headers: { Origin: base },
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  return {
    response,
    body: await response.text(),
    elapsed: Date.now() - started,
  };
}

for (const path of ["/acceso", "/acceso?destino=venta"]) {
  test(`el acceso sin JavaScript responde y conserva el servidor (${path})`, async () => {
    const { response, body, elapsed } = await submit(
      path,
      "nadie@feria.example",
      "contraseña-ficticia",
    );
    assert.equal(response.status, 200);
    assert.ok(elapsed < 8_000, `respuesta en ${elapsed} ms`);
    assert.match(
      body,
      /El correo o la contraseña no son válidos|El servicio de acceso (no respondió|todavía no está configurado)|Demasiados intentos/,
    );
    const health = await fetch(base + "/", {
      signal: AbortSignal.timeout(3_000),
    });
    assert.equal(health.status, 200, "el servidor debe seguir atendiendo");
  });
}
