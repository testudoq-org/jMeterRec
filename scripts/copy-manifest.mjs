import { copyFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { cpSync } from "fs"

const DIST_DIR = join(process.cwd(), "dist")
const MANIFEST_SRC = join(process.cwd(), "src/manifest.json")
const MANIFEST_DEST = join(DIST_DIR, "manifest.json")
const ICONS_SRC = join(process.cwd(), "src/icons")
const ICONS_DEST = join(DIST_DIR, "icons")

if (!existsSync(DIST_DIR)) {
  mkdirSync(DIST_DIR, { recursive: true })
}

try {
  copyFileSync(MANIFEST_SRC, MANIFEST_DEST)
  console.log("Manifest copied to dist/")

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