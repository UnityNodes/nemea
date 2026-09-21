import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/api/test/**/*.test.ts", "apps/bot/test/**/*.test.ts", "apps/web/test/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
    testTimeout: 20000,
  },
});
