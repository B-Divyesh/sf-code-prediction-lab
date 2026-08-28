import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: true
  },
  server: {
    proxy: { "/api": "http://localhost:8080", "/health": "http://localhost:8080" }
  }
});
