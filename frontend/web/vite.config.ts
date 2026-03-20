import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxyTarget = "http://localhost:3000";

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
  preview: {
    host: "0.0.0.0",
    port: 4173,
    proxy: {
      "/api": {
        changeOrigin: true,
        target: apiProxyTarget
      }
    }
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        changeOrigin: true,
        target: apiProxyTarget
      }
    }
  }
});
