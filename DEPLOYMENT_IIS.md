# IIS Server Deployment & Configuration Guide
**Endurance Quality Management System (Vite React Frontend + ASP.NET Core 10 Backend)**

This document provides complete instructions for deploying the **Endurance QMS** Frontend and Backend to **Microsoft IIS** on Windows Server. All files, build configs, URL rewrites, CORS configurations, and large file upload limits have been pre-configured so that **after deploying the Frontend to IIS, the Backend API is immediately reachable**.

---

## 1. Architectural Highlights & Readiness Matrix

| Component | IIS Readiness Features Implemented |
| :--- | :--- |
| **Vite React Frontend** | **Dynamic API URL Resolution:** Automatically detects whether it's running locally (`http://localhost:5191/api`) or on an IIS Server (`http://<server-ip-or-domain>:5191/api`).<br>**Post-Deployment Runtime Config:** Includes `runtime-config.js` in the published root (`dist/runtime-config.js`), allowing server administrators to change the API endpoint on the fly **without rebuilding React**.<br>**SPA Routing Support:** Pre-configured with `public/web.config` to handle React Router client-side routing (`index.html`) and proper MIME types (`.woff2`, `.json`, `.svg`, `.mjs`). |
| **ASP.NET Core 10 Backend** | **In-Process Hosting Model:** Configured with `<AspNetCoreHostingModel>inprocess</AspNetCoreHostingModel>` for maximum IIS performance.<br>**CORS & Base Paths:** Configured with `UseCors("AllowAll")` allowing requests from any frontend origin/port, and uses `AppContext.BaseDirectory` for reliable physical path resolution (`Storage/RawFiles`, `logs`, `template.xlsx`).<br>**Large Excel Upload Limits:** Pre-configured with `<requestLimits maxAllowedContentLength="314572800" />` (300MB) inside `backend/web.config` and Kestrel/IISServer options in `Program.cs` to prevent IIS `404.13 Request Entity Too Large` errors. |

---

## 2. Server Prerequisites

Before running the deployment script on the Windows Server, ensure the following are installed:
1. **Microsoft IIS (Internet Information Services):**
   - Enable via Server Manager -> Add Roles and Features -> **Web Server (IIS)**.
   - Ensure **IIS Management Scripts and Tools** and **Application Initialization** are enabled.
2. **URL Rewrite Module 2.0 (Required for React SPA Client Routing):**
   - Download & Install from Microsoft: [IIS URL Rewrite Module 2.0](https://www.iis.net/downloads/microsoft/url-rewrite)
3. **ASP.NET Core 10.0 Hosting Bundle:**
   - Download & Install the **ASP.NET Core 10.0 Hosting Bundle** (not just the runtime). This installs the **AspNetCoreModuleV2** required for hosting `.NET 10` Web APIs inside IIS.
   - *After installing, restart IIS:* Run `iisreset` in an elevated Command Prompt.

---

## 3. Option A: Automated 1-Click Deployment (Recommended)

We have provided an automated PowerShell script in the project root: **`Deploy-IIS.ps1`**.

### Step 1: Run Build Only (To inspect outputs before copying to `C:\inetpub\wwwroot`)
Open PowerShell and run:
```powershell
.\Deploy-IIS.ps1
```
This automatically executes `npm run build` for the frontend and `dotnet publish -c Release -o ./publish` for the backend, outputting clean packages to:
- **Frontend Bundle:** `dist\`
- **Backend Bundle:** `backend\publish\`

### Step 2: Automated IIS Installation & Configuration
Open PowerShell **as Administrator** and run:
```powershell
.\Deploy-IIS.ps1 -DeployToIIS -FrontendPort 80 -BackendPort 5191
```
**What this script does automatically:**
1. Copies `dist\*` to `C:\inetpub\wwwroot\EnduranceFrontend`.
2. Copies `backend\publish\*` to `C:\inetpub\wwwroot\EnduranceAPI`.
3. Creates two dedicated IIS Application Pools (`EnduranceFrontendAppPool` and `EnduranceAPIAppPool`) with **No Managed Code**.
4. Creates and starts the IIS Websites on **Port 80** (Frontend) and **Port 5191** (Backend).
5. Assigns NTFS `FullControl` / `Modify` permissions to `IIS APPPOOL\EnduranceAPIAppPool` and `IIS_IUSRS` on the `Storage`, `logs`, and `endurance.db` directories.
6. Opens Windows Firewall ports `80` and `5191`.

---

## 4. Option B: Manual IIS Setup Step-by-Step

If your organization requires manual configuration via **IIS Manager**:

### 1. Prepare Files
1. Run `npm run build` in the root (`dist/` folder will be created).
2. Run `dotnet publish -c Release -o ./publish` inside `backend/` (`backend/publish/` folder will be created).
3. Copy `dist/` to your server at `C:\inetpub\wwwroot\EnduranceFrontend`.
4. Copy `backend/publish/` to your server at `C:\inetpub\wwwroot\EnduranceAPI`.

### 2. Configure Backend API (`EnduranceAPI`) in IIS Manager
1. Open **IIS Manager** -> Right-click **Application Pools** -> **Add Application Pool...**
   - **Name:** `EnduranceAPIAppPool`
   - **.NET CLR Version:** `No Managed Code` (since ASP.NET Core manages its own runtime via `AspNetCoreModuleV2`).
   - **Managed Pipeline Mode:** `Integrated`
2. Right-click **Sites** -> **Add Website...**
   - **Site name:** `EnduranceAPI`
   - **Application pool:** `EnduranceAPIAppPool`
   - **Physical path:** `C:\inetpub\wwwroot\EnduranceAPI`
   - **Binding:** `http` on Port `5191` (or your preferred API port).
3. **Set Folder Permissions:**
   - In File Explorer, navigate to `C:\inetpub\wwwroot\EnduranceAPI`.
   - Right-click `Storage` folder -> **Properties** -> **Security** -> **Edit** -> **Add...**
   - Type `IIS APPPOOL\EnduranceAPIAppPool` (or `IIS_IUSRS`) and grant **Full Control / Modify**.
   - Repeat the exact same permission grant for the `logs` folder and `endurance.db` file (if using SQLite).

### 3. Configure Frontend SPA (`EnduranceFrontend`) in IIS Manager
1. In IIS Manager, add a new Application Pool: `EnduranceFrontendAppPool` (`No Managed Code`).
2. Right-click **Sites** -> **Add Website...**
   - **Site name:** `EnduranceFrontend`
   - **Application pool:** `EnduranceFrontendAppPool`
   - **Physical path:** `C:\inetpub\wwwroot\EnduranceFrontend`
   - **Binding:** `http` on Port `80` (or `443` with SSL).

---

## 5. How the Frontend Connects to the Backend in IIS

Once deployed, the Frontend determines the `API_BASE_URL` in this order of priority (`src/config.js`):

1. **Server Runtime Configuration (`runtime-config.js`)**:
   In `C:\inetpub\wwwroot\EnduranceFrontend\runtime-config.js`, you can explicitly set the API URL directly on the server without rebuilding:
   ```javascript
   window.__RUNTIME_CONFIG__ = {
     API_BASE_URL: "http://192.168.1.100:5191/api" // Or "/api" if using reverse proxy
   };
   ```
2. **Build-Time Environment Variable (`.env.production`)**:
   If `VITE_API_BASE_URL` is set when running `npm run build`, it will be embedded into the JavaScript bundle.
3. **Automatic Hostname Detection (Zero-Config Default)**:
   If `runtime-config.js` is left blank (`API_BASE_URL: null`) and no build-time variable is set, the React application automatically connects to port `5191` on whatever server hostname or IP address the user visited:
   - If user visits `http://10.0.0.5/`, frontend connects to `http://10.0.0.5:5191/api`.
   - If user visits `http://qms.endurance.local/`, frontend connects to `http://qms.endurance.local:5191/api`.

---

## 6. Troubleshooting Common IIS Issues

### Problem 1: `HTTP Error 500.19 - Internal Server Error` (Config Error)
- **Cause:** IIS cannot read `web.config` either because the required IIS Module is missing or file permissions are denied.
- **Solution:**
  - For Frontend (`EnduranceFrontend`): Ensure **URL Rewrite Module 2.0** is installed on the server.
  - For Backend (`EnduranceAPI`): Ensure **ASP.NET Core 10 Hosting Bundle** is installed, and run `iisreset`.

### Problem 2: `HTTP Error 404.13 - Request Entity Too Large` when uploading Excel files
- **Cause:** IIS default request filtering blocks payloads over ~30MB.
- **Solution:** Our `backend/web.config` automatically sets `<requestLimits maxAllowedContentLength="314572800" />` (300MB). Ensure your IIS site is using our provided `web.config` inside `backend/publish/web.config`.

### Problem 3: `HTTP Error 502.5 / 500.30 - ANCM In-Process Start Failure`
- **Cause:** ASP.NET Core failed to start `backend.dll`.
- **Solution:**
  - Check the `C:\inetpub\wwwroot\EnduranceAPI\logs\stdout_*.log` files for exact stack traces.
  - Verify that the Application Pool identity (`IIS APPPOOL\EnduranceAPIAppPool`) has **Modify/Write** permissions on `endurance.db` and the `Storage/RawFiles` folder.
  - If connecting to an external SQL Server, verify the connection string in `appsettings.Production.json`. If using Windows Authentication (`Trusted_Connection=True`), either add `IIS APPPOOL\EnduranceAPIAppPool` as a login in SQL Server Management Studio (SSMS), or use SQL Authentication (`User Id=sa;Password=yourpassword;`).

### Problem 4: `404 Not Found` when refreshing `/reports` or `/dashboard` on the Frontend
- **Cause:** URL Rewrite is not enabled or `web.config` is missing from the physical folder.
- **Solution:** Verify that `C:\inetpub\wwwroot\EnduranceFrontend\web.config` is present and that the **URL Rewrite** module is installed in IIS Manager.
