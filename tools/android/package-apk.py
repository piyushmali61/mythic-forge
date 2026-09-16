"""Copies and verifies the built Android APK into the direct download directories.
"""
import os
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APK_SRC = ROOT / "apps" / "android" / "android" / "app" / "build" / "outputs" / "apk" / "debug" / "app-debug.apk"
DOWNLOADS_PUBLIC = ROOT / "apps" / "editor" / "public" / "downloads"
DOWNLOADS_PUBLIC.mkdir(parents=True, exist_ok=True)

if not APK_SRC.exists():
    print(f"APK not found at {APK_SRC}")
    exit(1)

apk_name = "MythicForge-Mobile-v0.1.0.apk"
dest_public = DOWNLOADS_PUBLIC / apk_name

shutil.copy(APK_SRC, dest_public)

size_mb = os.path.getsize(dest_public) / (1024 * 1024)
print(f"Successfully packaged Mobile APK: {dest_public} ({size_mb:.2f} MB)")
