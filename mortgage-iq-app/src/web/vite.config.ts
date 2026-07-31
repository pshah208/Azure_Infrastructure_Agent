import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The orchestrator base URL is injected at build/runtime via VITE_API_BASE.
// In local dev we proxy /api to the FastAPI orchestrator on :8000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
