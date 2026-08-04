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

- [x] Responsive public catalog with search, filters, provider/platform support,
      integrity/source information, and accessible keyboard/touch interactions.
- [x] Profile builder can select apps, choose an installation policy, persist a
      profile through the API, and produce a stable share URL.
- [x] Hono Worker exposes health, catalog, profile read/write, and desktop plan
      endpoints with validation, rate/error handling, exact-origin CORS, and no
      arbitrary shell command or arbitrary download URL input.
- [x] Neon schema, migration, and seed data are reproducible and verified against
      the deployed database.
- [x] Tauri desktop client can import a shared profile, detect the current
      platform, show the exact commands/actions, require confirmation, execute
      allowlisted providers, stream results, and never interpolate raw user input
      into a shell.
- [x] Supported desktop providers: winget (Windows), Homebrew (macOS), and an
      explicit Linux provider adapter (apt, dnf, or Flatpak according to detected
      availability). Unsupported apps are reported rather than guessed.
- [x] Android companion route provides Play Store intents/manual confirmation and
      clearly documents managed-device requirements for unattended deployment.
- [x] Local typecheck, lint, tests, production builds, browser E2E, and a fresh-
      context security/completion review pass.
- [x] Public web and API URLs are deployed to Cloudflare, production API uses Neon,
      and a public GitHub Release contains versioned Windows/macOS/Linux desktop
      artifacts plus checksums and release notes.
- [x] README contains local setup, environment variables, database migration,
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

- [x] 2026-08-03 scope clarification: the core v1 journey must continue from a
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
- [x] Verification complete.
- [x] Public deployment and GitHub Release complete.
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
- [x] 2026-08-04 clean-runner installer preflight: install and remove the Linux
      DEB, Windows NSIS/MSI, and mounted macOS DMGs on fresh GitHub-hosted
      runners; structurally extract the Linux AppImage; verify installed
      executables and architecture; then require every platform bundle plus the
      exact 10-asset validator to pass at the current `main` SHA. No tag or
      public GitHub Release may be created by this manual preflight. The first
      run correctly rejected the macOS bundle check because the workflow
      assumed the display name was also the binary name; Tauri emitted the
      actual `CFBundleExecutable` as `app`. Resolve the executable from the
      copied bundle's `Info.plist` before checking its mode and architecture.
      The same run also rejected the Windows smoke script: Tauri's quoted NSIS
      `InstallLocation` was passed directly to a provider-dependent
      `Get-ChildItem -File` call. Normalize registry paths, use the registered
      `MainBinaryName` (with the current Cargo binary `app.exe` as the MSI
      fallback), and address the known `uninstall.exe` under the normalized
      location. Do not accept an arbitrary helper executable as proof.
      The corrected current-main run `30845130263` passed at commit `3e43cce`:
      workspace verification, Clippy, all four platform jobs, clean-runner smoke
      for six installers, and the exact 10-asset validator all succeeded.
- [x] 2026-08-04 Neon main migration and production cutover: completed migration
      `fab16ef4-9790-4362-8a85-f11f6111be07` on main branch
      `br-green-queen-avuggbop` and deleted its temporary branch
      `br-icy-dew-avsr6it2`. Production main contains four public tables, 10
      catalog apps, and 34 provider mappings. After the Worker secret cutover,
      the public Browser -> Cloudflare Static Assets -> Hono Worker -> Neon main
      flow created and read profile
      `pakitup-v0-1-0-release-smoke-test-d60676ce5b` with three apps, while a
      profile unique to the old branch was no longer available through the
      Worker. The older non-default bootstrap branch `br-long-heart-avc4ivm4`
      remains outside this migration cleanup and is not production-bound.
- [x] 2026-08-04 public v0.1.0 release: annotated tag `v0.1.0` points to tested
      commit `3e43cce`. Tag run `30868433544` passed all eight jobs, including
      four platform builds, installer smoke tests, exact asset-set validation,
      and draft creation. The public, non-prerelease GitHub Release contains
      exactly 10 assets; all six installers matched the four SHA-256 manifests.
      `releases/latest` resolves to v0.1.0, the public SPA deep link renders on a
      browser navigation request, and the production page links to that latest
      Release. A fresh-context requirement-to-evidence audit passed 7/7 with no
      public-release blocker.
