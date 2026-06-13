import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { createHash } from "crypto"

const DIST_DIR = join(process.cwd(), "dist")
const MANIFEST_SRC = join(process.cwd(), "src/manifest.json")
const MANIFEST_DEST = join(DIST_DIR, "manifest.json")

if (!existsSync(DIST_DIR)) {
  mkdirSync(DIST_DIR, { recursive: true })
}

try {
  copyFileSync(MANIFEST_SRC, MANIFEST_DEST)
  console.log("Manifest copied to dist/")
} catch (err) {
  console.error("Failed to copy manifest:", err)
  process.exit(1)
}