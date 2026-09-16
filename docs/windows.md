# Mythic Forge — Windows & Desktop Platform Architecture

## 1. Overview & Architecture (§3, §12)

On Windows desktop PCs and laptops, Mythic Forge supports two distribution paths:

### A. Tauri 2 Desktop Shell (`apps/desktop`)
- **Runtime:** High-performance Rust shell leveraging Windows Edge WebView2.
- **Binary Footprint:** Approximately 5–10 MB (orders of magnitude lighter than 150 MB+ Electron applications).
- **Native OS Integration:** Native window chrome, file dialogs, hardware acceleration, and system menus.

### B. Progressive Web Application (PWA)
- **Zero Install Requirement:** Works in Chrome and Edge out-of-the-box.
- **Offline Service Worker (`sw.js`):** Automatically precaches all engine bundles, styles, and catalogs for offline desktop operation.
- **Installable:** Click the "Install Mythic Forge" button in the browser address bar to install as a standalone desktop application.

---

## 2. Desktop Keyboard Navigation & Shortcuts (§30)

Mythic Forge is optimized for high-velocity desktop workflows:

| Shortcut | Action | Description |
|---|---|---|
| **`Ctrl + S`** | Save Project | Atomically persists scene changes with rolling backup rotation. |
| **`Ctrl + Z`** | Undo | Rolls back the last reversible command in `CommandHistory`. |
| **`Ctrl + Shift + Z`** | Redo | Re-applies the next command in `CommandHistory`. |
| **`Ctrl + D`** | Duplicate | Duplicates selected scene entity with transform offset. |
| **`Delete` / `Backspace`** | Delete | Removes the selected entity from the active scene. |
| **`F`** | Focus Selection | Centers and frames the viewport camera on the selected object. |
| **`W`** | Translate Gizmo | Switches transform gizmo to Move mode. |
| **`E`** | Rotate Gizmo | Switches transform gizmo to Rotate mode. |
| **`R`** | Scale Gizmo | Switches transform gizmo to Scale mode. |
| **`Ctrl + K`** | Global Search | Opens fast search overlay for projects, assets, templates, and docs. |
| **`Space`** | Play / Pause | Starts or pauses runtime simulation. |
| **`Escape`** | Stop / Deselect | Stops Play Mode and restores the editor scene snapshot. |

---

## 3. High-End Desktop Performance Profile (§22)

When running on desktop hardware with discrete GPUs (NVIDIA GeForce / AMD Radeon / Intel Arc):
- **Ultra Quality Profile:** Unlocks $2048\times 2048$ soft shadow maps, $4\times$ MSAA anti-aliasing, and extended draw distances up to $2000\text{ m}$.
- **High Refresh Rates:** Automatically supports 60, 90, 120, and 144 Hz monitors when enabled in **Settings → Graphics**.
- **Energy Preservation:** Even on high-end desktop PCs, the render-on-demand loop keeps GPU fans quiet and wattage low while the editor is idle.

---

## 4. Desktop Build Instructions

### Prerequisites
- Node.js $\ge 22.18$
- Rust toolchain (`rustup`, `cargo`)
- Windows 10/11 with Microsoft Edge WebView2 (installed by default)

### Building the Tauri 2 Binary
```bash
# 1. Build the editor web bundle
npm run build

# 2. Build the Tauri desktop executable
cd apps/desktop
npm run build
```
*The compiled native Windows executable is output to `apps/desktop/src-tauri/target/release/mythic-forge.exe`.*
