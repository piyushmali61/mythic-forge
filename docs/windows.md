# Mythic Forge — Windows & Desktop

## 1. Distribution paths (§3, §12)

| Path | Status | What it is |
|---|---|---|
| **Portable edition** (`downloads/MythicForge-Windows-x64-v*.zip`) | Built and tested on Windows 11 | `MythicForge.exe` + the editor build. Opens in a Microsoft Edge app window. No installer, no admin rights. |
| **PWA** | Offline service worker tested in a Chromium browser | Open the web build and use the browser's *Install* button. Works offline after the first visit. |
| **Tauri 2 shell** (`apps/desktop`) | **Not built or tested yet** (needs a Rust toolchain) | Native window using WebView2, with installers (NSIS/MSI). Planned as the store-ready desktop build. |

### Portable edition

`tools/desktop/Launcher.cs` is a small C# program (about 190 KB compiled, including the icon), built with the `csc.exe` that ships with the .NET Framework 4 on every Windows 10/11 PC. It:

1. Serves the `app` folder next to the exe on `http://127.0.0.1:47831/` (fixed port; falls back to 47832–47835 in order if that port is taken by another program, and says so).
2. Opens that address with `msedge.exe --app=… --user-data-dir=%LOCALAPPDATA%\MythicBharatStudios\MythicForge\EdgeProfile`, so Mythic Forge gets its own window and its own storage.
3. Stops serving when that Edge window (profile) closes. Starting the exe again while it is running opens a second window on the same server instead of starting another one.
4. Without Edge, opens the default browser and keeps serving until the user clicks OK on the "running" message.

**Why the port is fixed:** projects are stored in the browser storage (IndexedDB) of the page's origin, and the origin includes the port. A different port on each launch would hide every saved project. Projects saved in the old v0.1.0 zip (random port) cannot be recovered by the new launcher. Export important projects as `.mfpack`.

**Security of the local server:**
- Listens on `127.0.0.1` only. Serves only files inside `app\` (URL-decoded segments are checked, `..`, `:` and invalid file-name characters are rejected, and the final full path must stay under `app\`).
- Rejects requests whose `Host` header is not `127.0.0.1:<port>` or `localhost:<port>`. This stops DNS-rebinding pages from reading the app.
- `GET`/`HEAD` only, `X-Content-Type-Options: nosniff`, no directory listings.
- The app itself keeps its Content-Security-Policy (see [security.md](security.md)).

**Build the zip:**
```bash
python tools/desktop/package-windows.py
```
The script runs `npm run build:app`, compiles the launcher, and writes `downloads/MythicForge-Windows-x64-v<version>.zip`. It includes `LICENSE.txt`, `README.txt` and `app/THIRD_PARTY_NOTICES.md`. It refuses a web build that contains `downloads/`.

**Manual test** (serve only, no browser window):
```bash
MythicForge.exe --no-browser
```
Then `curl http://127.0.0.1:47831/` returns the app, and `curl --path-as-is http://127.0.0.1:47831/%2e%2e/LICENSE.txt` is refused.

The exe is not code-signed, so Windows SmartScreen may warn on first launch. Sign it with the studio's code-signing certificate before a wide release; the certificate must never be committed.

### Web build vs app build

`npm run build` produces the **web** build. It includes `downloads/` and shows the download buttons in the browser.

`npm run build:app` (Vite mode `app`) produces the build hosted by the Android, portable and Tauri shells, with no downloads inside. Without this split, every APK would contain the previous APK. Note that mode `app` loads `.env.app` / `.env.app.local`, not `.env.production`.

---

## 2. Exporting games for Windows (§34)

**Build & Export → Windows (portable .zip)** in the editor wraps the single-file web build:

```
Your-Game/
  Your-Game.exe    launcher (tools/desktop/GameLauncher.cs, about 12 KB)
  game.html        the game (same file as the Web build; runs from file://)
  launcher.txt     title and window size (key=value)
  README.txt
```

- **The launcher** opens `game.html` with `msedge --app=file:///…`, so the game gets its own window using the player's normal Edge profile, then exits. Without Edge, it opens the file in the default browser. It starts no server and reads only its own folder. Values from `launcher.txt` are only a title (used in error messages) and a clamped window size.
- **Neutral icon:** exported games belong to their creators, so the launcher uses a plain play icon rather than the Mythic Bharat Studios logo.
- **Prebuilt binary:** the editor ships the exe as `apps/editor/public/export/windows-game-launcher.bin`, so exports work offline on any device. Rebuild it on Windows after changing `GameLauncher.cs`:
  ```bash
  python tools/desktop/build-game-launcher.py
  ```
  `apps/editor/test/windows-export.test.ts` fails if the binary no longer matches the source's SHA-256 (recorded in `windows-game-launcher.json`).
- **Not code-signed:** SmartScreen may warn on first run. Studios that publish widely should sign the exe.
- **Verified 2026-09-17** on Windows 11: the demo exported as a 405 KB zip. After extraction, the exe opened a 1280×720 Edge app window titled with the game name, showing the game's start screen.

---

## 3. Keyboard shortcuts (§30)

Editor shortcuts (`apps/editor/src/editor/EditorScreen.tsx`). They are ignored while typing in a field or when a dialog is open.

| Shortcut | Action |
|---|---|
| `Ctrl + S` | Save the project |
| `Ctrl + P` | Play / pause |
| `Escape` | Stop play mode (restores the edit-time scene) |
| `Ctrl + Z` | Undo |
| `Ctrl + Shift + Z` or `Ctrl + Y` | Redo |
| `Ctrl + D` | Duplicate the selected object |
| `Delete` / `Backspace` | Delete the selected object |
| `F` | Frame the selected object |
| `W` / `E` / `R` | Move / rotate / scale gizmo |
| `Ctrl + K` | Search (on the Home, Projects, Assets, Learn and Settings screens) |

---

## 4. Desktop quality (§22)

Desktops start at **Medium**. A discrete GPU raises that to **High**, and a high-end GPU with 8 or more CPU cores to **Ultra**. Older integrated graphics drop to **Low** (`packages/core/src/perf/device-tier.ts`). The top presets in `packages/core/src/perf/profiles.ts` are:

| Preset | Shadow map | Antialiasing | Max pixel ratio | Draw distance | Play-mode FPS cap |
|---|---|---|---|---|---|
| High | 1024 | on | 2 | 600 m | 60 |
| Ultra | 2048 | on | 2.5 | 1000 m | 60 |

Frame-rate caps of 90 and 120 FPS can be chosen in **Settings → Graphics**. The editor still renders only when something changes, so an idle editor uses no GPU time on desktop either.

---

## 5. Tauri build (not yet verified)

Requirements: Node.js ≥ 22.18, the Rust toolchain (`rustup`), and WebView2 (included in Windows 10/11).

```bash
cd apps/desktop
npm run build        # runs `npm run build:app` first (tauri.conf.json → beforeBuildCommand)
```

Installers are written to `apps/desktop/src-tauri/target/release/bundle/`. Before the first Tauri release:
- build and test it;
- inventory Rust crate licences (`cargo about`);
- sign the installer.
