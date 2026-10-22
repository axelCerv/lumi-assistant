import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 20_000,
    // Las pruebas usan fechas y horas de México: el resultado no depende de dónde corran
    // (los servidores de GitHub están en UTC)
    env: { TZ: "America/Mexico_City" },
  },
});
