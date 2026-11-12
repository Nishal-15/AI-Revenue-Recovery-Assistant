import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Points at the module's source (not dist) so edits hot-reload.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@dental-os/revenue-recovery": fileURLToPath(
        new URL("../../packages/revenue-recovery/src/index.ts", import.meta.url),
      ),
    },
  },
});
