import { expect, it, vi } from "vitest";
import { signIn } from "../../src/modules/auth/actions";

const { authenticate } = vi.hoisted(() => ({ authenticate: vi.fn() }));
vi.mock("../../src/modules/auth/config", () => ({
  supabaseConfig: () => ({ url: "http://127.0.0.1", key: "fixture" }),
}));
vi.mock("../../src/modules/auth/session", () => ({
  database: async () => ({ auth: { signInWithPassword: authenticate } }),
}));

it("comunica el límite del proveedor sin exponer su error interno", async () => {
  authenticate.mockResolvedValueOnce({
    error: { status: 429, message: "detalle interno del proveedor" },
  });
  const form = new FormData();
  form.set("email", "demostracion@feria.example");
  form.set("password", "contraseña-ficticia");
  expect(await signIn("", form)).toBe(
    "Demasiados intentos de acceso. Esperá antes de intentar de nuevo.",
  );
  expect(authenticate).toHaveBeenCalledTimes(1);
});
