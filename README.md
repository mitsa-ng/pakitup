# Pakitup

Pakitup turns a curated software catalog into a readable, shareable setup
profile. The public web app prepares platform-specific plans; the Tauri desktop
app is the only component that can execute a plan, and only after an explicit
review and confirmation.

The first public release supports Windows, macOS, and Linux desktop installs.
Android is a companion flow: it explains and hands off approved store installs,
but never claims silent installation on an unmanaged phone.

## Live services

- [Web app](https://pakitup-web-production.xingencai060.workers.dev/)
- [API health](https://pakitup-server-production.xingencai060.workers.dev/api/health)
- [Desktop releases](https://github.com/mitsa-ng/pakitup/releases)

## What ships in v0.1.0

- Searchable catalog with platform and category filters.
- Shareable profiles with a conservative install policy.
- Read-only plans showing the exact provider and package ID for every app.
- Allowlisted desktop adapters for winget, Homebrew, apt, dnf, and Flatpak.
- A single-use confirmation token, serialized execution, bounded output,
  cancellation, and a 15-minute per-step timeout in the desktop engine.
- Exact-origin CORS, structured errors, strict input validation, and a
  Cloudflare-native rate limit for public profile creation.
- Versioned Windows, macOS, and Linux bundles with SHA-256 checksums.

## Architecture

| Layer | Technology | Deployment |
| --- | --- | --- |
| Web | React + TanStack Router | Cloudflare Static Assets |
| API | Hono + oRPC | Cloudflare Workers |
| Data | PostgreSQL + Drizzle | Neon |
| Desktop | Tauri 2 + Rust | GitHub Releases |
| Workspace | pnpm + Turborepo | GitHub |

Pakitup never accepts an executable path, shell fragment, package-manager
arguments, or download URL from a public API request. Catalog IDs are resolved
to code- and data-owned provider identifiers.

## Requirements

- Node.js 22 or newer
- pnpm through Corepack
- Bun 1.3.13 for the JavaScript test suites
- Rust stable and the platform prerequisites required by Tauri 2
- A PostgreSQL database (Neon is used in production)
- A Cloudflare account for deployment

## Local development

Install dependencies:

```bash
corepack enable
pnpm install --frozen-lockfile
```

Create `apps/server/.env`:

```dotenv
DATABASE_URL=postgresql://...
CORS_ORIGIN=http://localhost:3001
RATE_LIMIT_KEY_SECRET=replace-with-at-least-32-random-characters
```

Create `apps/web/.env`:

```dotenv
VITE_SERVER_URL=http://localhost:3000
```

Then start the workspace:

```bash
pnpm dev
```

Alchemy normally serves the API on port 3000 and the web app on port 3001. If
either port is occupied, use the URLs printed by Alchemy and update both local
environment files so `VITE_SERVER_URL` points to the API and `CORS_ORIGIN`
contains the exact, comma-separated origins that may call it. `CORS_ORIGIN`
accepts exact `http(s)` origins and the fixed Tauri origins only; do not use
paths or wildcards. Restart `pnpm dev` after changing either file.

## Database

The reproducible schema and catalog seed are stored in:

- `packages/db/src/migrations/0000_pakitup_v1.sql`
- `packages/db/src/migrations/0001_seed_catalog.sql`

For an empty development database:

```bash
pnpm db:migrate
```

To inspect the database:

```bash
pnpm db:studio
```

Do not use `db:push` as an unreviewed production migration. Apply migrations
through a temporary Neon branch, verify them there, and only then promote the
same SQL to the production branch.

## Verification

Run the complete local gate:

```bash
pnpm verify
cargo clippy --manifest-path apps/web/src-tauri/Cargo.toml --all-targets -- -D warnings
```

`pnpm verify` includes TypeScript checks, Biome, API and Worker tests, Rust
tests, and production web/API builds.

Build a local desktop bundle:

```bash
pnpm --filter web desktop:build
```

For a local-release smoke test against an API running on port 3001, build the
separate, clearly named local-preview bundle:

```bash
pnpm --filter web desktop:build:local
```

This bundle alone permits `http://localhost:3001` and depends on that local API
being available; it is not a distributable release. A formal desktop release
must embed the fixed HTTPS API origin and keep the production CSP restricted to
that exact origin.

Planning is safe to test. Executing a plan may install software and should only
be tested on a disposable machine or with package IDs you explicitly chose.

## Cloudflare deployment

Authenticate Alchemy with a Cloudflare profile, provide production values in
the ignored environment files, and deploy a named production stage:

```bash
cd packages/infra
CLOUDFLARE_WORKERS_SUBDOMAIN=xingencai060 \
  pnpm exec alchemy deploy alchemy.run.ts \
  --stage production --env-file .env
```

The `production` stage name is canonical. The deployment rejects the legacy
`prod` spelling so it cannot create a second set of Workers accidentally.

The deployment provisions:

- a Hono Worker with the Neon connection string stored as a secret;
- a Cloudflare rate-limit binding for profile creation;
- the TanStack Router build as Cloudflare Static Assets;
- the web build with its API URL injected by the deployment.

Set `CORS_ORIGIN` to the final exact web origin and redeploy if the first
deployment creates a new hostname. Keep `DATABASE_URL` and
`RATE_LIMIT_KEY_SECRET` out of Git and browser-visible variables.

## Desktop releases

The `desktop-release.yml` workflow runs for tags matching `v*`. It verifies
that the tag, `Cargo.toml`, and `tauri.conf.json` versions match, runs the full
workspace verification and Rust Clippy gate once on Linux, then builds:

- Windows x64: NSIS and MSI
- macOS Apple Silicon (`aarch64`): DMG
- macOS Intel (`x86_64`): DMG
- Linux x64: DEB and AppImage

Before creating a tag, set the GitHub Actions **repository variable**
`VITE_SERVER_URL` to the exact HTTPS production API URL. This is intentionally a
repository variable, not a secret: Vite embeds it in the desktop web bundle. It
must not use `http`, `localhost`, credentials, a query, or a fragment. You can
run the same validator locally (with the intended URL) before tagging:

```bash
VITE_SERVER_URL=https://pakitup-server-production.xingencai060.workers.dev \
  node docs/release/validate-production-api-url.mjs
pnpm release:validate-api-url
```

The workflow rejects an invalid or missing variable before testing/building and
uses its URL origin to generate a release-only Tauri CSP override. The resulting
production `connect-src` must contain that exact API origin rather than a broad
`https:` source; keep the variable, deployed API origin, and CSP in sync.

Before tagging, run the manual preflight from GitHub Actions or the CLI:

```bash
gh workflow run desktop-release.yml -f release_version=0.1.0
```

`workflow_dispatch` runs the same version check, verification, four-platform
build matrix, checksum generation, complete asset-allowlist validation, and
artifact upload, but it cannot create or modify a GitHub Release. Tag only after
that preflight passes, the repository variable matches the live API above,
production `/api/health` returns 200,
browser and Tauri CORS origins are checked, and the version files match the
intended `vX.Y.Z` tag.

Only a pushed tag can create or update a draft GitHub Release. The workflow
generates SHA-256 manifests and reconciles only Pakitup-managed assets from an
older draft. Review every asset and checksum, test on clean machines, and
publish the draft manually.

v0.1.0 is unsigned. Windows SmartScreen and macOS Gatekeeper may therefore show
an unverified-developer warning. Code signing and Apple notarization are release
hardening work, not something this project bypasses.

## Install a desktop release

Download from [GitHub Releases](https://github.com/mitsa-ng/pakitup/releases).
The filename prefix identifies the intended system and CPU:

| System | Release asset |
| --- | --- |
| Windows 10/11 x64 | `windows-x86_64-Pakitup_0.1.0_x64-setup.exe` or the matching `.msi` |
| macOS Apple Silicon | `macos-aarch64-Pakitup_0.1.0_aarch64.dmg` |
| macOS Intel | `macos-x86_64-Pakitup_0.1.0_x64.dmg` |
| Linux x64 | `linux-x86_64-Pakitup_0.1.0_amd64.deb` or the matching `.AppImage` |

v0.1.0 does not include Windows ARM64 or Linux ARM64 bundles. Package-manager
features also depend on a supported provider being available on the machine.

Download the matching `<platform>-SHA256SUMS.txt` manifest. Compare the chosen
installer's SHA-256 value with its exact manifest line before opening it:

```bash
# Linux
sha256sum linux-x86_64-Pakitup_0.1.0_amd64.deb

# macOS Apple Silicon (use the x86_64 filename for an Intel Mac)
shasum -a 256 macos-aarch64-Pakitup_0.1.0_aarch64.dmg
```

On Windows PowerShell:

```powershell
Get-FileHash .\windows-x86_64-Pakitup_0.1.0_x64-setup.exe -Algorithm SHA256
```

After the hash matches:

- Windows: open the NSIS `.exe`, or use the `.msi` where MSI deployment is
  required.
- macOS: open the `.dmg` and drag Pakitup to Applications.
- Debian/Ubuntu: `sudo apt install ./linux-x86_64-Pakitup_0.1.0_amd64.deb`.
- Other supported x64 Linux systems: mark the verified AppImage executable and
  run it from the desktop or terminal.

These v0.1.0 bundles are unsigned. Windows SmartScreen or macOS Gatekeeper may
refuse to open them. If the operating system blocks a bundle, stop and use a
signed future release or build the reviewed source yourself; do not disable or
bypass platform security controls. Never proceed when a checksum differs.

## Platform behavior

- **Windows:** exact winget package IDs; elevation remains an OS decision.
- **macOS:** exact Homebrew formula/cask arguments.
- **Linux:** only a verified available apt, dnf, or Flathub package is planned;
  unsupported mappings are reported instead of guessed.
- **Android:** Play Store/manual system confirmation only for consumer devices.
  Unattended installs belong to a separately governed device-owner product.

## Project structure

```text
apps/
  server/             Hono Worker
  web/                TanStack Router UI and Tauri shell
packages/
  api/                oRPC contract, validation, and domain logic
  db/                 Drizzle schema, repositories, migrations, and seed
  env/                browser/server environment validation
  infra/              Alchemy Cloudflare resources
  ui/                 shared UI primitives
docs/release/         version and checksum tooling
```

## License

No license has been selected yet. All rights are reserved until a license file
is added.
