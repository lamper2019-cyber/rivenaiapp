import { defineConfig } from "vitest/config";

// Minimal Vitest setup. Tests live next to the code they cover as `*.test.ts`.
// Run with `npm test` (one-shot) or `npm run test:watch` (during development).
// This is the seed of the suite — grow it by adding more `*.test.ts` files,
// especially around money/health-critical logic (calorie math, calorie
// banking, meal analysis buffers, Stripe status handling).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
