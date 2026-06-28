import { execSync } from "child_process"
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, unlinkSync, renameSync } from "fs"
import { join } from "path"

const DIST_DIR = join(process.cwd(), "dist")
const CRX_FILE = join(DIST_DIR, "capultura.crx")
const CHROME_CRX = join(process.cwd(), "dist.crx")
const CHROME_PEM = join(process.cwd(), "dist.pem")
const INSTALL_MANIFEST = join(DIST_DIR, "enterprise-install.json")
const PROJECT_PEM = join(process.cwd(), "extension.pem")
const TEMP_PEM = join(process.cwd(), ".tmp-capultura.pem")

const PACKAGE_VERSION = JSON.parse(readFileSync("package.json", "utf-8")).version

if (!existsSync(DIST_DIR)) {
  mkdirSync(DIST_DIR, { recursive: true })
}

if (!existsSync(PROJECT_PEM)) {
  console.error(
    `Missing signing key: ${PROJECT_PEM}\n` +
    "Generate one with: openssl genrsa -out extension.pem 2048\n" +
    "Never commit extension.pem. It must remain at the project root."
  )
  process.exit(1)
}

copyFileSync(PROJECT_PEM, TEMP_PEM)

let chromeSucceeded = false
try {
  execSync(
    `"${process.env.CHROME_BIN ?? "google-chrome"}" --pack-extension="${DIST_DIR}" --pack-extension-key="${TEMP_PEM}" --no-message-box`,
    { stdio: "inherit" }
  )
  chromeSucceeded = true
  console.log("CRX packed successfully")
} catch (err) {
  console.error("Chrome packing failed: Chrome is required to create .crx files.", err)
  console.error("Set CHROME_BIN environment variable to point to Chrome/Chromium binary.")
} finally {
// Always remove private key from temp location so it is never packaged or uploaded
if (existsSync(TEMP_PEM)) {
  unlinkSync(TEMP_PEM)
  console.log(`Removed private key from temp: ${TEMP_PEM}`)
}

// Move Chrome's output CRX into dist/ with our expected name
if (existsSync(CHROME_CRX)) {
  if (existsSync(CRX_FILE)) unlinkSync(CRX_FILE)
  renameSync(CHROME_CRX, CRX_FILE)
  console.log(`Moved signed CRX to: ${CRX_FILE}`)
}

// Clean up any key file Chrome wrote next to the crx
for (const keyFile of [CHROME_PEM, join(DIST_DIR, "capultura.pem")]) {
  if (existsSync(keyFile)) {
    unlinkSync(keyFile)
    console.log(`Removed key artifact: ${keyFile}`)
  }
}
}

if (!chromeSucceeded) {
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
