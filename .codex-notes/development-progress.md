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

- [ ] 2026-08-03 scope clarification: the core v1 journey must continue from a
      web-selected profile into the Tauri client and let the user review,
      confirm, and execute installation of those catalog apps. A browser-only
      dry-run is not an acceptable final journey.
- [x] 2026-08-03: Product boundary research completed.
- [x] 2026-08-03: Stack and deployment targets fixed.
- [x] 2026-08-03: Workspace permission restored and current directory audited.
- [x] 2026-08-03: Better-T-Stack dry-run validated, scaffold generated,
      dependencies installed, and initial production build completed.
- [x] 2026-08-03: GitHub CLI, Cloudflare OAuth, and Neon access verified; empty
      Neon project `late-grass-35738043` created for production integration.
- [x] 2026-08-03: Catalog, profile/share, dry-run plan, Android disclosure,
      allowlisted Tauri executors, release workflow, and API rate limiting built.
- [x] 2026-08-03: Browser E2E passed against the temporary Neon migration branch:
      10-app catalog, three-app profile creation, stable direct share URL, macOS
      plan generation, Android route, exact-origin CORS, and zero console errors.
- [x] 2026-08-03: Added the missing Ninite-style handoff. Browser profiles now
      expose `Install these apps` through a host-only `pakitup://<profile-slug>`
      deep link; Tauri handles cold/warm requests with a bounded FIFO and
      remounts the executor for every profile so plans/tokens cannot cross over.
- [x] 2026-08-03: Handoff regressions passed (5 Web tests, 25 Rust tests), full
      verify and Clippy passed, macOS bundle registered the `pakitup` scheme,
      and independent review found no remaining high/medium issues. No package
      installation was executed; installed-bundle protocol E2E remains pending.
- [x] 2026-08-04 native catalog remediation: the separate `Pakitup Local
      Preview` flavor permits only `http://localhost:3001`, the API accepts a
      validated exact-origin list for browser/Tauri clients, and RPC requests
      fail after 15 seconds instead of loading forever. The rebuilt mounted app
      loaded all 10 catalog entries, opened the existing three-app shared
      profile through `pakitup://`, and generated three exact Homebrew steps.
      The confirmation checkbox remained clear and installation stayed
      disabled. Server 9/9, Web 7/7, typecheck, Biome, and diff-check passed.
      A fresh-context review found and closed a local build URL mismatch: the
      preview build now injects port 3001 independently of the caller's shell
      or default `.env`. Final DMG SHA-256:
      `2ccf2787c2adf1916760053d09b1261a4261aa6be269dedb09ed59ee70163507`.
      The formal release still requires the deployed HTTPS Worker origin and a
      CSP narrowed to that exact origin.
- [x] 2026-08-04 install-result UX hardening: use the verified sevenzip run as
      the fixture for distinguishing real step progress from Homebrew metadata
      noise, suppress empty output events, identify CLI mappings before
      confirmation, and present a concise installed-version/path/result summary
      with the complete raw log still available. Verification must not execute
      another package-manager install. Completed with lifecycle milestones,
      collapsed sanitized raw output, package-kind and launch-hint metadata,
      and 10 passing Web tests.
- [x] 2026-08-04 install-policy closure: native smoke confirmed that rebuilding
      an `install-missing` profile after sevenzip succeeded still produced one
      executable Homebrew step. Carry the profile policy into the local planner,
      use only allowlisted provider-specific read-only presence checks, report
      installed apps as skipped/nothing-to-do, and prove the rebuilt sevenzip
      plan cannot execute another install. The rebuilt mounted app reported
      `0 executable steps`, `0 unsupported`, and `1 already installed`; both
      consent and install controls remained disabled. No install, update, or
      upgrade command ran during verification. Local Preview DMG SHA-256:
      `b102172d4b967310a8598f2e5583a4bc609541c9ca02a0df5a1d4b4df58c1830`.
- [x] 2026-08-04 presence hardening: review identified that provider command
      failures and probe failures must remain Unknown rather than be treated as
      Missing, Flatpak must inspect both user and system scopes, and execution
      must re-check presence immediately before each install-missing step. The
      builder must stop offering install-and-upgrade until an explicit upgrade
      implementation exists. Acceptance requires regression tests and no
      package-manager mutation during verification. Implemented with 41 Rust
      tests, Web typecheck/tests, targeted Biome, and diff-check passing.
- [x] 2026-08-04 provider trust closure: final review requires a pinned official
      Flathub remote identity, DNF non-empty mismatch fail-closed behavior,
      redacted UI-facing probe errors, and a trusted absolute WinGet resolver
      rather than PATH lookup. Acceptance requires regression tests and no
      package-manager mutation during verification.
      Implemented with 43 Rust tests, Web typecheck/tests, targeted Biome, and
      diff-check passing. WinGet stays intentionally fail-closed pending a
      Windows Known Folder API resolver; Windows cross-compilation was not
      available on this macOS host.
- [x] Product implementation complete (production URLs, exact-origin CSP, and
      README deployment/release instructions are in place).
- [x] 2026-08-04 release CI hardening: the tag workflow now has one Linux
      workspace verify/Clippy gate, validates the repository `VITE_SERVER_URL`,
      and derives a release-only exact-origin Tauri CSP override for every
      platform build. The production repository variable is configured.
- [ ] Verification complete.
- [ ] Public deployment and GitHub Release complete.
- [x] 2026-08-04 Cloudflare production bootstrap: deployed Hono and the Vite
      static SPA to `pakitup-server-production.xingencai060.workers.dev` and
      `pakitup-web-production.xingencai060.workers.dev`. Replaced localhost
      CORS entries with the exact public Web origin plus the three supported
      Tauri origins. Public probes passed for root, `/api/health`, a 10-item
      catalog, allowed-origin CORS, and denied-origin CORS. A direct Chrome
      navigation to the seeded three-app share URL loaded through the full
      Static Assets -> Worker -> temporary Neon branch path. The repository
      variable `VITE_SERVER_URL` now points at the production Worker. Neon main
      and the tag-triggered four-platform draft release remain pending.
- [x] 2026-08-04 deploy/release reproducibility closure: checked in a strict,
      opt-in pnpm patch for Alchemy's OAuth workers.dev subdomain read gap,
      rejected the legacy `prod` stage, and proved a clean frozen install plus
      a real `production` redeploy. The redeployed API health/catalog/CORS and
      browser navigation probes returned 200. Release CI now sets up pinned Bun,
      Rust, and Linux Tauri prerequisites; builds Linux x64, Windows x64, macOS
      ARM, and macOS Intel; validates exactly 10 assets; offers a non-publishing
      manual preflight; pins the Tauri build action; and permits tag drafts only
      when the tag is the current main head. Full `pnpm verify`, Clippy, URL
      fixtures, asset fixtures, infra tests, frozen install, YAML parse, and
      diff-check passed. A production macOS ARM DMG was built with exact-origin
      CSP (SHA-256 `95f76fe1155bfb73d0a84b2e6d4a65a42bda573730b50d132096d8a09d74b601`)
      but was not launched because unsigned-bundle execution awaits explicit
      confirmation. Neon main, release tag, and public Release remain pending.
- [x] 2026-08-04 four-platform runner preflight: the first manual run exposed a
      Windows-only CLI entrypoint mismatch that exited successfully without
      writing the release CSP config. Commit `a199cdf` compares native resolved
      paths, passed 20 validator tests plus independent review, and the real
      Windows runner then passed the formerly failing step. Manual run
      `30841278680` passed the full workspace/Clippy gate, Linux x64, Windows
      x64, macOS ARM, macOS Intel, and the exact 10-asset validator. All six
      installers matched their published SHA-256 manifests. The manual run
      correctly skipped draft creation; no tag or Release exists. A read-only
      Neon recheck found main still empty and the verified temporary migration
      branch unchanged at 4 public tables, 10 catalog apps, 34 mappings, and 0
      profiles. Neon main application still awaits explicit approval.
