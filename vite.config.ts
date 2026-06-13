import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        background: 'src/background/index.ts',
        content: 'src/content/index.ts',
        popup: 'src/popup/popup.html',
        options: 'src/options/options.html',
      },
      output: {
        entryFileNames: '[name]/[name].js',
        format: 'es',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
})
