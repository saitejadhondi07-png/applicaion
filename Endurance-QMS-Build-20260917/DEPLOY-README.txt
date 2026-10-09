Endurance QMS - deployment build
Built 2026-09-17 12.04 from commit 0d6c79f (fix/security-and-report-integrity)

WHAT IS IN THIS ZIP
  EnduranceFrontend\  -> copy to C:\inetpub\wwwroot\EnduranceFrontend
  EnduranceAPI\       -> copy to C:\inetpub\wwwroot\EnduranceAPI

appsettings.json is deliberately NOT included. The server keeps its own
(connection string, Jwt:Key, AllowedOrigins). Do not overwrite it.
appsettings.example.json is included for reference only.

DEPLOY
  1. Stop the EnduranceAPI site / app pool in IIS Manager.
  2. Copy EnduranceAPI\*      over C:\inetpub\wwwroot\EnduranceAPI
     Copy EnduranceFrontend\* over C:\inetpub\wwwroot\EnduranceFrontend
     (leave the existing appsettings.json in place)
  3. Start the app pool, then browse http://<server>:5191/health - expect "Healthy".

WHAT CHANGED
  - Battery pack IDs are no longer truncated. A filename with a mistyped ID
    (e.g. THA163301F7F2, 13 characters) used to become THA163301F7F - a pack that
    was never tested. It is now rejected with a message naming the token and its
    length so the operator can correct the filename.
  - Report rows print in the order the operator selected the files, not
    alphabetically by pack ID.
  - Compiled-sheet uploads no longer read the charge columns from the discharge
    columns (DCH_DeltaV was being scored as CH_DeltaV).
  - A batch is no longer rejected wholesale because one filename contains "..".
  - Security: the anonymous password-reset endpoint is removed - it allowed
    takeover of any account including admin. Resets are now admin-only from the
    Users page. Tested By / Reviewed By / Approved By are taken from the signed-in
    user instead of the browser, and only a quality engineer may review and only a
    quality manager may approve.

NOTES
  - Existing reports are not rewritten. A batch must be re-uploaded to be printed
    in selection order.
  - After this deploy, users must sign in again if their password was reset.