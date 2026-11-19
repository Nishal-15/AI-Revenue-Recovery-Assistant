import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const moduleSource = (path: string) =>
  fileURLToPath(new URL(`../../packages/revenue-recovery/src/${path}`, import.meta.url));

// Uses the module's source (not dist) so edits hot-reload. The 3D animation has its own path so
// the landing page can load it separately from the rest of the app.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@dental-os/revenue-recovery/animation", replacement: moduleSource("components/three/RecoveryFlow.tsx") },
      { find: "@dental-os/revenue-recovery/tokens.css", replacement: moduleSource("styles/tokens.css") },
      { find: "@dental-os/revenue-recovery", replacement: moduleSource("index.ts") },
    ],
  },
});
