import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "toy",
  base: "./",
  plugins: [react()],
  define: {
    __TOY_API_BASE_URL__: JSON.stringify(process.env.VITE_API_BASE_URL || ""),
    __TOY_AI_BASE_URL__: JSON.stringify(process.env.VITE_AI_BASE_URL || process.env.VITE_API_BASE_URL || ""),
  },
  build: {
    outDir: "../toy-dist",
    emptyOutDir: true,
  },
});
