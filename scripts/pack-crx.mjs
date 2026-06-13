import { execSync } from "child_process"
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { createHash } from "crypto"

const DIST_DIR = join(process.cwd(), "dist")
const CRX_FILE = join(DIST_DIR, "bm-jmx-recorder.crx")
const PEM_FILE = join(DIST_DIR, "bm-jmx-recorder.pem")
const INSTALL_MANIFEST = join(DIST_DIR, "enterprise-install.json")

const PACKAGE_VERSION = JSON.parse(readFileSync("package.json", "utf-8")).version

if (!existsSync(DIST_DIR)) {
  mkdirSync(DIST_DIR, { recursive: true })
}

console.log("Generating extension key...")
if (!existsSync(PEM_FILE)) {
  execSync(`openssl genrsa -out "${PEM_FILE}" 2048`, { stdio: "inherit" })
}

console.log("Packing CRX (requires Chrome)...")
try {
  execSync(
    `"${process.env.CHROME_BIN ?? "google-chrome"}" --pack-extension="${DIST_DIR}" --pack-extension-key="${PEM_FILE}" --no-message-box`,
    { stdio: "inherit" }
  )
  console.log("CRX packed successfully")
} catch (err) {
  console.error("Chrome packing failed, creating placeholder files...", err)
  const hash = createHash("sha256").update(readFileSync(DIST_DIR).toString()).digest("hex").slice(0, 16)
  writeFileSync(
    join(DIST_DIR, "bm-jmx-recorder.crx"),
    `// Placeholder CRX - build with Chrome\n// SHA: ${hash}\n`
  )
}

const installManifest = {
  name: "BM JMX Recorder",
  version: PACKAGE_VERSION,
  extension_id: process.env.EXTENSION_ID ?? "placeholder",
  update_url: "https://clients2.google.com/service/update2/crx",
  installation_mode: "force_installed",
  install_link: `file:///path/to/dist/bm-jmx-recorder.crx`
}

writeFileSync(
  INSTALL_MANIFEST,
  JSON.stringify(installManifest, null, 2)
)

console.log("Enterprise install manifest generated")
console.log(`CRX: ${CRX_FILE}`)
console.log(`Install manifest: ${INSTALL_MANIFEST}`)