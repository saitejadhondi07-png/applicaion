# Endurance QMS - Mendewadi Plant

Quality management system for CDC battery pack testing. Test engineers upload
Excel/CSV test exports, the backend parses them, applies pass/fail thresholds, and
drives an upload -> review -> approve workflow with role-based access.

| Layer | Stack |
|---|---|
| Frontend | React 19 + Vite 8 (`src/`) |
| Backend | ASP.NET Core `net10.0` + EF Core + SQL Server (`backend/`) |
| Tests | Vitest (`src/test/`), xUnit (`tests/Endurance.API.Tests/`) |

Roles: `admin`, `quality_manager`, `quality_engineer`, `test_engineer`.

## First-time setup

The backend config holds a signing key and connection string, so it is **not** in
version control. Create it from the tracked template:

```bash
cp backend/appsettings.example.json backend/appsettings.json
```

Then edit `backend/appsettings.json` and set:

- `ConnectionStrings:DefaultConnection` - your SQL Server instance.
- `Jwt:Key` - a **unique** random string of 64+ characters. Anyone who knows this
  value can mint valid tokens for any user and role, so never reuse the template
  value or share it between environments. The API logs a warning at startup if it
  detects a placeholder or a key shorter than 32 characters.

`Jwt:Key` can also be supplied out-of-band as the `Jwt__Key` environment variable,
which takes precedence and keeps the secret off disk entirely.

On a database with no users, the API seeds an admin account. Set
`DefaultAdminPassword` (or the `DEFAULT_ADMIN_PASSWORD` environment variable) to
choose its password; otherwise one is generated and written to the startup log
once. Existing databases are never modified.

## Running

```bash
npm install
npm run dev                 # frontend on :5173

cd backend && dotnet run    # API on :5191
```

The frontend resolves the API URL at runtime (see `src/config.js`): it prefers
`window.__RUNTIME_CONFIG__.API_BASE_URL` from `public/runtime-config.js`, then the
build-time `VITE_API_BASE_URL`, then falls back to port 5191 on whatever host served
the page. That means one build works on any server IP without recompiling.

## Tests

```bash
npm test                                          # frontend
dotnet test tests/Endurance.API.Tests             # backend threshold logic
```

## CORS

The API accepts an origin when its host matches the host the request arrived on, or
when it is listed under `AllowedOrigins` in `appsettings.json`. Because the frontend
always targets its own hostname on port 5191, this works on any deployment IP without
configuration. Add an entry to `AllowedOrigins` only if the frontend is served from a
*different* host than the API.

## Deployment

See `DEPLOYMENT_IIS.md`. Note that `appsettings.json` is not in version control, so it
must be present on the target machine with a real `Jwt:Key`.
