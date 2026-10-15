$ErrorActionPreference = 'Stop'

Write-Host "=== Tabularis Windows Installer Build Script ===" -ForegroundColor Cyan

$buildDir = "C:\tabularis-build"
$perlExe = "C:\tabularis-build-tools\strawberry\perl\bin\perl.exe"
$nasmDir = "C:\Users\asus\AppData\Local\bin\NASM"
$targetInstallerDir = "C:\Users\asus\Desktop\Tabularis-Installer"

# 1. Check tools
if (-not (Test-Path $perlExe)) {
    throw "Strawberry Perl not found at $perlExe"
}
if (-not (Test-Path (Join-Path $nasmDir "nasm.exe"))) {
    throw "NASM not found at $nasmDir\nasm.exe"
}

# 2. Setup environment variables for vendored OpenSSL and Tauri build
$env:PERL = $perlExe
$env:OPENSSL_SRC_PERL = $perlExe
$env:PATH = "$nasmDir;$env:PATH"

Write-Host "Perl: $(& $perlExe -v | Select-Object -First 2 | Out-String)" -ForegroundColor Green
Write-Host "NASM: $(& (Join-Path $nasmDir 'nasm.exe') -v)" -ForegroundColor Green
Write-Host "Cargo: $(cargo --version)" -ForegroundColor Green
Write-Host "Node: $(node --version)" -ForegroundColor Green

# 3. Build with tauri
Set-Location $buildDir
Write-Host "`nStarting 'pnpm tauri build' at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')..." -ForegroundColor Yellow
pnpm tauri build
if ($LASTEXITCODE -ne 0) {
    throw "pnpm tauri build failed with exit code $LASTEXITCODE"
}

# 4. Locate and copy installer
$bundleDir = Join-Path $buildDir "src-tauri\target\release\bundle\nsis"
if (-not (Test-Path $bundleDir)) {
    $bundleDir = Join-Path $buildDir "src-tauri\target\release\bundle"
}

$installers = Get-ChildItem -Path $bundleDir -Filter "*.exe" -Recurse
if ($installers.Count -eq 0) {
    throw "No .exe installer found in $bundleDir"
}

if (-not (Test-Path $targetInstallerDir)) {
    New-Item -ItemType Directory -Force -Path $targetInstallerDir | Out-Null
}

foreach ($inst in $installers) {
    $dest = Join-Path $targetInstallerDir $inst.Name
    Copy-Item -Path $inst.FullName -Destination $dest -Force
    Write-Host "`nSuccessfully copied installer to: $dest" -ForegroundColor Green
    $fileInfo = Get-Item $dest
    Write-Host "Size: $([math]::Round($fileInfo.Length / 1MB, 2)) MB" -ForegroundColor Green
    Write-Host "LastWriteTime: $($fileInfo.LastWriteTime)" -ForegroundColor Green
}

Write-Host "`n=== Build & Deploy Completed Successfully at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" -ForegroundColor Cyan
