import { type Plugin, defineConfig } from "vite";
import { crx, CrxPlugin } from "@crxjs/vite-plugin";
import manifest from "./src/manifest.json";

const relocateHtmlAssets: CrxPlugin = {
  name: "crx:relocate-html",
  enforce: "post",
  generateBundle(_options, bundle) {
    if (bundle["src/popup/popup.html"]) {
      bundle["src/popup/popup.html"].fileName = "popup/popup.html";
    }
    if (bundle["src/options/options.html"]) {
      bundle["src/options/options.html"].fileName = "options/options.html";
    }
  },
  renderCrxManifest(manifest) {
    manifest.action = { ...manifest.action, default_popup: "popup/popup.html" };
    manifest.options_ui = { ...manifest.options_ui, page: "options/options.html" };
    return manifest;
  },
};

export default defineConfig(({ mode }) => ({
  plugins: [
    crx({ manifest, browser: "chrome" }),
    relocateHtmlAssets,
  ],
  build: {
    sourcemap: mode === "development",
    rollupOptions: {
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name]/[name][extname]",
      },
    },
  },
}));
