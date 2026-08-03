# Pakitup public v1 development record

## Product outcome

Ship a public, usable Pakitup release that lets a person build a trusted software
profile on the web, share it, open it in the desktop client, review an exact
installation plan, and run supported package-manager installs with explicit
confirmation.

Android is a companion experience: it may open approved Play Store/package
installation flows, but it must not claim silent installation on unmanaged
devices. Desktop support targets Windows, macOS, and Linux.

## Fixed stack

- Web: TanStack Router, deployed as Cloudflare Static Assets
- API: Hono on Cloudflare Workers
- Data: PostgreSQL on Neon Free through Drizzle and Neon's serverless HTTP driver
- Desktop: Tauri 2 artifacts published with GitHub Releases
- API contract: oRPC with shared TypeScript schemas
- Workspace: pnpm + Turborepo

## Public v1 acceptance criteria

- [ ] Responsive public catalog with search, filters, provider/platform support,
      integrity/source information, and accessible keyboard/touch interactions.
- [ ] Profile builder can select apps, choose an installation policy, persist a
      profile through the API, and produce a stable share URL.
- [ ] Hono Worker exposes health, catalog, profile read/write, and desktop plan
      endpoints with validation, rate/error handling, exact-origin CORS, and no
      arbitrary shell command or arbitrary download URL input.
- [ ] Neon schema, migration, and seed data are reproducible and verified against
      the deployed database.
- [ ] Tauri desktop client can import a shared profile, detect the current
      platform, show the exact commands/actions, require confirmation, execute
      allowlisted providers, stream results, and never interpolate raw user input
      into a shell.
- [ ] Supported desktop providers: winget (Windows), Homebrew (macOS), and an
      explicit Linux provider adapter (apt, dnf, or Flatpak according to detected
      availability). Unsupported apps are reported rather than guessed.
- [ ] Android companion route provides Play Store intents/manual confirmation and
      clearly documents managed-device requirements for unattended deployment.
- [ ] Local typecheck, lint, tests, production builds, browser E2E, and a fresh-
      context security/completion review pass.
- [ ] Public web and API URLs are deployed to Cloudflare, production API uses Neon,
      and a public GitHub Release contains versioned Windows/macOS/Linux desktop
      artifacts plus checksums and release notes.
- [ ] README contains local setup, environment variables, database migration,
      deployment, platform limitations, and release instructions.

## Safety invariants

- Catalog IDs map to code/data-owned provider identifiers; clients never accept
  arbitrary executable paths, shell text, or untrusted download URLs.
- Every privileged install remains visible and user-confirmed; OS elevation is
  delegated to the operating system/package manager.
- Secrets stay in Worker/GitHub/Neon secret stores and are never committed or
  returned to the browser.
- Download metadata must use HTTPS and expose source/integrity information.

## Progress

- [x] 2026-08-03: Product boundary research completed.
- [x] 2026-08-03: Stack and deployment targets fixed.
- [x] 2026-08-03: Workspace permission restored and current directory audited.
- [ ] Scaffold generated and reviewed.
- [ ] Product implementation complete.
- [ ] Verification complete.
- [ ] Public deployment and GitHub Release complete.
