Endurance QMS - deployment build
Built 2026-09-17 13.23 from commit 164e70c (fix/security-and-report-integrity)

WHAT IS IN THIS ZIP
  EnduranceFrontend\  -> copy to C:\inetpub\wwwroot\EnduranceFrontend
  EnduranceAPI\       -> copy to C:\inetpub\wwwroot\EnduranceAPI

appsettings.json is deliberately NOT included. The server keeps its own
(connection string, Jwt:Key, AllowedOrigins). Do not overwrite it.

DEPLOY
  1. Stop the EnduranceAPI site / app pool in IIS Manager.
  2. Copy EnduranceAPI\*      over C:\inetpub\wwwroot\EnduranceAPI
     Copy EnduranceFrontend\* over C:\inetpub\wwwroot\EnduranceFrontend
     (leave the existing appsettings.json in place)
  3. Start the app pool, then browse http://<server>:5191/health - expect "Healthy".

NEW IN THIS BUILD
  - Excel-heavy uploads no longer exhaust memory. A 193-file batch (61 xlsx,
    854 MB) previously had not finished after 17 minutes and reached 5.5 GB; it
    now completes in 3.7 minutes at about 1.9 GB. Raw exports are parsed once
    instead of twice, only the ten scored columns are held per row, and the
    number of workbooks open at once is capped. CSV speed is unchanged.

ALSO IN THIS BUILD (from the previous one)
  - Mistyped pack IDs are no longer truncated into a different, valid-looking
    pack. THA163301F7F2 used to become THA163301F7F - a pack never tested. The
    file is now rejected with a message naming the token and its length.
  - Report rows print in the order the operator selected the files.
  - Compiled-sheet uploads no longer read charge values from discharge columns.
  - Security: anonymous password reset removed (allowed takeover of any account
    including admin); resets are admin-only from the Users page. Tested By /
    Reviewed By / Approved By come from the signed-in user, and only a quality
    engineer may review / quality manager may approve.

NOTES
  - Existing reports are not rewritten. Re-upload a batch to get selection order.
  - A file whose name has no valid pack ID is rejected by name rather than being
    given an invented ID. Rename it and upload again.