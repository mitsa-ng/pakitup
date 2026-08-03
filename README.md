# Pakitup

Pakitup turns a curated software catalog into a readable, shareable setup
profile. The public web app prepares platform-specific plans; the Tauri desktop
app is the only component that can execute a plan, and only after an explicit
review and confirmation.

The first public release supports Windows, macOS, and Linux desktop installs.
Android is a companion flow: it explains and hands off approved store installs,
but never claims silent installation on an unmanaged phone.

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
ALCHEMY_STAGE=prod pnpm deploy
```

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

- Windows: NSIS and MSI
- macOS: DMG
- Linux: DEB and AppImage

Before creating a tag, set the GitHub Actions **repository variable**
`VITE_SERVER_URL` to the exact HTTPS production API URL. This is intentionally a
repository variable, not a secret: Vite embeds it in the desktop web bundle. It
must not use `http`, `localhost`, credentials, a query, or a fragment. You can
run the same validator locally (with the intended URL) before tagging:

```bash
VITE_SERVER_URL=https://api.example.com node docs/release/validate-production-api-url.mjs
pnpm release:validate-api-url
```

The workflow rejects an invalid or missing variable before testing/building and
uses its URL origin to generate a release-only Tauri CSP override. The resulting
production `connect-src` must contain that exact API origin rather than a broad
`https:` source; keep the variable, deployed API origin, and CSP in sync.

Tag only after the variable and production API/CORS settings have been checked,
`pnpm verify`, Clippy, and the URL validator pass locally, and the version files
match the intended `vX.Y.Z` tag. The workflow generates SHA-256 files and only
creates or updates a draft GitHub Release. Review every asset and checksum, test
on clean machines, and publish the draft manually.

v0.1.0 is unsigned. Windows SmartScreen and macOS Gatekeeper may therefore show
an unverified-developer warning. Code signing and Apple notarization are release
hardening work, not something this project bypasses.

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
