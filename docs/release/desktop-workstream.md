# Desktop and release workstream

Date: 2026-08-03

## Goal

Provide a Tauri 2 desktop safety core that turns allowlisted catalog app IDs into
auditable, fixed process invocations, and a draft-only tagged release workflow
for Windows, macOS, and Linux.

## Acceptance checklist

- [x] Serializable platform, provider, environment, plan, and result contracts.
- [x] Environment detection for WinGet, Homebrew, apt, dnf, and Flatpak.
- [x] Plans accept only the backend catalog IDs documented below and report
      unknown or platform-unsupported apps without inventing commands.
- [x] Execution requires a one-time plan ID and confirmation token, runs stored
      executable/argument arrays directly, and never invokes a shell.
- [x] Strict production/development CSP and non-template Tauri identity.
- [x] Rust formatting, 17 unit tests, compile checks, and clippy pass.
- [x] Tag workflow builds all three desktop platforms, generates SHA-256 files,
      and creates a draft GitHub release with generated notes.

## Shared catalog IDs

`chrome`, `firefox`, `vscode`, `git`, `nodejs-lts`, `vlc`, `sevenzip`,
`discord`, `spotify`, `docker-desktop`.

## Safety boundary

The webview can request an allowlisted plan and display its exact commands. It
cannot submit executable paths, arguments, package identifiers, providers, or a
replacement plan for execution. A plan is removed from memory before its first
execution attempt, so tokens cannot be replayed.

## Review corrections

- Tauri development startup uses the existing `dev:bare` web script.
- Linux mappings require an exact package probe; Flatpak additionally requires a
  user-scoped Flathub remote. Probe failure is reported as unsupported.
- Execution is globally serial, streams bounded `install-progress` events, uses
  a 15-minute per-step timeout, and supports `cancel_install_plan`.
- Tagged releases verify version parity and refuse uploads to published releases.
