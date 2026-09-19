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
    // PROTOTYPE (area 5): the toolbar icon opens the popup as a separate
    // window instead of the constrained 800x600 action popup. That requires
    // `action.default_popup` to be absent from the *shipped* manifest —
    // Chrome fires `action.onClicked` only when the action has no popup of
    // its own. `default_popup` is kept on the manifest object passed to
    // `crx()` (above) so the plugin still emits `popup/popup.html` into
    // `dist/`; it is stripped here, from the output manifest only. Back out
    // by restoring this line and deleting the onClicked listener.
    manifest.action = { ...manifest.action, default_popup: "popup/popup.html" }
    delete manifest.action?.default_popup
    manifest.options_ui = { ...manifest.options_ui, page: 'options/options.html' }
    return manifest
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
      input: {
        // Explicit entry map so Rollup emits the background service worker
        // and the content script as separate chunks. The @crxjs/vite-plugin
        // derives each chunk's Rollup entry name from basename(file), so both
        // entries must have distinct basenames -- otherwise they collide
        // (index.ts.js / index2.ts.js), the plugin's loader stub ends up
        // importing the content-script chunk, and the service worker runs
        // the content-script code instead of the background entry.
        "service-worker": "src/background/service-worker.ts",
        "content-script": "src/content/index.ts",
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name]/[name][extname]",
      },
    },
  },
}));
