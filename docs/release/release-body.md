<!-- pakitup-user-guide -->

Pakitup v0.1.0 is an unsigned preview. Verify the SHA-256 manifest before
opening an installer. If Windows SmartScreen or macOS Gatekeeper blocks the
application, stop; do not disable or bypass operating-system security controls.

## Choose an asset

| System | Asset |
| --- | --- |
| Windows 10/11 x64 | `windows-x86_64-…-setup.exe` or `windows-x86_64-….msi` |
| macOS Apple Silicon | `macos-aarch64-….dmg` |
| macOS Intel | `macos-x86_64-….dmg` |
| Linux x64 | `linux-x86_64-….deb` or `linux-x86_64-….AppImage` |

Download the matching `*-SHA256SUMS.txt` file with the installer. Installation
and checksum commands are documented in the
[README](https://github.com/mitsa-ng/pakitup#install-a-desktop-release).

The desktop app shows the exact package-manager action and asks for confirmation
before making a change. Test installation plans only with apps you intentionally
selected.
