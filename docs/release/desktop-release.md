# Desktop release runbook

Pushing a tag whose exact form is `vX.Y.Z` starts
`.github/workflows/desktop-release.yml`. Before any build, the workflow requires
`X.Y.Z` to equal both `src-tauri/Cargo.toml` and `tauri.conf.json`. It then builds
Linux (`.deb`, `.AppImage`), macOS (`.dmg`), and Windows (`.msi`, NSIS `.exe`)
bundles, creates one SHA-256 manifest per platform, and creates a **draft** GitHub
release with generated release notes. It never promotes the draft and refuses to
upload assets if the tag already has a non-draft release.

## Promotion gate

Before publishing a draft, release owners must verify all checksums, install each
artifact on a clean machine, and confirm platform signing. The current workflow
does not contain signing credentials or secret values. A public macOS release
still requires Developer ID signing and notarization; Windows reputation also
benefits from an organization code-signing certificate.

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
