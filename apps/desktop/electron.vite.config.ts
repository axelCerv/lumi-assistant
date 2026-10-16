import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

// Paquetes que se empaquetan dentro del código (ESM puro o del propio monorepo)
const bundled = ["@lumi/shared", "ical.js", "chokidar"];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: bundled })],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, "src/main/index.ts") } },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: bundled })],
  },
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          avatar: resolve(__dirname, "src/renderer/avatar.html"),
          bubble: resolve(__dirname, "src/renderer/bubble.html"),
          panel: resolve(__dirname, "src/renderer/panel.html"),
          brain: resolve(__dirname, "src/renderer/brain.html"),
        },
      },
    },
  },
});
