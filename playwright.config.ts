import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = "http://127.0.0.1:3000";
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: url,
    launchOptions: { executablePath: process.env.FERIA_CHROMIUM_PATH },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1",
    url: `${url}/acceso`,
    timeout: 30_000,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      FER_INTELLIGENCE_MODE:
        process.env.FERIA_TEST_INTELLIGENCE_MODE === "disabled"
          ? "disabled"
          : "demo",
    },
  },
});
