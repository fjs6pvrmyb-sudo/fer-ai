import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import Loading from "@/app/(secure)/loading";

it("preserva el contenido principal y anuncia la carga desde un estado separado", () => {
  const markup = renderToStaticMarkup(createElement(Loading));

  expect(markup).toMatch(/^<main id="contenido"(?![^>]*\brole=)[^>]*>/);
  expect(markup).toContain('<h1 class="sr-only">Espacio de trabajo</h1>');
  expect(markup).toContain('<p role="status">Cargando tu espacio de trabajo…</p>');
});
