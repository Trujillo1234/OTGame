import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/OTGame/",
  root: fileURLToPath(new URL("./github-pages", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      "next/link": fileURLToPath(
        new URL("./github-pages/next-link.tsx", import.meta.url),
      ),
    },
  },
  build: {
    outDir: fileURLToPath(new URL("./pages-dist", import.meta.url)),
    emptyOutDir: true,
  },
});
