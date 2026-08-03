# Platform installer boundary research

Goal: Verify official platform installation and management boundaries for a third-party Ninite-like orchestrator (Windows, macOS, Linux, Android).

Acceptance: official wording, inference, official URLs, checked 2026-08-03; distinguish ordinary desktop apps from administrator/MDM/device-owner.

Status: complete 2026-08-03. Used Microsoft Learn, Apple Support/Developer,
Ubuntu/Canonical, Flatpak, Red Hat, and Android Developers official documents.
Conclusion: a normal third-party client can orchestrate verified package-manager
commands where the current account/installer permits, but cannot promise silent
system-wide installation across unmanaged platforms. Managed deployment has
separate enrollment/administrator or device-owner prerequisites.
