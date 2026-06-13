import { defineConfig } from "vite"

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      input: {
        background: "src/background/index.ts",
        content: "src/content/index.ts"
      },
      output: {
        entryFileNames: "[name].js",
        format: "es"
      }
    }
  }
})