"""Copies the built Android APK into downloads/ for the web build's download links.

Build the APK first (see docs/android.md):
    npm run android:sync
    cd apps/android/android && gradlew assembleDebug      (or assembleRelease with your own signing)

Usage: python tools/android/package-apk.py [--release]
A debug APK is signed with the local debug key: fine for testing, not for store distribution.
"""
import json
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VARIANT = "release" if "--release" in sys.argv else "debug"
OUTPUTS = ROOT / "apps" / "android" / "android" / "app" / "build" / "outputs" / "apk" / VARIANT
VERSION = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]

candidates = sorted(OUTPUTS.glob("*.apk")) if OUTPUTS.exists() else []
candidates = [c for c in candidates if not c.name.endswith("-unsigned.apk")]
if not candidates:
    sys.exit(f"No signed {VARIANT} APK in {OUTPUTS}. Build it first (see the header of this file).")
apk = candidates[0]

# Guard against shipping a web build (with downloads/) inside the app.
with zipfile.ZipFile(apk) as z:
    if any(n.startswith("assets/public/downloads/") for n in z.namelist()):
        sys.exit("This APK contains assets/public/downloads/: it was built from a web build. Use `npm run android:sync`.")

dest = ROOT / "downloads" / f"MythicForge-Mobile-v{VERSION}.apk"
dest.parent.mkdir(exist_ok=True)
shutil.copy(apk, dest)
print(f"Copied {apk.name} ({VARIANT}) to {dest.relative_to(ROOT)} ({dest.stat().st_size / 1048576:.2f} MB)")
