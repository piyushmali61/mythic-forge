# Materials

Shapes use a physically based material:

| Property | Effect |
|---|---|
| Colour | Base colour |
| Metalness | 0 = non-metal, 1 = metal |
| Roughness | 0 = mirror-smooth, 1 = matte |
| Glow colour / strength | Emissive light the surface gives off (doesn't light other objects — add a Point Light for that) |
| Opacity | Below 1 makes the surface see-through |
| Texture | An imported image, with tiling (U/V repeat) |
| Double-sided | Render the back of thin surfaces such as quads |
| Flat shading | Faceted, low-poly look |

## Presets
**Preset** lists official Mythic Bharat Studios materials such as Sandstone, Red Sandstone, Polished Brass, Terracotta, White Marble, Teak Wood, Jade and Lamp Glow. Choosing one copies its values; editing afterwards makes it Custom.

## Textures
Import a PNG, JPEG or WebP (**Import**), select a shape, then choose the image under **Material → Texture** — or use **Apply to …** right after importing. Large images are scaled down to the texture limit for the current quality level when loaded.

Reflections on metallic materials appear at **High** quality and above.

Imported models keep their own materials; editing them inside the editor is planned.
