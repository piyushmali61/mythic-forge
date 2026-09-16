# Lighting

| Light | Use |
|---|---|
| Sun (directional) | Parallel light from one direction, like sunlight. Rotate it to change the angle. Casts shadows |
| Point | A bulb or flame. Lights everything within its range |
| Spot | A cone of light, like a torch |
| Sky (hemisphere) | Soft fill light: sky colour from above, ground colour from below |

The scene's **ambient light** (Inspector with nothing selected) adds a flat base level.

## Shadows
Shadows are the most expensive lighting feature:

- **Ultra Low / Low:** off
- **Medium:** low resolution
- **High / Ultra:** higher resolution
- Point-light shadows render six times and are only drawn at **High** and above

Adaptive quality may turn shadows off during play if the device can't keep up.

## Fog
Scene fog hides distant objects and makes large scenes cheaper to look at. It is skipped at Ultra Low quality.

## Tips
- One sun plus one sky light looks good and is cheap.
- Use glowing materials plus a few small point lights for lamps and torches.
