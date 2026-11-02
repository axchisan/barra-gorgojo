// Pruebas de extremo a extremo: la app compilada con el catálogo de ejemplo, servida
// por `wrangler dev` con una base nueva en cada corrida. Ver tests/e2e/.
import { defineConfig, devices } from "@playwright/test";

const PUERTO = 8788;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1, // un solo servidor con estado compartido
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    ...devices["Pixel 5"],
    viewport: { width: 360, height: 740 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm e2e:servidor",
    url: `http://localhost:${PUERTO}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
