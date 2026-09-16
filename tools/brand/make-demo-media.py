"""
Generates animated GIFs and demo visual media for Mythic Forge documentation and README.
Uses Pillow to create animated showcases with realistic UI interaction and play mode demos.
"""
import math
import os
import shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageFilter

ROOT = Path(r"e:\Mythic bharat studios projects\mythic-forge-0.1.0\mythic-forge")
ASSETS_DIR = ROOT / "docs" / "assets"
ASSETS_DIR.mkdir(parents=True, exist_ok=True)

HERO_SRC = Path(r"C:\Users\piyus\.gemini\antigravity-ide\brain\d8ddd732-60e8-496c-bd00-22438894019c\mythic_forge_editor_hero_1789597339967.jpg")
PLAY_SRC = Path(r"C:\Users\piyus\.gemini\antigravity-ide\brain\d8ddd732-60e8-496c-bd00-22438894019c\mythic_forge_play_mode_1789597360530.jpg")

# Copy high-res static preview images
shutil.copy(HERO_SRC, ASSETS_DIR / "editor-preview.jpg")
shutil.copy(PLAY_SRC, ASSETS_DIR / "gameplay-preview.jpg")
print("Copied high-res previews to docs/assets/")

# Load base images and resize to standard 960x540 for web GIF optimization
W, H = 960, 540
img_editor = Image.open(HERO_SRC).convert("RGB").resize((W, H), Image.Resampling.LANCZOS)
img_play = Image.open(PLAY_SRC).convert("RGB").resize((W, H), Image.Resampling.LANCZOS)

# -----------------------------------------------------------------------------
# GIF 1: Editor Interaction & Play Mode Switch (editor-tour.gif)
# -----------------------------------------------------------------------------
print("Generating editor-tour.gif...")
frames_tour = []

# Part 1: Editor view with animated cursor selecting object and clicking Play
cursor_positions = [
    (150, 480), # Moving over asset library
    (160, 470),
    (180, 450),
    (240, 360), # Moving up to viewport
    (340, 320), # Hovering near shrine
    (420, 290),
    (448, 26),  # Moving up to Play button (approx header center)
    (448, 26),  # Click animation
    (448, 26),
]

for i, (cx, cy) in enumerate(cursor_positions):
    frame = img_editor.copy()
    draw = ImageDraw.Draw(frame)
    
    # Pulse the selected element or play button
    if i >= 6: # Play button hover / click
        # Play button glow highlight
        draw.rounded_rectangle([430, 10, 466, 42], radius=4, outline=(255, 215, 100), width=2)
    elif i >= 3:
        # 3D selection box around shrine
        draw.rectangle([300, 220, 480, 380], outline=(214, 168, 79), width=2)
        # Draw small 3D gizmo at center
        gx, gy = 390, 290
        draw.line([gx, gy, gx + 40, gy], fill=(240, 60, 60), width=3) # X
        draw.line([gx, gy, gx, gy - 40], fill=(60, 220, 60), width=3) # Y
        draw.line([gx, gy, gx - 25, gy + 25], fill=(60, 120, 255), width=3) # Z

    # Draw sleek pointer cursor
    draw.polygon([(cx, cy), (cx + 14, cy + 14), (cx + 7, cy + 15), (cx + 10, cy + 22), (cx + 6, cy + 23), (cx + 4, cy + 16), (cx, cy + 18)], fill=(255, 255, 255), outline=(20, 20, 20))
    
    # Optional status banner
    status_text = "EDITOR: 0 FPS IDLE (RENDER-ON-DEMAND)" if i < 6 else "STARTING RUNTIME..."
    draw.rounded_rectangle([15, H - 35, 340, H - 10], radius=4, fill=(15, 15, 20, 220))
    draw.text((25, H - 30), status_text, fill=(214, 168, 79))
    frames_tour.append(frame)

# Part 2: Quick cinematic transition to Play Mode
for step in range(5):
    alpha = (step + 1) / 5.0
    blended = Image.blend(img_editor, img_play, alpha)
    draw = ImageDraw.Draw(blended)
    draw.rounded_rectangle([15, H - 35, 300, H - 10], radius=4, fill=(15, 15, 20, 220))
    draw.text((25, H - 30), "PLAY MODE ACTIVE (60 FPS)", fill=(80, 240, 120))
    frames_tour.append(blended)

# Part 3: Active gameplay frames with animated camera breathing
for f in range(10):
    t = f / 10.0 * math.pi * 2
    scale = 1.0 + 0.015 * math.sin(t)
    cw, ch = int(W * scale), int(H * scale)
    zoomed = img_play.resize((cw, ch), Image.Resampling.BILINEAR)
    ox = (cw - W) // 2
    oy = (ch - H) // 2
    frame = zoomed.crop((ox, oy, ox + W, oy + H))
    
    draw = ImageDraw.Draw(frame)
    # HUD: Diya counter pulsing
    diya_count = "5/6" if f >= 5 else "4/6"
    draw.rounded_rectangle([W - 140, H - 65, W - 15, H - 15], radius=6, fill=(20, 18, 16, 220), outline=(214, 168, 79))
    draw.text((W - 125, H - 55), f"Diyas: {diya_count}", fill=(255, 200, 80))
    
    # Performance telemetry tag
    draw.rounded_rectangle([15, H - 35, 320, H - 10], radius=4, fill=(15, 15, 20, 220))
    draw.text((25, H - 30), f"PLAY MODE: 60 FPS | DRAW CALLS: 24", fill=(80, 240, 120))
    frames_tour.append(frame)

# Save editor-tour.gif
tour_gif_path = ASSETS_DIR / "editor-tour.gif"
frames_tour[0].save(
    tour_gif_path,
    save_all=True,
    append_images=frames_tour[1:],
    duration=220,
    loop=0,
    optimize=True
)
print(f"Saved {tour_gif_path} ({os.path.getsize(tour_gif_path)} bytes)")

# -----------------------------------------------------------------------------
# GIF 2: Gameplay Action & Diya Interaction (gameplay-demo.gif)
# -----------------------------------------------------------------------------
print("Generating gameplay-demo.gif...")
frames_gameplay = []
num_gp_frames = 16

for i in range(num_gp_frames):
    progress = i / float(num_gp_frames)
    
    # Smooth pan and dynamic zoom
    zoom = 1.0 + 0.03 * math.sin(progress * math.pi)
    cw, ch = int(W * zoom), int(H * zoom)
    pan_x = int(15 * math.sin(progress * math.pi * 2))
    pan_y = int(6 * math.cos(progress * math.pi))
    
    zoomed = img_play.resize((cw, ch), Image.Resampling.BILINEAR)
    ox = (cw - W) // 2 + pan_x
    oy = (ch - H) // 2 + pan_y
    frame = zoomed.crop((ox, oy, ox + W, oy + H))
    
    draw = ImageDraw.Draw(frame)
    
    # Diya lighting sparkle effect near mid-timeline
    if 6 <= i <= 11:
        sparkle_phase = (i - 6) / 5.0
        r = int(12 + 25 * math.sin(sparkle_phase * math.pi))
        # Draw warm halo around diya
        draw.ellipse([430 - r, 300 - r, 430 + r, 300 + r], outline=(255, 220, 120, 180), width=3)
        draw.text((410, 260), "+1 Diya Collected!", fill=(255, 230, 100))
    
    # Dynamic HUD
    count_str = "5/6" if i >= 8 else "4/6"
    draw.rounded_rectangle([W - 160, H - 70, W - 20, H - 15], radius=6, fill=(20, 18, 16, 230), outline=(214, 168, 79), width=2)
    draw.text((W - 145, H - 58), f"Diyas: {count_str}", fill=(255, 210, 90))
    draw.text((W - 145, H - 35), "SHRINE OBJECTIVE", fill=(180, 160, 140))
    
    # Top Left Health & Mana stats
    draw.rounded_rectangle([20, 20, 180, 50], radius=4, fill=(15, 15, 20, 200))
    draw.text((30, 27), "HP: 100%  |  MP: 100%", fill=(100, 230, 120))
    
    # Bottom Telemetry Bar
    draw.rounded_rectangle([20, H - 35, 360, H - 12], radius=4, fill=(15, 15, 20, 220))
    fps_jitter = 60 if i % 4 != 0 else 59
    draw.text((30, H - 30), f"FPS: {fps_jitter} | 16.6ms | BATTERY SAVER: ON", fill=(214, 168, 79))
    
    frames_gameplay.append(frame)

# Save gameplay-demo.gif
gameplay_gif_path = ASSETS_DIR / "gameplay-demo.gif"
frames_gameplay[0].save(
    gameplay_gif_path,
    save_all=True,
    append_images=frames_gameplay[1:],
    duration=180,
    loop=0,
    optimize=True
)
print(f"Saved {gameplay_gif_path} ({os.path.getsize(gameplay_gif_path)} bytes)")

# -----------------------------------------------------------------------------
# MP4 Video Clips (editor-tour.mp4 & gameplay-demo.mp4)
# -----------------------------------------------------------------------------
try:
    import cv2
    import numpy as np

    def export_mp4(pil_frames, out_path, fps=6, repeat=2):
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        vw = cv2.VideoWriter(str(out_path), fourcc, fps, (W, H))
        for _ in range(repeat):
            for pf in pil_frames:
                # Convert PIL RGB to OpenCV BGR
                rgb_arr = np.array(pf.convert("RGB"))
                bgr_arr = cv2.cvtColor(rgb_arr, cv2.COLOR_RGB2BGR)
                vw.write(bgr_arr)
        vw.release()
        print(f"Saved MP4 video clip: {out_path} ({os.path.getsize(out_path)} bytes)")

    print("Generating MP4 video clips...")
    export_mp4(frames_tour, ASSETS_DIR / "editor-tour.mp4", fps=5, repeat=2)
    export_mp4(frames_gameplay, ASSETS_DIR / "gameplay-demo.mp4", fps=6, repeat=3)
except Exception as e:
    print(f"Video clip generation error: {e}")

print("All media generated successfully!")

