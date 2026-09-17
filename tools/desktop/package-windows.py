"""Packages the portable Windows edition of Mythic Forge into downloads/.

The package is MythicForge.exe (tools/desktop/Launcher.cs, compiled with the csc.exe that ships
with the .NET Framework 4) plus the editor built for app shells (`npm run build:app`), which
leaves out the downloads themselves. The launcher serves the files on 127.0.0.1 and opens them
in a Microsoft Edge app window; see docs/windows.md.

Usage: python tools/desktop/package-windows.py [--skip-build]
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "apps" / "editor" / "dist"
DOWNLOADS = ROOT / "downloads"
CSC = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Microsoft.NET" / "Framework64" / "v4.0.30319" / "csc.exe"
VERSION = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]

README = f"""MYTHIC FORGE {VERSION} - Windows 64-bit portable edition
Produced by Mythic Bharat Studios. Create. Build. Play.

HOW TO RUN
1. Extract the whole folder anywhere on your PC.
2. Double-click MythicForge.exe.

Mythic Forge opens in a Microsoft Edge app window (Edge is part of Windows 10 and 11).
Everything runs on this PC: the launcher serves the app on 127.0.0.1 port 47831 and
needs no internet connection. Projects are saved in the app window's own storage under
%LOCALAPPDATA%\\MythicBharatStudios\\MythicForge. Export important projects
(Project > Export .mfpack) to keep a copy you can move to other devices.

Documentation: https://github.com/piyushmali61/mythic-forge

(c) 2026 Mythic Bharat Studios. All rights reserved. See LICENSE.txt.
Open-source components: app/THIRD_PARTY_NOTICES.md
"""


def run(cmd):
    print("$", " ".join(str(c) for c in cmd))
    subprocess.run(cmd, cwd=ROOT, check=True, shell=(os.name == "nt"))


def main():
    if not CSC.exists():
        sys.exit(f"csc.exe not found at {CSC} (the .NET Framework 4 compiler ships with Windows).")
    if "--skip-build" not in sys.argv:
        run(["npm", "run", "build:app"])
    if not (DIST / "index.html").exists():
        sys.exit(f"No editor build at {DIST}. Run `npm run build:app` first.")
    if (DIST / "downloads").exists():
        sys.exit("The editor build contains downloads/: it is a web build. Run `npm run build:app`.")

    with tempfile.TemporaryDirectory(prefix="mf-windows-") as tmp:
        stage = Path(tmp) / "MythicForge"
        stage.mkdir()
        subprocess.run(
            [str(CSC), "-nologo", "-target:winexe", "-optimize+",
             f"-out:{stage / 'MythicForge.exe'}",
             f"-win32icon:{ROOT / 'apps' / 'desktop' / 'src-tauri' / 'icons' / 'icon.ico'}",
             "-r:System.Windows.Forms.dll",
             str(ROOT / "tools" / "desktop" / "Launcher.cs")],
            check=True,
        )
        shutil.copytree(DIST, stage / "app")
        shutil.copy(ROOT / "THIRD_PARTY_NOTICES.md", stage / "app" / "THIRD_PARTY_NOTICES.md")
        shutil.copy(ROOT / "LICENSE", stage / "LICENSE.txt")
        (stage / "README.txt").write_text(README.replace("\n", "\r\n"), encoding="utf-8")

        DOWNLOADS.mkdir(exist_ok=True)
        out = DOWNLOADS / f"MythicForge-Windows-x64-v{VERSION}.zip"
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
            for path in sorted(stage.rglob("*")):
                if path.is_file():
                    zf.write(path, path.relative_to(stage.parent).as_posix())
    print(f"Created {out.relative_to(ROOT)} ({out.stat().st_size / 1048576:.2f} MB)")


if __name__ == "__main__":
    main()
