<#
.SYNOPSIS
    Automated IIS Build and Deployment Script for Endurance QMS (Frontend + Backend)
.DESCRIPTION
    This script builds the Vite React frontend, publishes the ASP.NET Core 10 backend,
    and optionally sets up the IIS Websites, Application Pools, directory permissions,
    and Windows Firewall rules so both are instantly reachable.
.EXAMPLE
    .\Deploy-IIS.ps1 -DeployToIIS -FrontendPort 80 -BackendPort 5191
#>

param(
    [switch]$DeployToIIS,
    [string]$FrontendSiteName = "EnduranceFrontend",
    [int]$FrontendPort = 80,
    [string]$BackendSiteName = "EnduranceAPI",
    [int]$BackendPort = 5191,
    [string]$InstallPath = "C:\inetpub\wwwroot"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$FrontendDist = Join-Path $ProjectRoot "dist"
$BackendPublish = Join-Path $ProjectRoot "backend\publish"

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " Endurance QMS - Automated IIS Build & Deploy Script " -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

# 1. Build Frontend
Write-Host "`n[1/4] Building Vite React Frontend..." -ForegroundColor Yellow
Push-Location $ProjectRoot
try {
    npm run build
    if (-not (Test-Path Join-Path $FrontendDist "index.html")) {
        throw "Frontend build failed: index.html not found in dist/ folder."
    }
    Write-Host "✓ Frontend built successfully to dist/ folder." -ForegroundColor Green
} finally {
    Pop-Location
}

# 2. Publish Backend
Write-Host "`n[2/4] Publishing ASP.NET Core 10 Backend..." -ForegroundColor Yellow
Push-Location (Join-Path $ProjectRoot "backend")
try {
    dotnet publish -c Release -o ./publish
    if (-not (Test-Path Join-Path $BackendPublish "backend.dll")) {
        throw "Backend publish failed: backend.dll not found in publish/ folder."
    }
    Write-Host "✓ Backend published successfully to backend/publish/ folder." -ForegroundColor Green
} finally {
    Pop-Location
}

if (-not $DeployToIIS) {
    Write-Host "`n=====================================================" -ForegroundColor Green
    Write-Host " Build Complete! Both folders are ready for IIS:" -ForegroundColor Green
    Write-Host "  - Frontend: $FrontendDist" -ForegroundColor White
    Write-Host "  - Backend:  $BackendPublish" -ForegroundColor White
    Write-Host "`nTo automatically configure IIS websites, run this script as Administrator with the -DeployToIIS flag:" -ForegroundColor Yellow
    Write-Host "  .\Deploy-IIS.ps1 -DeployToIIS -FrontendPort 80 -BackendPort 5191" -ForegroundColor Cyan
    Write-Host "=====================================================" -ForegroundColor Green
    exit 0
}

# 3. Check Administrator Privileges and IIS Modules
Write-Host "`n[3/4] Configuring IIS Application Pools and Websites..." -ForegroundColor Yellow
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "Deploying to IIS requires running PowerShell as Administrator. Please re-run the script in an elevated terminal."
    exit 1
}

Import-Module WebAdministration -ErrorAction SilentlyContinue
if (-not (Get-Module -Name WebAdministration)) {
    Write-Error "IIS WebAdministration PowerShell module is not installed. Please enable IIS Administration Tools in Windows Features."
    exit 1
}

$FrontendTargetDir = Join-Path $InstallPath $FrontendSiteName
$BackendTargetDir = Join-Path $InstallPath $BackendSiteName

Write-Host "Copying Frontend files to $FrontendTargetDir..." -ForegroundColor White
if (-not (Test-Path $FrontendTargetDir)) { New-Item -ItemType Directory -Path $FrontendTargetDir -Force | Out-Null }
Copy-Item -Path "$FrontendDist\*" -Destination $FrontendTargetDir -Recurse -Force

Write-Host "Copying Backend files to $BackendTargetDir..." -ForegroundColor White
if (-not (Test-Path $BackendTargetDir)) { New-Item -ItemType Directory -Path $BackendTargetDir -Force | Out-Null }
Copy-Item -Path "$BackendPublish\*" -Destination $BackendTargetDir -Recurse -Force

# Create App Pools
$FrontendAppPool = "$FrontendSiteNameAppPool"
$BackendAppPool = "$BackendSiteNameAppPool"

if (-not (Test-Path "IIS:\AppPools\$FrontendAppPool")) {
    New-WebAppPool -Name $FrontendAppPool | Out-Null
}
Set-ItemProperty "IIS:\AppPools\$FrontendAppPool" -Name "managedRuntimeVersion" -Value "" # No Managed Code for SPA

if (-not (Test-Path "IIS:\AppPools\$BackendAppPool")) {
    New-WebAppPool -Name $BackendAppPool | Out-Null
}
Set-ItemProperty "IIS:\AppPools\$BackendAppPool" -Name "managedRuntimeVersion" -Value "" # No Managed Code for .NET Core/.NET 10

# Create Websites
if (Test-Path "IIS:\Sites\$FrontendSiteName") { Remove-WebSite -Name $FrontendSiteName }
New-WebSite -Name $FrontendSiteName -Port $FrontendPort -PhysicalPath $FrontendTargetDir -ApplicationPool $FrontendAppPool -Force | Out-Null
Write-Host "✓ Frontend Website created on port $FrontendPort" -ForegroundColor Green

if (Test-Path "IIS:\Sites\$BackendSiteName") { Remove-WebSite -Name $BackendSiteName }
New-WebSite -Name $BackendSiteName -Port $BackendPort -PhysicalPath $BackendTargetDir -ApplicationPool $BackendAppPool -Force | Out-Null
Write-Host "✓ Backend Website created on port $BackendPort" -ForegroundColor Green

# 4. Set Directory Permissions & Firewall Rules
Write-Host "`n[4/4] Setting Folder Permissions & Windows Firewall Rules..." -ForegroundColor Yellow

$StorageDir = Join-Path $BackendTargetDir "Storage"
if (-not (Test-Path $StorageDir)) { New-Item -ItemType Directory -Path $StorageDir -Force | Out-Null }
$LogsDir = Join-Path $BackendTargetDir "logs"
if (-not (Test-Path $LogsDir)) { New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null }

$Acl = Get-Acl $BackendTargetDir
$AppPoolUser = "IIS APPPOOL\$BackendAppPool"
$Permission = $AppPoolUser, "FullControl", "ContainerInherit, ObjectInherit", "None", "Allow"
$AccessRule = New-Object System.Security.AccessControl.FileSystemAccessRule $Permission
try {
    $Acl.SetAccessRule($AccessRule)
    Set-Acl $BackendTargetDir $Acl
    Write-Host "✓ Granted FullControl to $AppPoolUser on Backend folder ($BackendTargetDir)" -ForegroundColor Green
} catch {
    Write-Host "! Note: Could not assign direct ACL for $AppPoolUser (`$ex.Message). Granting permission to IIS_IUSRS instead..." -ForegroundColor Yellow
    $PermissionIIS = "BUILTIN\IIS_IUSRS", "Modify", "ContainerInherit, ObjectInherit", "None", "Allow"
    $AccessRuleIIS = New-Object System.Security.AccessControl.FileSystemAccessRule $PermissionIIS
    $Acl.SetAccessRule($AccessRuleIIS)
    Set-Acl $BackendTargetDir $Acl
    Write-Host "✓ Granted Modify permissions to IIS_IUSRS on Backend folder." -ForegroundColor Green
}

# Add Firewall rules if needed
try {
    New-NetFirewallRule -DisplayName "Endurance API Port $BackendPort" -Direction Inbound -Protocol TCP -LocalPort $BackendPort -Action Allow -ErrorAction SilentlyContinue | Out-Null
    New-NetFirewallRule -DisplayName "Endurance Frontend Port $FrontendPort" -Direction Inbound -Protocol TCP -LocalPort $FrontendPort -Action Allow -ErrorAction SilentlyContinue | Out-Null
    Write-Host "✓ Windows Firewall rules configured for Ports $FrontendPort and $BackendPort." -ForegroundColor Green
} catch {
    Write-Host "! Note: Firewall rule configuration skipped (`$_)." -ForegroundColor Gray
}

Write-Host "`n=====================================================" -ForegroundColor Green
Write-Host " Deployment Complete & Active!" -ForegroundColor Green
Write-Host "  - Frontend URL: http://localhost:$FrontendPort" -ForegroundColor White
Write-Host "  - Backend API:  http://localhost:$BackendPort/api" -ForegroundColor White
Write-Host "`nNote: If deploying to a remote server IP (e.g. 192.168.1.100)," -ForegroundColor Yellow
Write-Host "the Frontend will automatically detect and connect to http://192.168.1.100:$BackendPort/api !" -ForegroundColor Yellow
Write-Host "You can also override this anytime in $FrontendTargetDir\runtime-config.js" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Green
