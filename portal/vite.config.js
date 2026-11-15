import { defineConfig } from "vite";

// Rutas relativas: el sitio funciona en cualquier subcarpeta de GitHub Pages
export default defineConfig({
  base: "./",
  build: { target: "es2022", chunkSizeWarningLimit: 2500 },
});
