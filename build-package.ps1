<#
.SYNOPSIS
    Builds the Frontend and Backend for Endurance QMS and packages them into a release zip.
.DESCRIPTION
    This script runs `npm run build` for the React frontend and `dotnet publish` for the ASP.NET Core backend.
    It then creates a timestamped output folder containing both builds, generates a deployment readme,
    and zips the folder for easy distribution.
.EXAMPLE
    .\build-package.ps1
#>

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$Timestamp = Get-Date -Format "yyyyMMdd-HHmm"
$BuildName = "Endurance-QMS-Build-$Timestamp"
$BuildDir = Join-Path $ProjectRoot $BuildName

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " Endurance QMS - Build & Package Script" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

# 1. Clean previous build folders (optional, just ensuring we start fresh for this timestamp)
if (Test-Path $BuildDir) {
    Remove-Item -Path $BuildDir -Recurse -Force
}
New-Item -ItemType Directory -Path $BuildDir | Out-Null

# 2. Build Frontend
Write-Host "`n[1/4] Building Vite React Frontend..." -ForegroundColor Yellow
Push-Location $ProjectRoot
try {
    # Ensure npm install is run if node_modules is missing
    if (-not (Test-Path "node_modules")) {
        Write-Host "Running npm install..." -ForegroundColor Gray
        npm install
    }
    
    npm run build
    
    $FrontendDist = Join-Path $ProjectRoot "dist"
    if (-not (Test-Path (Join-Path $FrontendDist "index.html"))) {
        throw "Frontend build failed: index.html not found in dist/ folder."
    }
    
    $FrontendTarget = Join-Path $BuildDir "EnduranceFrontend"
    Copy-Item -Path $FrontendDist -Destination $FrontendTarget -Recurse -Force
    Write-Host "✓ Frontend built and copied." -ForegroundColor Green
} finally {
    Pop-Location
}

# 3. Publish Backend
Write-Host "`n[2/4] Publishing ASP.NET Core Backend..." -ForegroundColor Yellow
Push-Location (Join-Path $ProjectRoot "backend")
try {
    # Clean old publish folder if exists
    if (Test-Path "publish") {
        Remove-Item -Path "publish" -Recurse -Force
    }

    dotnet publish -c Release -o ./publish
    
    $BackendPublish = Join-Path $ProjectRoot "backend\publish"
    if (-not (Test-Path (Join-Path $BackendPublish "backend.dll"))) {
        throw "Backend publish failed: backend.dll not found in publish/ folder."
    }
    
    $BackendTarget = Join-Path $BuildDir "EnduranceAPI"
    Copy-Item -Path $BackendPublish -Destination $BackendTarget -Recurse -Force
    
    # Remove appsettings.json from the publish directory so it doesn't overwrite production config
    $AppSettingsPath = Join-Path $BackendTarget "appsettings.json"
    if (Test-Path $AppSettingsPath) {
        Remove-Item -Path $AppSettingsPath -Force
        Write-Host "  (Removed appsettings.json from package to protect server config)" -ForegroundColor Gray
    }

    Write-Host "✓ Backend published and copied." -ForegroundColor Green
} finally {
    Pop-Location
}

# 4. Generate README and Package
Write-Host "`n[3/4] Generating Deployment README..." -ForegroundColor Yellow

$ReadmePath = Join-Path $BuildDir "DEPLOY-README.txt"
$CommitHash = ""
try {
    $CommitHash = git rev-parse --short HEAD
} catch {
    $CommitHash = "unknown"
}

$ReadmeContent = @"
Endurance QMS - deployment build
Built $(Get-Date -Format "yyyy-MM-dd HH:mm") from commit $CommitHash

  EnduranceFrontend\  -> C:\inetpub\wwwroot\EnduranceFrontend
  EnduranceAPI\       -> C:\inetpub\wwwroot\EnduranceAPI

appsettings.json is NOT included - the server keeps its own.

DEPLOY
  1. Stop the EnduranceAPI app pool.
  2. Copy both folders over, leaving appsettings.json in place on the server.
  3. Start the app pool; check http://<server>:5191/health -> "Healthy".
  4. Hard-refresh the browser (Ctrl+F5) to clear cache.
"@
Set-Content -Path $ReadmePath -Value $ReadmeContent
Write-Host "✓ DEPLOY-README.txt created." -ForegroundColor Green


Write-Host "`n[4/4] Creating Zip Archive..." -ForegroundColor Yellow
$DownloadsDir = [System.Environment]::GetFolderPath('UserProfile') + "\Downloads"
$ZipPath = Join-Path $DownloadsDir "$BuildName.zip"
if (Test-Path $ZipPath) { Remove-Item -Path $ZipPath -Force }

Compress-Archive -Path "$BuildDir\*" -DestinationPath $ZipPath
Write-Host "✓ Created archive: $ZipPath" -ForegroundColor Green

Write-Host "`n=====================================================" -ForegroundColor Green
Write-Host " Build & Package Complete!" -ForegroundColor Green
Write-Host " Output Folder: $BuildDir" -ForegroundColor White
Write-Host " Zip Archive:   $ZipPath" -ForegroundColor White
Write-Host "=====================================================" -ForegroundColor Green
