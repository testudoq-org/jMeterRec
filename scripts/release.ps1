<#
.SYNOPSIS
    Automated release packaging for Chrome Web Store verified CRX uploads.
.DESCRIPTION
    Handles version bumping, build, CRX signing, zip packaging, git commit, and tagging.
    Requires extension.pem at project root (ONE-TIME generation only).
.PARAMETER Version
    Explicit version to release (e.g., "0.2.0"). If omitted, auto-increments patch.
.PARAMETER SkipGit
    Skip git commit and tagging (for testing).
.PARAMETER DryRun
    Validate environment and show what would happen, but make no changes.
.EXAMPLE
    .\release.ps1                    # Auto-increment patch, build, sign, commit, tag
    .\release.ps1 -Version 0.2.0    # Bump to specific version
    .\release.ps1 -DryRun            # Validate only
.NOTES
    Deterministic: same extension.pem always produces same extension ID.
    Private key NEVER leaves dist/ after signing (try/finally cleanup).
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$Version,
    
    [Parameter(Mandatory = $false)]
    [switch]$SkipGit,
    
    [Parameter(Mandatory = $false)]
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# ============================================================
# CONFIGURATION
# ============================================================
$Script:ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Script:ProjectRoot = Split-Path -Parent $Script:ProjectRoot  # scripts/ -> repo root

$Script:VersionFile = Join-Path $Script:ProjectRoot "VERSION"
$Script:PackageJson = Join-Path $Script:ProjectRoot "package.json"
$Script:ManifestJson = Join-Path $Script:ProjectRoot "src\manifest.json"
$Script:KeyFile = Join-Path $Script:ProjectRoot "extension.pem"
$Script:DistDir = Join-Path $Script:ProjectRoot "dist"
$Script:CrxFile = Join-Path $Script:DistDir "capultura.crx"
$Script:ZipFile = Join-Path $Script:ProjectRoot "capultura-mv3-beta.zip"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  CAPULTURA - CHROME WEB STORE RELEASE WORKFLOW" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Path: $Script:ProjectRoot" -ForegroundColor DarkGray
Write-Host "  Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor DarkGray
Write-Host ""

# ============================================================
# STEP 0: Validate environment
# ============================================================
Write-Host "[0/6] Validating environment..." -ForegroundColor Yellow

$errors = @()

if (-not (Test-Path $Script:KeyFile)) {
    $errors += "ERROR: Signing key not found at $Script:KeyFile`nACTION: Generate ONE-TIME with: openssl genrsa -out extension.pem 2048"
} else {
    $keySize = (Get-Item $Script:KeyFile).Length
    Write-Host "  Key file: $keySize bytes" -ForegroundColor Green
    if ($keySize -lt 1000) {
        $errors += "ERROR: extension.pem seems too small ($keySize bytes). Expected ~1700 bytes for 2048-bit key."
    }
}

if (-not (Test-Path $Script:PackageJson)) {
    $errors += "ERROR: $Script:PackageJson not found"
}

if (-not (Test-Path $Script:ManifestJson)) {
    $errors += "ERROR: $Script:ManifestJson not found"
}

# Check for Node.js
try {
    $nodeVersion = node --version
    Write-Host "  Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    $errors += "ERROR: Node.js not found in PATH"
}

# Check for Chrome
$chromeBin = $env:CHROME_BIN
if (-not $chromeBin) {
    $possiblePaths = @(
        "C:\Program Files\Google\Chrome\Application\chrome.exe",
        "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )
    foreach ($p in $possiblePaths) {
        if (Test-Path $p) {
            $chromeBin = $p
            break
        }
    }
}

if ($chromeBin -and (Test-Path $chromeBin)) {
    Write-Host "  Chrome: $chromeBin" -ForegroundColor Green
} else {
    $errors += "ERROR: Chrome/Chromium not found. Set `$env:CHROME_BIN or install Chrome."
}

if ($errors.Count -gt 0) {
    foreach ($e in $errors) {
        Write-Host $e -ForegroundColor Red
    }
    exit 1
}

Write-Host "  Environment valid." -ForegroundColor Green
Write-Host ""

# ============================================================
# STEP 1: Version management
# ============================================================
Write-Host "[1/6] Version management..." -ForegroundColor Yellow

$currentVersion = Get-Content $Script:VersionFile -Raw | ForEach-Object { $_.Trim() }
Write-Host "  Current version: $currentVersion" -ForegroundColor Cyan

if ($Version) {
    $newVersion = $Version
} else {
    # Auto-increment patch
    if ($currentVersion -match '^(\d+)\.(\d+)\.(\d+)$') {
        $major = [int]$Matches[1]
        $minor = [int]$Matches[2]
        $patch = [int]$Matches[3]
        $patch++
        $suggestedVersion = "$major.$minor.$patch"
    } else {
        $suggestedVersion = "0.1.1"
    }
    
    if ($DryRun) {
        $newVersion = $suggestedVersion
        Write-Host "  Would bump to: $newVersion (DryRun)" -ForegroundColor Yellow
    } else {
        $newVersion = Read-Host "  Enter new version [$suggestedVersion]"
        if ([string]::IsNullOrWhiteSpace($newVersion)) {
            $newVersion = $suggestedVersion
        }
    }
}

# Validate semver
if ($newVersion -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$') {
    Write-Host "ERROR: Invalid semver version: $newVersion" -ForegroundColor Red
    exit 1
}

Write-Host "  Target version: $newVersion" -ForegroundColor Green

if (-not $DryRun) {
    # Update VERSION file
    Set-Content -Path $Script:VersionFile -Value $newVersion -NoNewline
    
    # Update package.json
    $pkg = Get-Content $Script:PackageJson -Raw | ConvertFrom-Json
    $pkg.version = $newVersion
    $pkg | ConvertTo-Json -Depth 10 | Set-Content $Script:PackageJson
    
    # Update manifest.json
    $manifest = Get-Content $Script:ManifestJson -Raw | ConvertFrom-Json
    $manifest.version = $newVersion
    $manifest | ConvertTo-Json -Depth 10 | Set-Content $Script:ManifestJson
    
    Write-Host "  Updated: VERSION, package.json, src/manifest.json" -ForegroundColor Green
}

Write-Host ""

# ============================================================
# STEP 2: Build
# ============================================================
Write-Host "[2/6] Building extension..." -ForegroundColor Yellow

if (-not $DryRun) {
    Push-Location $Script:ProjectRoot
    try {
        npm run build | Out-Null
    } finally {
        Pop-Location
    }
    
    if (-not (Test-Path (Join-Path $Script:DistDir "manifest.json"))) {
        Write-Host "ERROR: Build output missing manifest.json" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "  Build complete." -ForegroundColor Green
} else {
    Write-Host "  Would run: npm run build" -ForegroundColor Yellow
}

Write-Host ""

# ============================================================
# STEP 3: Sign CRX
# ============================================================
Write-Host "[3/6] Signing CRX with persistent key..." -ForegroundColor Yellow

if (-not $DryRun) {
    Push-Location $Script:ProjectRoot
    try {
        npm run pack-crx | Out-Null
    } finally {
        Pop-Location
    }
    
    if (-not (Test-Path $Script:CrxFile)) {
        Write-Host "ERROR: CRX not generated at $Script:CrxFile" -ForegroundColor Red
        exit 1
    }
    
    $crxSize = (Get-Item $Script:CrxFile).Length
    Write-Host "  CRX signed: $Script:CrxFile ($crxSize bytes)" -ForegroundColor Green
    
    # Verify private key cleanup
    $pemInDist = Join-Path $Script:DistDir "capultura.pem"
    if (Test-Path $pemInDist) {
        Write-Host "ERROR: Private key found in dist/ - SECURITY ISSUE" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Private key confirmed absent from dist/" -ForegroundColor Green
} else {
    Write-Host "  Would run: npm run pack-crx" -ForegroundColor Yellow
}

Write-Host ""

# ============================================================
# STEP 4: Create upload zip
# ============================================================
Write-Host "[4/6] Creating upload package..." -ForegroundColor Yellow

if (-not $DryRun) {
    if (Test-Path $Script:ZipFile) {
        Remove-Item $Script:ZipFile -Force
    }
    
    Push-Location $Script:DistDir
    try {
        Compress-Archive -Path * -DestinationPath $Script:ZipFile -CompressionLevel Optimal
    } finally {
        Pop-Location
    }
    
    $zipSize = (Get-Item $Script:ZipFile).Length
    Write-Host "  Upload package: $Script:ZipFile ($zipSize bytes)" -ForegroundColor Green
} else {
    Write-Host "  Would create: $Script:ZipFile from $Script:DistDir\" -ForegroundColor Yellow
}

Write-Host ""

# ============================================================
# STEP 5: Git commit and tag
# ============================================================
Write-Host "[5/6] Git operations..." -ForegroundColor Yellow

if (-not $DryRun -and -not $SkipGit) {
    Push-Location $Script:ProjectRoot
    try {
        git add -A | Out-Null
        
        $commitMsg = "release: v$newVersion - signed CRX for Chrome Web Store"
        git commit -m $commitMsg | Out-Null
        
        git tag -a "v$newVersion" -m "Release v$newVersion - Chrome Web Store upload" | Out-Null
        git tag -a "beta-candidate-mv3-chrome-extensions" -m "Beta candidate for MV3 to Chrome Extensions" | Out-Null
        
        Write-Host "  Git commit: $commitMsg" -ForegroundColor Green
        Write-Host "  Git tag: v$newVersion" -ForegroundColor Green
        Write-Host "  Git tag: beta-candidate-mv3-chrome-extensions" -ForegroundColor Green
    } finally {
        Pop-Location
    }
} elseif ($DryRun) {
    Write-Host "  DryRun: Would commit and tag v$newVersion" -ForegroundColor Yellow
} else {
    Write-Host "  Skipped (SkipGit)" -ForegroundColor DarkGray
}

Write-Host ""

# ============================================================
# STEP 6: Summary and next steps
# ============================================================
Write-Host "[6/6] Release summary" -ForegroundColor Yellow
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  RELEASE READY" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Version:        $newVersion" -ForegroundColor White
Write-Host "  CRX:            $Script:CrxFile" -ForegroundColor White
Write-Host "  Upload ZIP:     $Script:ZipFile" -ForegroundColor White
Write-Host ""

if (-not $DryRun -and (Test-Path $Script:KeyFile)) {
    $extensionId = Get-ExtensionIdFromKey $Script:KeyFile
    Write-Host "  Extension ID:  $extensionId" -ForegroundColor White
}

Write-Host ""
Write-Host "  NEXT STEPS:" -ForegroundColor Cyan
Write-Host "  1. Go to https://chrome.google.com/webstore/devconsole" -ForegroundColor White
Write-Host "  2. Select your extension listing" -ForegroundColor White
Write-Host "  3. Upload: $Script:ZipFile" -ForegroundColor White
Write-Host "  4. Complete store listing with:" -ForegroundColor White
Write-Host "     - Single purpose: 'Records real browser flows and converts them into test automation scripts'" -ForegroundColor DarkGray
Write-Host "     - Remote code: NO" -ForegroundColor DarkGray
Write-Host "     - Privacy: https://github.com/testudoq-org/jMeterRec/blob/master/PRIVACY" -ForegroundColor DarkGray
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""

exit 0

# ============================================================
# Helper: Derive extension ID from PEM public key
# ============================================================
function Get-ExtensionIdFromKey {
    param([string]$PemPath)
    
    try {
        $pem = Get-Content $PemPath -Raw
        $base64 = ($pem -replace "-----BEGIN RSA PRIVATE KEY-----", "" -replace "-----END RSA PRIVATE KEY-----", "" -replace "`r`n", "" -replace "`n", "" -replace " ", "")
        $der = [Convert]::FromBase64String($base64)
        
        $rsa = [System.Security.Cryptography.RSA]::Create()
        [void]$rsa.ImportRSAPrivateKey($der, [ref]$null)
        $spki = $rsa.ExportSubjectPublicKeyInfo()
        
        # Chrome extension ID = first 16 bytes of SHA256(SPKI), base32, lowercase
        $hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash($spki)
        $base32 = "abcdefghijklmnopqrstuvwxyz234567"
        $bits = ""
        foreach ($b in $hash[0..15]) {
            $bits += [Convert]::ToString($b, 2).PadLeft(8, '0')
        }
        $id = ""
        for ($i = 0; $i -lt 32; $i++) {
            $val = 0
            for ($j = 0; $j -lt 5; $j++) {
                $val = $val -shl 1
                if ($bits[$i * 5 + $j] -eq '1') { $val = $val -bor 1 }
            }
            $id += $base32[$val]
        }
        return $id
    } catch {
        return "UNKNOWN (check extension.pem)"
    }
}
