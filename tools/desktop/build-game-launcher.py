"""Builds the launcher that the editor puts into Windows game exports.

Compiles tools/desktop/GameLauncher.cs with the csc.exe that ships with the .NET Framework 4
(Windows only) and writes:
  apps/editor/public/export/windows-game-launcher.bin    the exe (renamed so it is served as data)
  apps/editor/public/export/windows-game-launcher.json   sizes and SHA-256 of source and binary

The binary is committed because the editor is also built on Linux (CI), where csc isn't
available. packages/renderer/test/... checks that the binary still matches GameLauncher.cs.

Usage: python tools/desktop/build-game-launcher.py   (requires Pillow for the icon)
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "tools" / "desktop" / "GameLauncher.cs"
OUT_DIR = ROOT / "apps" / "editor" / "public" / "export"
CSC = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Microsoft.NET" / "Framework64" / "v4.0.30319" / "csc.exe"


def neutral_icon(path: Path) -> None:
    """A plain "play" icon: exported games are the creator's, not Mythic Bharat Studios'."""
    size = 256
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([8, 8, size - 9, size - 9], radius=48, fill=(32, 30, 38, 255))
    d.polygon([(96, 70), (96, 186), (190, 128)], fill=(236, 236, 240, 255))
    img.save(path, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (256, 256)])


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    if not CSC.exists():
        sys.exit(f"csc.exe not found at {CSC}. This script runs on Windows only.")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="mf-game-launcher-") as tmp:
        icon = Path(tmp) / "game.ico"
        exe = Path(tmp) / "game.exe"
        neutral_icon(icon)
        subprocess.run(
            [str(CSC), "-nologo", "-target:winexe", "-optimize+", f"-out:{exe}", f"-win32icon:{icon}",
             "-r:System.Windows.Forms.dll", str(SOURCE)],
            check=True,
        )
        binary = exe.read_bytes()
    (OUT_DIR / "windows-game-launcher.bin").write_bytes(binary)
    manifest = {
        "source": "tools/desktop/GameLauncher.cs",
        "sourceSha256": sha256(SOURCE.read_bytes()),
        "size": len(binary),
        "sha256": sha256(binary),
        "compiler": "csc.exe (.NET Framework 4, C# 5), /target:winexe /optimize+",
    }
    (OUT_DIR / "windows-game-launcher.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"Wrote {OUT_DIR.relative_to(ROOT)}/windows-game-launcher.bin ({len(binary):,} bytes)")


if __name__ == "__main__":
    main()
