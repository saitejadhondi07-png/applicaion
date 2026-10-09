Endurance QMS - deployment build
Built 2026-09-25 23:53 from commit 0249731

  EnduranceFrontend\  -> C:\inetpub\wwwroot\EnduranceFrontend
  EnduranceAPI\       -> C:\inetpub\wwwroot\EnduranceAPI

appsettings.json is NOT included - the server keeps its own.

DEPLOY
  1. Stop the EnduranceAPI app pool.
  2. Copy both folders over, leaving appsettings.json in place on the server.
  3. Start the app pool; check http://<server>:5191/health -> "Healthy".
  4. Hard-refresh the browser (Ctrl+F5) to clear cache.
