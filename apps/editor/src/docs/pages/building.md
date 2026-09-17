# Building & Exporting

Open **Build & Export** from the toolbar or **File** menu.

## Targets

| Target | Status |
|---|---|
| **Web (single HTML file)** | Available |
| **Windows (portable .zip)** | Available |
| Android (APK / AAB) | **Not implemented** in the editor |

### Web build
Produces one `.html` file containing the game runtime, your scene and the assets it uses. It works offline in Chrome, Edge and Android browsers (WebGL 2 required).

- **Release** — for players
- **Debug** — adds a frame-rate counter
- **Quality** — *Auto* adapts to each player's device using your project's performance profile, or fix a level

The game includes a start screen (which also enables sound on phones), a pause key (P), touch controls on phones, and a **Credits** screen with asset attributions and open-source notices.

### Windows build
Produces a `.zip` holding one folder:

| File | What it is |
|---|---|
| `Your-Game.exe` | A 12 KB launcher that opens the game in a Microsoft Edge app window, or in the default browser without Edge |
| `game.html` | The same single-file game as the Web build |
| `README.txt` | How to play |
| `launcher.txt` | Window size |

Players extract the zip and double-click the `.exe`. Nothing is installed and no internet connection is needed. The build works from any device the editor runs on, phones included.

The launcher is **not code-signed**, so Windows SmartScreen may ask players to confirm the first run. Sign it with your own code-signing certificate before a wide release.

## Android apps
Packaging games as Android apps needs the Android SDK, a signing key and Google Play's current requirements, which can't run inside the editor today. It is planned for a later version. Until then, developers can wrap a web build with the Android (Capacitor) shell in the Mythic Forge repository — see `docs/android.md` there.

Before publishing anywhere, read [Publishing](doc:publishing).
