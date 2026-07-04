import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.js"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.js"],
      exclude: ["src/**/*.test.js", "src/bootstrap.js"],
    },
  },
  define: {
    __ZEUS_API_URL__: JSON.stringify(""),
    __ZEUS_AUTH_TOKEN__: JSON.stringify(""),
  },
});