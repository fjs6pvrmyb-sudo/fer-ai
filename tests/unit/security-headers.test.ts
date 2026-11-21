import { describe, expect, it } from "vitest";
import config from "../../next.config";

describe("OWASP baseline: encabezados HTTP", () => {
  it("declara controles de navegador para todas las rutas", async () => {
    const rules = await config.headers?.();
    expect(rules).toBeDefined();
    const allRoutes = rules?.find((rule) => rule.source === "/:path*");
    expect(allRoutes).toBeDefined();
    const headers = new Map(
      (allRoutes?.headers ?? []).map(({ key, value }) => [
        key.toLowerCase(),
        value,
      ]),
    );
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("permissions-policy")).toContain("camera=()");
    expect(headers.get("permissions-policy")).toContain("microphone=()");
    expect(headers.get("permissions-policy")).toContain("geolocation=()");
    expect(headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers.get("content-security-policy")).not.toContain("script-src");
    expect(headers.get("content-security-policy-report-only")).toContain(
      "script-src 'self'",
    );
    expect(config.poweredByHeader).toBe(false);
  });
});
