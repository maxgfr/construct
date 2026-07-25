import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Runs write SRD trees and clone OSS repos into /tmp and .construct working
    // dirs — never collect tests from those trees or from the fixtures.
    exclude: [...configDefaults.exclude, "**/.construct/**", "tests/fixtures/**"],
    // Isolates the on-disk HTTP cache per run — without it the suite reads and
    // writes the developer's real ~/.cache/construct.
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text", "lcov"],
    },
  },
});
