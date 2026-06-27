import { copyFileSync, existsSync, mkdirSync, cpSync, readdirSync, rmdirSync, unlinkSync } from "fs"
import { join, dirname } from "path"

const DIST_DIR = join(process.cwd(), "dist")
const MANIFEST_SRC = join(process.cwd(), "src/manifest.json")
const MANIFEST_DEST = join(DIST_DIR, "manifest.json")
const ICONS_SRC = join(process.cwd(), "src/icons")
const ICONS_DEST = join(DIST_DIR, "icons")
const VITE_POPUP_HTML = join(DIST_DIR, "src/popup/popup.html")
const VITE_OPTIONS_HTML = join(DIST_DIR, "src/options/options.html")
const POPUP_HTML_DEST = join(DIST_DIR, "popup/popup.html")
const OPTIONS_HTML_DEST = join(DIST_DIR, "options/options.html")

if (!existsSync(DIST_DIR)) {
  mkdirSync(DIST_DIR, { recursive: true })
}

function removeDirRecursive(dir) {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      removeDirRecursive(fullPath)
      rmdirSync(fullPath)
    } else {
      unlinkSync(fullPath)
    }
  }
}

try {
  copyFileSync(MANIFEST_SRC, MANIFEST_DEST)
  console.log("Manifest copied to dist/")

  // Move Vite-generated HTML from dist/src/ to correct locations
  // Vite puts HTML in dist/src/ due to build structure, move to expected paths
  if (existsSync(VITE_POPUP_HTML)) {
    const destDir = dirname(POPUP_HTML_DEST)
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true })
    }
    copyFileSync(VITE_POPUP_HTML, POPUP_HTML_DEST)
    console.log(`Popup HTML moved: ${POPUP_HTML_DEST}`)
  }

  if (existsSync(VITE_OPTIONS_HTML)) {
    const destDir = dirname(OPTIONS_HTML_DEST)
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true })
    }
    copyFileSync(VITE_OPTIONS_HTML, OPTIONS_HTML_DEST)
    console.log(`Options HTML moved: ${OPTIONS_HTML_DEST}`)
  }

  // Clean up dist/src directory structure
  const DIST_SRC = join(DIST_DIR, "src")
  removeDirRecursive(DIST_SRC)
  console.log("Cleaned up dist/src directory")

  if (existsSync(ICONS_SRC)) {
    if (!existsSync(ICONS_DEST)) {
      mkdirSync(ICONS_DEST, { recursive: true })
    }
    cpSync(ICONS_SRC, ICONS_DEST, { recursive: true })
    console.log("Icons copied to dist/icons/")
  }
} catch (err) {
  console.error("Failed to copy assets:", err)
  process.exit(1)
}