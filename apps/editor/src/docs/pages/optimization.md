# Performance & Battery

Mythic Forge follows one rule: **if nothing benefits from work right now, it doesn't happen right now.**

## What the engine does for you
- **The editor draws nothing while you're not changing anything.** A still editor uses no GPU time.
- **Nothing runs in the background.** Rendering, downloads and play mode stop when the app is hidden or the screen is off.
- **No polling or syncing.** The network is used only when you ask.
- **Lazy loading.** Models, textures and library thumbnails load only when needed, and thumbnails are generated one at a time for items on screen.
- **Adaptive quality** during play (see [Play Mode](doc:play-mode)).
- **Thermal awareness** where the system reports device temperature.

## Quality levels
| Level | Resolution | Shadows | Textures | FPS (default) |
|---|---|---|---|---|
| Ultra Low | 60% | Off | 512 px | 30 |
| Low | 80% | Off | 1024 px | 30 |
| Medium | 100% | Low | 2048 px | 30 |
| High | 100% (up to 2× pixel density) | Medium | 4096 px | 60 |
| Ultra | 100% (up to 2.5×) | High | 8192 px | 60 |

**Auto** chooses a level from the device (memory, processor, graphics chip). Change it in **Settings → Graphics**.

## Battery modes (Settings → Battery)
- **Maximum Battery Saving** — Low quality, 30 FPS, interface animations off.
- **Balanced** — the default.
- **Performance** — full quality; uses the most power.

If the system's own battery saver is on, Mythic Forge behaves as if Maximum Battery Saving were selected.

## Making lighter games
- Keep triangle counts and texture sizes modest (see [Importing](doc:importing-models)).
- Mark objects that never move as **Static**.
- Use fog to hide distant detail.
- Avoid shadows from point lights.
- Use the **performance overlay** (View menu) and **Settings → Performance → Run benchmark** to measure.
