Endurance QMS - deployment build
Built 2026-09-17 21.40 from commit 0249731

  EnduranceFrontend\  -> C:\inetpub\wwwroot\EnduranceFrontend
  EnduranceAPI\       -> C:\inetpub\wwwroot\EnduranceAPI

appsettings.json is NOT included - the server keeps its own.

FIXES THE BLANK LOGIN PAGE
  The previous build threw "successMsg is not defined" and rendered a blank
  login screen. Fixed. The frontend bundle filename has changed, so clear the
  browser cache (Ctrl+F5) after copying, or the old broken index-CY16BM00.js
  may be served from cache.

ALSO IN THIS BUILD
  - Mistyped pack IDs rejected by name instead of silently truncated.
  - Report rows print in file-selection order.
  - Charge values no longer read from discharge columns.
  - Excel-heavy batches no longer exhaust memory (193 files: 3.7 min, ~2 GB).
  - Access control hardening; password reset is admin-only from Users page.

DEPLOY
  1. Stop the EnduranceAPI app pool.
  2. Copy both folders over, leaving appsettings.json in place.
  3. Start the app pool; check http://<server>:5191/health -> "Healthy".
  4. Hard-refresh the browser (Ctrl+F5) before testing the login page.