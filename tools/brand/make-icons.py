"""Generates the Mythic Forge app icons, web icons, Android assets, and desktop assets
from the master Mythic Bharat Studios logo image.

Master source: assets/brand/mythic-bharat-studios-logo.png
Outputs:
- apps/editor/public/icons/logo.svg (SVG wrapper embedding high-res PNG with squircle clip)
- apps/editor/public/icons/logo.png (Full 512x512 master logo)
- apps/editor/public/icons/icon-*.png (Web icons: 32, 180, 192, 512)
- apps/editor/public/icons/maskable-512.png (PWA maskable icon)
- apps/desktop/src-tauri/icons/ (Tauri desktop icons: 32x32, 128x128, icon.png, icon.ico)
- apps/android/android/app/src/main/res/ (Android launcher mipmaps & splash screens)

Usage: python tools/brand/make-icons.py [--all] [--android <res dir>] [--tauri <icons dir>]
"""
import base64
import io
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[2]
MASTER_SRC = ROOT / "assets" / "brand" / "mythic-bharat-studios-logo.png"
PUBLIC = ROOT / "apps" / "editor" / "public" / "icons"
CHARCOAL = (21, 19, 15, 255)


def load_master():
    if not MASTER_SRC.exists():
        raise FileNotFoundError(f"Master logo not found at {MASTER_SRC}")
    return Image.open(MASTER_SRC).convert("RGBA")


def make_squircle_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def make_circle_mask(size):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse([0, 0, size - 1, size - 1], fill=255)
    return mask


def create_logo_svg(img_512_path, out_svg_path):
    """Creates a high-res SVG that embeds the PNG with an elegant squircle clip."""
    with open(img_512_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")

    svg_content = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%" role="img" aria-label="Mythic Bharat Studios Logo">
  <defs>
    <clipPath id="mbs-squircle">
      <rect width="512" height="512" rx="96" ry="96" />
    </clipPath>
  </defs>
  <rect width="512" height="512" rx="96" ry="96" fill="#15130f" />
  <image href="data:image/png;base64,{b64}" width="512" height="512" clip-path="url(#mbs-squircle)" preserveAspectRatio="xMidYMid slice" />
</svg>
"""
    out_svg_path.write_text(svg_content, encoding="utf-8")
    print(f"[icons] Wrote {out_svg_path.relative_to(ROOT)} ({out_svg_path.stat().st_size} bytes)")


def generate_web_icons(master):
    PUBLIC.mkdir(parents=True, exist_ok=True)
    
    # 1. Base 512x512 logo
    logo_512 = master.resize((512, 512), Image.Resampling.LANCZOS)
    logo_path = PUBLIC / "logo.png"
    logo_512.save(logo_path, optimize=True)
    print(f"[icons] Wrote {logo_path.relative_to(ROOT)}")
    
    # 2. logo.svg embedding the high-res 512x512 image
    svg_path = PUBLIC / "logo.svg"
    create_logo_svg(logo_path, svg_path)

    # 3. Standard web icons (32, 180, 192, 512)
    for size in (32, 180, 192, 512):
        resized = master.resize((size, size), Image.Resampling.LANCZOS)
        out = PUBLIC / f"icon-{size}.png"
        resized.save(out, optimize=True)
        print(f"[icons] Wrote {out.relative_to(ROOT)}")

    # 4. Maskable icon: 512x512 with safe-zone padding (80% safe zone = scaled to ~410px centered on charcoal)
    maskable = Image.new("RGBA", (512, 512), CHARCOAL)
    scaled_size = int(512 * 0.82)
    scaled = master.resize((scaled_size, scaled_size), Image.Resampling.LANCZOS)
    offset = (512 - scaled_size) // 2
    maskable.alpha_composite(scaled, (offset, offset))
    maskable_path = PUBLIC / "maskable-512.png"
    maskable.save(maskable_path, optimize=True)
    print(f"[icons] Wrote {maskable_path.relative_to(ROOT)}")


def generate_tauri_icons(master, out_dir):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    
    master.resize((32, 32), Image.Resampling.LANCZOS).save(out_dir / "32x32.png", optimize=True)
    master.resize((128, 128), Image.Resampling.LANCZOS).save(out_dir / "128x128.png", optimize=True)
    master.resize((256, 256), Image.Resampling.LANCZOS).save(out_dir / "128x128@2x.png", optimize=True)
    master.resize((512, 512), Image.Resampling.LANCZOS).save(out_dir / "icon.png", optimize=True)
    
    ico_master = master.resize((256, 256), Image.Resampling.LANCZOS)
    ico_master.save(
        out_dir / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    )
    print(f"[icons] Wrote desktop icons to {out_dir.relative_to(ROOT)}")


def generate_android_icons(master, res_dir):
    res_dir = Path(res_dir)
    densities = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

    for name, factor in densities.items():
        folder = res_dir / f"mipmap-{name}"
        folder.mkdir(parents=True, exist_ok=True)
        launcher_size = round(48 * factor)
        
        # Standard launcher icon (with squircle mask)
        icon = master.resize((launcher_size, launcher_size), Image.Resampling.LANCZOS)
        mask = make_squircle_mask(launcher_size, radius=round(launcher_size * 0.2))
        icon_squircle = Image.new("RGBA", (launcher_size, launcher_size), (0, 0, 0, 0))
        icon_squircle.paste(icon, (0, 0), mask)
        icon_squircle.save(folder / "ic_launcher.png", optimize=True)

        # Round launcher icon
        round_mask = make_circle_mask(launcher_size)
        icon_round = Image.new("RGBA", (launcher_size, launcher_size), (0, 0, 0, 0))
        icon_round.paste(icon, (0, 0), round_mask)
        icon_round.save(folder / "ic_launcher_round.png", optimize=True)

        # Adaptive icon foreground (108dp canvas, mark in safe zone)
        fg_size = round(108 * factor)
        safe_size = round(fg_size * 0.66)
        fg_img = Image.new("RGBA", (fg_size, fg_size), (0, 0, 0, 0))
        scaled = master.resize((safe_size, safe_size), Image.Resampling.LANCZOS)
        offset = (fg_size - safe_size) // 2
        fg_img.alpha_composite(scaled, (offset, offset))
        fg_img.save(folder / "ic_launcher_foreground.png", optimize=True)

    # Android Splash Screens
    for splash in res_dir.glob("drawable*/splash.png"):
        with Image.open(splash) as old:
            w, h = old.size
        canvas = Image.new("RGBA", (w, h), CHARCOAL)
        mark_size = max(64, round(min(w, h) * 0.45))
        mark = master.resize((mark_size, mark_size), Image.Resampling.LANCZOS)
        canvas.alpha_composite(mark, ((w - mark_size) // 2, (h - mark_size) // 2))
        canvas.convert("RGB").save(splash, optimize=True)

    print(f"[icons] Wrote Android launcher icons and splash screens to {res_dir.relative_to(ROOT)}")


def main():
    master = load_master()
    print(f"[icons] Loaded master logo: {master.size} from {MASTER_SRC}")
    
    generate_web_icons(master)

    do_all = "--all" in sys.argv

    if do_all or "--tauri" in sys.argv:
        tauri_dir = Path(sys.argv[sys.argv.index("--tauri") + 1]) if "--tauri" in sys.argv else ROOT / "apps" / "desktop" / "src-tauri" / "icons"
        generate_tauri_icons(master, tauri_dir)

    if do_all or "--android" in sys.argv:
        android_dir = Path(sys.argv[sys.argv.index("--android") + 1]) if "--android" in sys.argv else ROOT / "apps" / "android" / "android" / "app" / "src" / "main" / "res"
        generate_android_icons(master, android_dir)


if __name__ == "__main__":
    main()
