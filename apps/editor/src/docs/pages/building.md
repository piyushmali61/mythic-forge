# Building & Exporting

Open **Build & Export** from the toolbar or **File** menu.

## What's available in 0.1

| Target | Status |
|---|---|
| **Web (single HTML file)** | Available |
| Android (APK / AAB) | **Not implemented** in the editor |
| Windows (EXE) | **Not implemented** in the editor |

### Web build
Produces one `.html` file containing the game runtime, your scene and the assets it uses. It works offline in Chrome, Edge and Android browsers (WebGL 2 required).

- **Release** — for players
- **Debug** — adds a frame-rate counter
- **Quality** — *Auto* adapts to each player's device using your project's performance profile, or fix a level

The game includes a start screen (which also enables sound on phones), a pause key (P), touch controls on phones, and a **Credits** screen with asset attributions and open-source notices.

## Android and Windows apps
Packaging games as store-ready apps needs platform SDKs, signing keys and store checks that can't run inside the editor today. It is planned for a later version. Until then, developers can wrap a web build with the Android (Capacitor) or desktop (Tauri) shell in the Mythic Forge repository — see `docs/android.md` and `docs/windows.md` there.

Before publishing anywhere, read [Publishing](doc:publishing).
