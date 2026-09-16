"""Packages the standalone portable Windows PC edition of Mythic Forge.
Contains ONLY the required runtime and compiled application assets.
"""
import os
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "apps" / "editor" / "dist"
LAUNCHER = ROOT / "MythicForge.exe"
DOWNLOADS_PUBLIC = ROOT / "apps" / "editor" / "public" / "downloads"
DOWNLOADS_PUBLIC.mkdir(parents=True, exist_ok=True)

PACKAGE_DIR = ROOT / "dist-windows-staging"
if PACKAGE_DIR.exists():
    shutil.rmtree(PACKAGE_DIR)
PACKAGE_DIR.mkdir(parents=True, exist_ok=True)

# 1. Compile or copy MythicForge.exe
if not LAUNCHER.exists():
    csc = r"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
    icon = ROOT / "apps" / "desktop" / "src-tauri" / "icons" / "icon.ico"
    launcher_cs = ROOT / "tools" / "desktop" / "Launcher.cs"
    cmd = f'"{csc}" /target:winexe /out:"{LAUNCHER}" /win32icon:"{icon}" /r:System.Windows.Forms.dll "{launcher_cs}"'
    os.system(cmd)

shutil.copy(LAUNCHER, PACKAGE_DIR / "MythicForge.exe")

# 2. Copy compiled app/ folder
app_dest = PACKAGE_DIR / "app"
shutil.copytree(DIST, app_dest, ignore=shutil.ignore_patterns("downloads", "*.zip", "*.apk"))

# 3. Create README.txt
readme_content = """========================================================
MYTHIC FORGE v0.1.0 (Windows 64-bit Desktop Edition)
Produced by Mythic Bharat Studios
Create. Build. Play.
========================================================

HOW TO RUN:
1. Extract this folder anywhere on your PC.
2. Double-click "MythicForge.exe" to start creating!

FEATURES:
- 100% Offline-First (No internet required)
- Zero Installation Required (Fully portable)
- Low Battery Consumption (0 FPS render-on-demand when idle)
- Cross-platform .mfpack project compatibility

Documentation & Updates:
https://github.com/piyushmali61/mythic-forge

© 2026 Mythic Bharat Studios. All Rights Reserved.
========================================================
"""
(PACKAGE_DIR / "README.txt").write_text(readme_content, encoding="utf-8")

# 4. Create ZIP archive
zip_name = "MythicForge-Windows-x64-v0.1.0.zip"
zip_public_path = DOWNLOADS_PUBLIC / zip_name

with zipfile.ZipFile(zip_public_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for root, dirs, files in os.walk(PACKAGE_DIR):
        for file in files:
            full_path = Path(root) / file
            rel_path = full_path.relative_to(PACKAGE_DIR)
            zf.write(full_path, arcname=Path("MythicForge") / rel_path)

# Cleanup staging
shutil.rmtree(PACKAGE_DIR)

size_mb = os.path.getsize(zip_public_path) / (1024 * 1024)
print(f"Created PC Download Package: {zip_public_path} ({size_mb:.2f} MB)")
