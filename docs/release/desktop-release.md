# Desktop release runbook

The release workflow has two deliberately different entry points:

- `workflow_dispatch` takes `release_version` without a leading `v`. It runs the
  complete verify/build/checksum/asset-allowlist pipeline and uploads temporary
  workflow artifacts, but its release job is structurally disabled.
- Pushing an exact `vX.Y.Z` tag runs the same pipeline and may create or update a
  **draft** GitHub Release. The tag must point at the current default-branch
  head; an off-branch or stale-main tag fails before building. The workflow
  never publishes the draft.

Both entry points require `X.Y.Z` to equal `apps/web/src-tauri/Cargo.toml` and
`apps/web/src-tauri/tauri.conf.json`. The Linux verify gate installs the Tauri
system libraries, pins Bun 1.3.13, selects stable Rust, runs `pnpm verify`, and
runs Clippy with warnings denied. Builds then produce:

| Build label | Runner/target | Bundles |
| --- | --- | --- |
| `windows-x86_64` | `windows-latest` | NSIS `.exe`, MSI |
| `macos-aarch64` | `macos-latest` / `aarch64-apple-darwin` | DMG |
| `macos-x86_64` | `macos-15-intel` / `x86_64-apple-darwin` | DMG |
| `linux-x86_64` | `ubuntu-22.04` | DEB, AppImage |

Every asset and checksum manifest carries that build label, so parallel macOS
architectures cannot overwrite one another.

## Release procedure

1. Confirm the public [web app](https://pakitup-web-production.xingencai060.workers.dev/)
   and [API health](https://pakitup-server-production.xingencai060.workers.dev/api/health)
   both return HTTP 200.
2. Confirm the GitHub Actions repository variable `VITE_SERVER_URL` is exactly
   `https://pakitup-server-production.xingencai060.workers.dev`, and confirm
   production CORS includes the public web and fixed Tauri origins.
3. Run `pnpm verify`, Clippy, `pnpm release:validate-api-url`,
   `pnpm release:validate-assets`, and the URL validator against the intended
   API.
4. Run the non-publishing preflight:

   ```bash
   gh workflow run desktop-release.yml -f release_version=0.1.0
   ```

5. Download its four workflow artifacts and smoke-test the expected bundles on
   clean machines. A branch change after this run requires a new preflight.
6. Confirm the tested commit is still the remote `main` head, then push the
   immutable release tag. Review the resulting draft's exact asset allowlist,
   checksums, generated notes, and user guide before manually publishing it.

The tag path refuses to upload to a non-draft release. When updating a draft it
deletes stale files only inside the legacy/current Pakitup-managed asset naming
patterns, then uploads the newly validated allowlist. It never deletes an
unrelated release attachment.

## Promotion gate

v0.1.0 is intentionally unsigned. Before publishing its draft, release owners
must verify all checksums and install each artifact on a clean machine. Windows
SmartScreen and macOS Gatekeeper may refuse to launch it; neither this runbook
nor the public README instructs users to bypass those controls. A blocked user
must stop, wait for a signed build, or build reviewed source locally. Future
public releases should add Windows code signing plus Apple Developer ID signing
and notarization before changing this policy.

The draft body starts with `docs/release/release-body.md`, followed by generated
change notes. Any change to supported systems, filenames, signing, or checksum
instructions must update that template and the README together.

## Tauri invoke contract

All field names below use camelCase in JavaScript.

1. `invoke("detect_environment")` takes no arguments and returns
   `{ platform, architecture, providers[] }`.
2. `invoke("build_install_plan", { appIds: string[] })` returns
   `{ planId, confirmationToken, platform, steps[], unsupported[] }`.
3. After rendering the exact plan and receiving an explicit user confirmation,
   call `invoke("execute_install_plan", { planId, confirmationToken })`. It
   returns `{ planId, status, startedAtMs, finishedAtMs, steps[], unsupported[] }`.
4. `invoke("cancel_install_plan", { planId })` returns `true` when an active or
   queued execution received the cancellation request, otherwise `false`.

Subscribe before execution with `listen("install-progress", handler)`. Event
payloads are `{ planId, sequence, kind, appId?, provider?, stream?, chunk?,
stepStatus?, executionStatus?, atMs }`; `kind` is `planQueued`, `planStarted`,
`stepStarted`, `stepOutput`, `stepFinished`, or `planFinished`. Output events are
bounded to 8 KiB per stream per step. Plans and their steps run serially, with a
15-minute timeout per installer.

The UI must never infer success from the command resolving alone. Inspect the
top-level `status` and every step's `status`, `exitCode`, and bounded output.
Plans are in-memory, one-time objects and do not survive an application restart.
Cancellation kills the directly spawned package-manager process; operating-system
installers already detached by that process may still require native cleanup.

## Shared manifest follow-up

No shared manifest edit is required for the Rust commands. The web integration
must add `@tauri-apps/api/core` invokes inside `apps/web/src` and gate them behind
`isTauri()`; that path belongs to the web workstream. Catalog IDs must stay
aligned with the backend seed listed in `desktop-workstream.md`.
