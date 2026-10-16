import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Tauri espera un puerto fijo en desarrollo
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "es2021",
    rollupOptions: {
      input: {
        avatar: resolve(__dirname, "avatar.html"),
        bubble: resolve(__dirname, "bubble.html"),
        panel: resolve(__dirname, "panel.html"),
      },
    },
  },
});
