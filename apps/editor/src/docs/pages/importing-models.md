# Importing Models, Images and Sounds

> Only import assets you have the legal right to use. Imported files stay private to your project.

## Supported formats

| Kind | Formats |
|---|---|
| 3D models | **GLB** and **glTF** (recommended), **OBJ** (+ MTL), **FBX** (experimental) |
| Images | PNG, JPEG, WebP |
| Sounds | OGG, MP3, WAV |

For glTF and OBJ, select the model **together with** its `.bin`, `.mtl` and texture files.

## The import workflow
1. **Import** (toolbar, Assets panel, or Add menu) → **Select files**.
2. Every file is checked first: allowed type, size limit, and that its contents really match its extension. Executables and scripts are always rejected.
3. For models, Mythic Forge analyses the file and shows vertices, triangles, materials, textures, animations, bones and size, plus warnings (for example more than 100,000 triangles for phones).
4. Choose optimisations:
   - **Compress textures** — re-encode as WebP
   - **Generate mipmaps** — smoother distant textures
   - **Optimise mesh** — merge duplicate vertices
   - **Remove hidden objects and unused materials**
   - **Generate collision** — box collider from the bounds
   - **Reduce texture resolution** — 256 to 4096 px
   - **Generate LODs** — for meshes with 2,000+ triangles, adds two simpler copies (about 35% and 12% of the triangles) that are shown when the object is far away. Adds about 40% to the stored size. Animated models are skipped.
5. Estimated GPU memory before and after is shown. Confirm you have the right to use the files, then **Import**.
6. Models are saved as an optimised GLB. The result shows the real stored size. Press **Add to scene**.

## Safety
- Models can't load anything from the internet or from other files on your device — only the files you selected.
- Very large images are rejected before decoding.
- Nothing you import is ever executed.

## Tips for phones
- Keep models under 100k triangles and textures at 1024 px or less.
- Prefer GLB. Convert FBX to GLB in your modelling tool if it looks wrong.
- Prefer OGG over WAV for sounds.
