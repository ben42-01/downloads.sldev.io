# sldev-io downloads

**sldev-io** is a terminal-first workspace for agentic coding. Run Claude Code, Codex, Cursor
Agent, GitHub Copilot, OpenCode, Gemini CLI or any other CLI agent side by side, and keep your
terminals, tasks, missions, skills, notes and SSH hosts in one window.

🌐 **Website:** https://sldev-io.vercel.app

## Download

Get the latest installer from **[Releases](https://github.com/ben42-01/downloads.sldev.io/releases)**.

| System | File |
|---|---|
| Windows 10/11 | `sldev-io.Setup.<version>.exe` |
| macOS (Apple Silicon) | `sldev-io-<version>-arm64.dmg` |
| macOS (Intel) | `sldev-io-<version>.dmg` |
| Linux (any distro) | `sldev-io-<version>.AppImage` |
| Debian / Ubuntu | `sldev-io_<version>_amd64.deb` |
| Fedora / RHEL | `sldev-io-<version>.x86_64.rpm` |

Beta versions are marked **Pre-release**. During the beta, sldev-io is free for a limited time.

## Installing

The builds are not code-signed yet, so your system will warn you the first time.

- **Windows:** when SmartScreen says "Windows protected your PC", choose **More info → Run anyway**.
- **macOS:** open the `.dmg` and drag sldev-io into Applications. The first time, right-click
  the app and choose **Open**. If macOS says the app "is damaged", run
  `xattr -dr com.apple.quarantine /Applications/sldev-io.app` in Terminal.
- **Linux AppImage:** `chmod +x sldev-io-*.AppImage && ./sldev-io-*.AppImage`. On Ubuntu 24.04
  and later, if it doesn't start, add `--no-sandbox` (AppArmor blocks Electron's sandbox there).
- **Debian / Ubuntu:** `sudo apt install ./sldev-io_*_amd64.deb`
- **Fedora / RHEL:** `sudo dnf install ./sldev-io-*.x86_64.rpm`

### Verify your download

Every release has a `SHA256SUMS.txt`. Compare it with your file:

```bash
sha256sum sldev-io-*.AppImage           # Linux
shasum -a 256 sldev-io-*.dmg            # macOS
Get-FileHash .\sldev-io.Setup.*.exe     # Windows PowerShell
```

## What you need

sldev-io runs your agents; it doesn't ship them. Install at least one agent CLI (for example
`claude`, `codex` or `opencode`) and sign in to it. On first launch, sldev-io checks for git,
the GitHub CLI, Node, Docker and SSH and shows how to install anything that's missing.

## Feedback

Found a bug or have an idea? [Open an issue](https://github.com/ben42-01/downloads.sldev.io/issues)
and include your OS, the sldev-io version (status bar) and the agent you were using.

---

This repository holds release downloads only. The app's source code is private.
