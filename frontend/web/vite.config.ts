import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        driver: fileURLToPath(new URL("./driver.html", import.meta.url)),
        main: fileURLToPath(new URL("./index.html", import.meta.url))
      }
    }
  },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        changeOrigin: true,
        target: "http://localhost:3000"
      }
    }
  }
});
