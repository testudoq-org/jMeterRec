import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, unlinkSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = dirname(__dirname);
const VERSION_FILE = join(ROOT, "VERSION");
const PACKAGE_JSON = join(ROOT, "package.json");
const MANIFEST_JSON = join(ROOT, "src", "manifest.json");
const KEY_FILE = join(ROOT, "extension.pem");
const DIST_DIR = join(ROOT, "dist");
const CRX_FILE = join(DIST_DIR, "capultura.crx");
const ZIP_FILE = join(ROOT, "capultura-mv3-beta.zip");

const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function log(...args) {
  console.log(...args);
}

function logStep(step, msg) {
  log(`\n${YELLOW}[${step}/6] ${msg}${RESET}`);
}

function logError(msg) {
  log(`${RED}ERROR: ${msg}${RESET}`);
}

function logSuccess(msg) {
  log(`${GREEN}${msg}${RESET}`);
}

function logInfo(msg) {
  log(`${CYAN}${msg}${RESET}`);
}

function runCommand(cmd, args, options = {}) {
  try {
    const cmdStr = args.length > 0 ? `${cmd} ${args.join(" ")}` : cmd;
    execSync(cmdStr, { cwd: ROOT, stdio: "inherit", ...options });
    return { status: 0 };
  } catch (err) {
    logError(err.message);
    process.exit(1);
  }
}

function findChrome() {
  const envBin = process.env.CHROME_BIN;
  if (envBin && existsSync(envBin)) {
    return envBin;
  }

  const candidates = [
    "D:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
    "chrome",
    "google-chrome",
    "chromium",
    "chromium-browser",
  ];

  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {
      // ignore inaccessible paths
    }
  }
  return null;
}

function validateSemver(v) {
  return /^[0-9]+\.[0-9]+\.[0-9]+$/.test(v);
}

function bumpPatch(version) {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  parts[2] += 1;
  return parts.join(".");
}

function readVersion(file) {
  return readFileSync(file, "utf8").trim();
}

function writeFileAtomic(file, content) {
  const tmp = `${file}.tmp-${Date.now()}`;
  writeFileSync(tmp, content, "utf8");
  // Atomic replace is best-effort on Windows
  try {
    execSync(`powershell -Command "Move-Item -LiteralPath '${tmp}' -Destination '${file}' -Force"`, {
      cwd: ROOT,
      stdio: "pipe",
    });
  } catch {
    // fallback
    writeFileSync(file, content, "utf8");
    try { unlinkSync(tmp); } catch {}
  }
}

function updateJsonFile(file, updates) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  for (const [key, value] of Object.entries(updates)) {
    data[key] = value;
  }
  writeFileAtomic(file, JSON.stringify(data, null, 2) + "\n");
}

function getExtensionIdFromPem(pemPath) {
  try {
    const pem = readFileSync(pemPath, "utf8");
    const base64 = pem
      .replace(/-----BEGIN RSA PRIVATE KEY-----/g, "")
      .replace(/-----END RSA PRIVATE KEY-----/g, "")
      .replace(/[\r\n\s]/g, "");

    const der = Buffer.from(base64, "base64");

    // Parse PKCS#1 to extract modulus + exponent
    let offset = 0;
    function readLength(buf, off) {
      const first = buf[off++];
      if ((first & 0x80) === 0) return first;
      const lenBytes = first & 0x7f;
      let len = 0;
      for (let i = 0; i < lenBytes; i++) len = (len << 8) | buf[off++];
      return len;
    }

    function readInteger(buf, off) {
      const tag = buf[off++];
      if (tag !== 0x02) throw new Error("Expected INTEGER");
      const len = readLength(buf, off);
      return { value: buf.slice(off, off + len), offset: off + len };
    }

    offset++; // SEQUENCE tag
    readLength(der, offset); // skip outer length
    offset += 1; // rough advance past SEQUENCE header
    const ver = readInteger(der, offset);
    offset = ver.offset;
    const mod = readInteger(der, offset);
    offset = mod.offset;
    const exp = readInteger(der, offset);
    offset = exp.offset;

    // Build SPKI structure
    const encodeLength = (len) => {
      if (len < 128) return Buffer.from([len]);
      const bytes = [];
      let l = len;
      while (l > 0) { bytes.unshift(l & 0xff); l = Math.floor(l / 256); }
      return Buffer.concat([Buffer.from([0x80 | bytes.length]), Buffer.from(bytes)]);
    };
    const encodeInteger = (num) => {
      const hex = num.toString(16);
      const buf = Buffer.from(hex.length % 2 !== 0 ? "0" + hex : hex, "hex");
      const result = buf[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), buf]) : buf;
      return Buffer.concat([Buffer.from([0x02]), encodeLength(result.length), result]);
    };
    const rsaPub = (data) => Buffer.concat([Buffer.from([0x30]), encodeLength(data.length), data]);

    const algo = Buffer.from([
      0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
    ]);
    const bitString = Buffer.concat([
      Buffer.from([0x03]),
      encodeLength(encodeInteger(mod.value).length + encodeInteger(exp.value).length + 2),
      Buffer.from([0x00]),
      rsaPub(Buffer.concat([encodeInteger(mod.value), encodeInteger(exp.value)])),
    ]);
    const spki = rsaPub(Buffer.concat([algo, bitString]));

    const hash = require("crypto").createHash("sha256").update(spki).digest();
    const base32 = "abcdefghijklmnopqrstuvwxyz234567";
    const bits = [];
    for (const b of hash) {
      for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
    }
    let id = "";
    for (let i = 0; i < 32; i++) {
      let val = 0;
      for (let j = 0; j < 5; j++) val = (val << 1) | bits[i * 5 + j];
      id += base32[val];
    }
    return id;
  } catch {
    return "UNKNOWN (check extension.pem)";
  }
}

async function main() {
  const args = process.argv.slice(2);
  const explicitVersion = args.find((a) => !a.startsWith("-"));
  const skipGit = args.includes("--skip-git");
  const dryRun = args.includes("--dry-run");

  log(``);
  log(`${BOLD}${CYAN}============================================================${RESET}`);
  log(`${BOLD}${CYAN}  CAPULTURA - CHROME WEB STORE RELEASE WORKFLOW${RESET}`);
  log(`${CYAN}============================================================${RESET}`);
  log(`  Path: ${ROOT}`);
  log(`  Time: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`);
  log(``);

  // ============================================================
  // STEP 0: Validate environment
  // ============================================================
  logStep("0", "Validating environment...");

  const errors = [];

  if (!existsSync(KEY_FILE)) {
    errors.push(`Signing key not found at ${KEY_FILE}\nACTION: Generate ONE-TIME with: openssl genrsa -out extension.pem 2048`);
  } else {
    const keySize = statSync(KEY_FILE).size;
    logInfo(`  Key file: ${keySize} bytes`);
    if (keySize < 1000) {
      errors.push(`extension.pem seems too small (${keySize} bytes). Expected ~1700 bytes for 2048-bit key.`);
    }
  }

  if (!existsSync(PACKAGE_JSON)) errors.push(`${PACKAGE_JSON} not found`);
  if (!existsSync(MANIFEST_JSON)) errors.push(`${MANIFEST_JSON} not found`);

  try {
    const nodeVer = execSync("node --version", { encoding: "utf8" }).trim();
    logInfo(`  Node.js: ${nodeVer}`);
  } catch {
    errors.push("Node.js not found in PATH");
  }

  const chromeBin = findChrome();
  if (chromeBin) {
    logInfo(`  Chrome: ${chromeBin}`);
  } else {
    errors.push("Chrome/Chromium not found. Set CHROME_BIN env or install Chrome.");
  }

  if (errors.length > 0) {
    for (const e of errors) logError(e);
    process.exit(1);
  }

  logSuccess("  Environment valid.");
  log(``);

  // ============================================================
  // STEP 1: Version management
  // ============================================================
  logStep("1", "Version management...");

  const currentVersion = readVersion(VERSION_FILE);
  logInfo(`  Current version: ${currentVersion}`);

  let newVersion;
  if (explicitVersion) {
    newVersion = explicitVersion;
  } else {
    const suggested = bumpPatch(currentVersion) || "0.1.1";
    if (dryRun) {
      newVersion = suggested;
      logInfo(`  Would bump to: ${newVersion} (DryRun)`);
    } else {
      const readline = await import("node:readline");
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise((resolve) => rl.question(`  Enter new version [${suggested}]: `, resolve));
      rl.close();
      newVersion = answer.trim() || suggested;
    }
  }

  if (!validateSemver(newVersion)) {
    logError(`Invalid semver version: ${newVersion}`);
    process.exit(1);
  }

  logInfo(`  Target version: ${newVersion}`);

  if (!dryRun) {
    writeFileAtomic(VERSION_FILE, newVersion);
    updateJsonFile(PACKAGE_JSON, { version: newVersion });
    updateJsonFile(MANIFEST_JSON, { version: newVersion });
    logSuccess("  Updated: VERSION, package.json, src/manifest.json");
  }

  log(``);

  // ============================================================
  // STEP 2: Build
  // ============================================================
  logStep("2", "Building extension...");

  if (!dryRun) {
    runCommand("npm", ["run", "build"]);
    if (!existsSync(join(DIST_DIR, "manifest.json"))) {
      logError("Build output missing manifest.json");
      process.exit(1);
    }
    logSuccess("  Build complete.");
  } else {
    logInfo("  Would run: npm run build");
  }

  log(``);

  // ============================================================
  // STEP 3: Sign CRX
  // ============================================================
  logStep("3", "Signing CRX with persistent key...");

  if (!dryRun) {
    let chromeSucceeded = false;
    try {
      runCommand("npm", ["run", "pack-crx"]);
      chromeSucceeded = true;
      logSuccess("  CRX packed successfully");
    } catch {
      logError("Chrome packing failed (see above)");
    } finally {
      const pemInDist = join(DIST_DIR, "capultura.pem");
      if (existsSync(pemInDist)) {
        unlinkSync(pemInDist);
        logInfo(`  Removed private key from dist: ${pemInDist}`);
      }
    }

    if (!chromeSucceeded) {
      logError("Chrome packing failed. See errors above.");
      process.exit(1);
    }

    if (!existsSync(CRX_FILE)) {
      logError(`CRX not generated at ${CRX_FILE}`);
      process.exit(1);
    }

    const crxSize = statSync(CRX_FILE).size;
    logInfo(`  CRX signed: ${CRX_FILE} (${crxSize} bytes)`);

    const stillThere = join(DIST_DIR, "capultura.pem");
    if (existsSync(stillThere)) {
      logError("Private key found in dist/ - SECURITY ISSUE");
      process.exit(1);
    }
    logSuccess("  Private key confirmed absent from dist/");
  } else {
    logInfo("  Would run: npm run pack-crx");
  }

  log(``);

  // ============================================================
  // STEP 4: Create upload zip
  // ============================================================
  logStep("4", "Creating upload package...");

  if (!dryRun) {
    if (existsSync(ZIP_FILE)) unlinkSync(ZIP_FILE);

    try {
      execSync(
        `powershell -Command "Compress-Archive -Path '${DIST_DIR}\\*' -DestinationPath '${ZIP_FILE}' -CompressionLevel Optimal"`,
        { cwd: ROOT, stdio: "pipe" }
      );
    } catch {
      logError("Failed to create zip archive");
      process.exit(1);
    }

    if (!existsSync(ZIP_FILE)) {
      logError("Zip file not created");
      process.exit(1);
    }

    const zipSize = statSync(ZIP_FILE).size;
    logInfo(`  Upload package: ${ZIP_FILE} (${zipSize} bytes)`);
  } else {
    logInfo(`  Would create: ${ZIP_FILE} from ${DIST_DIR}/`);
  }

  log(``);

  // ============================================================
  // STEP 5: Git commit and tag
  // ============================================================
  logStep("5", "Git operations...");

  if (!dryRun && !skipGit) {
    runCommand("git", ["add", "-A"]);
    const commitMsg = `release: v${newVersion} - signed CRX for Chrome Web Store`;
    try {
      execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { cwd: ROOT, stdio: "pipe" });
      logSuccess(`  Git commit: ${commitMsg}`);
    } catch {
      logInfo("  No changes to commit");
    }

    // Use release-tagger to create the primary version tag
    // It reads VERSION, auto-increments build number, and tags deterministically
    logInfo("  Running release-tagger for version tag...");
    try {
      const tagOutput = execSync(`node "${join(ROOT, 'node_modules', 'release-tagger', 'dist', 'index.js')}" --repo-path "${ROOT}"`, {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      const tagMatch = tagOutput.match(/Final tag\s*:\s*(.+)/);
      if (tagMatch) {
        const releaseTag = tagMatch[1].trim();
        logSuccess(`  release-tagger created: ${releaseTag}`);
      }
    } catch (err) {
      logError(`release-tagger failed: ${err.message || err}`);
      // Fallback: create tag directly
      runCommand("git", ["tag", "-a", `v${newVersion}`, "-m", `Release v${newVersion} - Chrome Web Store upload`]);
      logSuccess(`  Fallback git tag: v${newVersion}`);
    }

    // Create beta candidate tag aligned with release version
    const betaTag = "beta-candidate-mv3-chrome-extensions";
    try {
      execSync(`git tag -d "${betaTag}" 2>/dev/null; git tag -a "${betaTag}" -m "Beta candidate for MV3 to Chrome Extensions (v${newVersion})"`, {
        cwd: ROOT,
        stdio: "pipe",
      });
      logSuccess(`  Git tag: ${betaTag}`);
    } catch {
      logInfo(`  Beta tag ${betaTag} already exists or could not be created`);
    }
  } else if (dryRun) {
    logInfo(`  DryRun: Would commit, tag with release-tagger, and create beta tag`);
  } else {
    logInfo("  Skipped (--skip-git)");
  }

  log(``);

  // ============================================================
  // STEP 6: Summary
  // ============================================================
  logStep("6", "Release summary");

  log(``);
  log(`${GREEN}============================================================${RESET}`);
  log(`${GREEN}  RELEASE READY${RESET}`);
  log(`${GREEN}============================================================${RESET}`);
  log(``);
  logInfo(`  Version:        ${newVersion}`);
  logInfo(`  CRX:            ${CRX_FILE}`);
  logInfo(`  Upload ZIP:     ${ZIP_FILE}`);
  if (existsSync(KEY_FILE)) {
    logInfo(`  Extension ID:   ${getExtensionIdFromPem(KEY_FILE)}`);
  }
  log(``);
  log(`${CYAN}  NEXT STEPS:${RESET}`);
  log(`  1. Go to https://chrome.google.com/webstore/devconsole`);
  log(`  2. Select your extension listing`);
  log(`  3. Upload: ${ZIP_FILE}`);
  log(`  4. Complete store listing with:`);
  log(`     - Single purpose: 'Records real browser flows and converts them into test automation scripts'`);
  log(`     - Remote code: NO`);
  log(`     - Privacy: https://github.com/testudoq-org/jMeterRec/blob/master/PRIVACY`);
  log(``);
  log(`${GREEN}============================================================${RESET}`);
  log(``);

  process.exit(0);
}

main().catch((err) => {
  logError(err.message || String(err));
  process.exit(1);
});
