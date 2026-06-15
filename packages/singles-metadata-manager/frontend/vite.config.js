import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "fs";
import { resolve } from "path";

// Single source of truth: read backend port from backend/.env
// If PORT ever changes there, the proxy updates automatically.
function readBackendPort(fallback) {
  try {
    const env = readFileSync(resolve(__dirname, "../backend/.env"), "utf-8");
    const match = env.match(/^PORT=(\d+)/m);
    return match ? match[1] : fallback;
  } catch {
    return fallback;
  }
}
const BACKEND_PORT = readBackendPort("3002");

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api":    { target: `http://localhost:${BACKEND_PORT}`, changeOrigin: true },
      "/health": { target: `http://localhost:${BACKEND_PORT}`, changeOrigin: true },
    },
  },
});
