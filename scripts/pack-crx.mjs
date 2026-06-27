import { execSync } from "child_process"
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"

const DIST_DIR = join(process.cwd(), "dist")
const CRX_FILE = join(DIST_DIR, "capultura.crx")
const PEM_FILE = join(DIST_DIR, "capultura.pem")
const INSTALL_MANIFEST = join(DIST_DIR, "enterprise-install.json")

const PACKAGE_VERSION = JSON.parse(readFileSync("package.json", "utf-8")).version

if (!existsSync(DIST_DIR)) {
  mkdirSync(DIST_DIR, { recursive: true })
}

// Try to use existing key from project root, or generate new one
const PROJECT_PEM = join(process.cwd(), "extension.pem")
const PROJECT_KEY = readFileSync("src/manifest.json", "utf-8")

// Extract key from manifest if present
const manifestKeyMatch = PROJECT_KEY.match(/"key":\s*"([^"]+)"/)
const MANIFEST_KEY = manifestKeyMatch?.[1]

// Copy key to dist as PEM if it exists in manifest
if (MANIFEST_KEY && !existsSync(PEM_FILE)) {
  // If extension.pem exists in project root, copy it
  if (existsSync(PROJECT_PEM)) {
    const pemContent = readFileSync(PROJECT_PEM)
    writeFileSync(PEM_FILE, pemContent)
  } else {
    // Generate a new key (for development only)
    // In production, the key should be pre-generated and stored
    try {
      execSync(`openssl genrsa -out "${PEM_FILE}" 2048`, { stdio: "inherit" })
    } catch {
      console.error("OpenSSL not available. Please generate extension.pem manually or install OpenSSL.")
      process.exit(1)
    }
  }
}

console.log("Packing CRX (requires Chrome)...")
try {
  execSync(
    `"${process.env.CHROME_BIN ?? "google-chrome"}" --pack-extension="${DIST_DIR}" --pack-extension-key="${PEM_FILE}" --no-message-box`,
    { stdio: "inherit" }
  )
  console.log("CRX packed successfully")
} catch (err) {
  console.error("Chrome packing failed: Chrome is required to create .crx files.", err)
  console.error("Set CHROME_BIN environment variable to point to Chrome/Chromium binary.")
  process.exit(1)
}

const installManifest = {
  name: "capultura",
  version: PACKAGE_VERSION,
  extension_id: process.env.EXTENSION_ID ?? "placeholder",
  update_url: "https://clients2.google.com/service/update2/crx",
  installation_mode: "force_installed",
  install_link: "REPLACE_WITH_YOUR_CRX_HOST_URL/capultura.crx"
}

writeFileSync(
  INSTALL_MANIFEST,
  JSON.stringify(installManifest, null, 2)
)

console.log("Enterprise install manifest generated")
console.log(`CRX: ${CRX_FILE}`)
console.log(`Install manifest: ${INSTALL_MANIFEST}`)