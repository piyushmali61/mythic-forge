"""Generates the Mythic Forge app icons from the original logo geometry below.

The same geometry is used by apps/editor/public/icons/logo.svg. Requires Pillow.
Usage: python tools/brand/make-icons.py [--android <res dir>]
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "apps" / "editor" / "public" / "icons"

CHARCOAL = (21, 19, 15, 255)
GOLD = (214, 168, 79, 255)
SAFFRON = (240, 138, 44, 255)
EMBER = (255, 210, 122, 255)

# Logo geometry in a 64-unit box (keep in sync with logo.svg).
FLAME = [
    ("M", (32, 15)),
    ("C", (37, 22), (42, 28), (42, 36)),
    ("C", (42, 42), (37.5, 46), (32, 46)),
    ("C", (26.5, 46), (22, 42), (22, 36)),
    ("C", (22, 31), (25, 27.5), (27.5, 24.5)),
    ("C", (27.8, 28.5), (29.2, 31), (31.5, 31.5)),
    ("C", (30, 26), (30.2, 20), (32, 15)),
]
INNER = [
    ("M", (32, 31)),
    ("C", (34.5, 34), (36, 36), (36, 38.5)),
    ("C", (36, 40.8), (34.2, 42.5), (32, 42.5)),
    ("C", (29.8, 42.5), (28, 40.8), (28, 38.5)),
    ("C", (28, 36), (30, 33.5), (32, 31)),
]


def bezier(p0, p1, p2, p3, steps=24):
    pts = []
    for i in range(1, steps + 1):
        t = i / steps
        mt = 1 - t
        x = mt**3 * p0[0] + 3 * mt**2 * t * p1[0] + 3 * mt * t**2 * p2[0] + t**3 * p3[0]
        y = mt**3 * p0[1] + 3 * mt**2 * t * p1[1] + 3 * mt * t**2 * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def path_points(path):
    pts = []
    current = None
    for cmd in path:
        if cmd[0] == "M":
            current = cmd[1]
            pts.append(current)
        else:
            _, c1, c2, end = cmd
            pts.extend(bezier(current, c1, c2, end))
            current = end
    return pts


def draw_mark(size, scale=1.0, background=True, rounded=True):
    """Draws the logo at `size` px. `scale` shrinks the mark (for maskable safe zones)."""
    ss = 8
    big = size * ss
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    unit = big / 64
    if background:
        if rounded:
            d.rounded_rectangle([0, 0, big - 1, big - 1], radius=14 * unit, fill=CHARCOAL)
        else:
            d.rectangle([0, 0, big, big], fill=CHARCOAL)

    def tx(p):
        return ((32 + (p[0] - 32) * scale) * unit, (32 + (p[1] - 32) * scale) * unit)

    diamond = [tx(p) for p in [(32, 8), (56, 32), (32, 56), (8, 32)]]
    d.line(diamond + [diamond[0]], fill=GOLD, width=max(1, round(3.2 * unit * scale)), joint="curve")
    for c in [(32, 3.6), (60.4, 32), (32, 60.4), (3.6, 32)]:
        cx, cy = tx(c)
        r = 1.8 * unit * scale
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GOLD)
    d.polygon([tx(p) for p in path_points(FLAME)], fill=SAFFRON)
    d.polygon([tx(p) for p in path_points(INNER)], fill=EMBER)
    x0, y0 = tx((24, 48.2))
    x1, y1 = tx((40, 50.6))
    d.rounded_rectangle([x0, y0, x1, y1], radius=1.2 * unit * scale, fill=GOLD)
    return img.resize((size, size), Image.LANCZOS)


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    for size in (32, 180, 192, 512):
        draw_mark(size).save(PUBLIC / f"icon-{size}.png", optimize=True)
    # Maskable: full-bleed background, mark inside the 80% safe zone.
    draw_mark(512, scale=0.72, rounded=False).save(PUBLIC / "maskable-512.png", optimize=True)
    print(f"[icons] wrote web icons to {PUBLIC.relative_to(ROOT)}")

    if "--tauri" in sys.argv:
        out = Path(sys.argv[sys.argv.index("--tauri") + 1])
        out.mkdir(parents=True, exist_ok=True)
        draw_mark(32).save(out / "32x32.png", optimize=True)
        draw_mark(128).save(out / "128x128.png", optimize=True)
        draw_mark(256).save(out / "128x128@2x.png", optimize=True)
        draw_mark(512).save(out / "icon.png", optimize=True)
        draw_mark(256).save(out / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
        print(f"[icons] wrote desktop icons to {out}")

    if "--android" in sys.argv:
        res = Path(sys.argv[sys.argv.index("--android") + 1])
        densities = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
        for name, factor in densities.items():
            folder = res / f"mipmap-{name}"
            folder.mkdir(parents=True, exist_ok=True)
            launcher = round(48 * factor)
            draw_mark(launcher).save(folder / "ic_launcher.png", optimize=True)
            round_icon = draw_mark(launcher)
            mask = Image.new("L", (launcher, launcher), 0)
            ImageDraw.Draw(mask).ellipse([0, 0, launcher - 1, launcher - 1], fill=255)
            round_bg = Image.new("RGBA", (launcher, launcher), (0, 0, 0, 0))
            round_bg.paste(draw_mark(launcher, scale=0.86, rounded=False), (0, 0), mask)
            round_bg.save(folder / "ic_launcher_round.png", optimize=True)
            # Adaptive icon foreground: 108dp canvas, transparent, mark inside the 66dp safe zone.
            fg = round(108 * factor)
            draw_mark(fg, scale=0.6, background=False).save(folder / "ic_launcher_foreground.png", optimize=True)
        # Replace the template splash images (they carry the framework's logo) with ours,
        # keeping each file's original dimensions.
        for splash in res.glob("drawable*/splash.png"):
            with Image.open(splash) as old:
                w, h = old.size
            canvas = Image.new("RGBA", (w, h), CHARCOAL)
            mark_size = max(48, round(min(w, h) * 0.3))
            mark = draw_mark(mark_size, background=False)
            canvas.alpha_composite(mark, ((w - mark_size) // 2, (h - mark_size) // 2))
            canvas.convert("RGB").save(splash, optimize=True)
        print(f"[icons] wrote Android launcher icons and splash screens to {res}")


if __name__ == "__main__":
    main()
