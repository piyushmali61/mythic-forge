# Mythic Forge — Asset Pipeline & Library Specification

## 1. Supported Formats (§10)

Mythic Forge is optimized for high-efficiency, web- and mobile-friendly formats:

| Category | Primary Format | Secondary / Legacy Formats | Engine Handling |
|---|---|---|---|
| **3D Models** | **GLB / glTF 2.0** | OBJ + MTL, experimental FBX | Direct binary parsing; vertex/triangle counts and bounds computed at import. |
| **2D Textures & Images** | **WebP / PNG** | JPEG | Auto-scaled to power-of-two dimensions; optional GPU mipmap generation. |
| **Audio** | **OGG Vorbis / WAV** | MP3 | Decoded via standard Web Audio API; lightweight memory footprint. |

---

## 2. Ingestion & Analysis Workflow (§11)

When a user imports an external asset (`ImportDialog.tsx`), the engine treats the input as untrusted and executes a strict four-stage pipeline:

```
[External File] 
       │
       ▼
1. Security & Format Sniffing ─────► Validates magic bytes, file extensions, and file size limits
       │
       ▼
2. Headless Geometry Analysis ────► Extracts vertex counts, triangle counts, materials, and bounding boxes
       │
       ▼
3. User Optimization Selection ───► Texture downscaling (e.g. 512px for mobile), normal re-computation
       │
       ▼
4. Atomic Project Integration ────► Writes binary payload and asset.meta.json into assets/<assetId>/
```

### Analysis Statistics Presented to the User
- **Geometry:** Vertices, Triangles, Submeshes.
- **Textures:** Count, Max Dimensions, Estimated VRAM consumption.
- **Physical Extents:** Real-world dimensions in meters ($W \times H \times D$) computed from bounding box coordinates.
- **Memory Footprint:** Original disk size vs. estimated active GPU memory.

---

## 3. The Curated Asset Libraries (§12, §13, §14)

Mythic Forge features two distinct, verified asset collections accessible directly inside the editor:

### A. Mythic Bharat Studios Official Assets (§13)
- **Content:** Original, in-house cultural, mythological, architectural, and environmental assets (e.g., stepped shrine plinths, carved sandstone pillars, stone torana gateways, glowing diyas, kalash pots, banyan trees).
- **License:** Mythic Bharat Studios Asset License 1.0 (`MBS-ASSET-1.0`).
- **Permissions:** 100% free for use in personal, educational, and commercial projects created with Mythic Forge. Modification allowed. Raw standalone file redistribution outside projects is restricted.
- **Verification:** Every entry is human-verified by the Mythic Bharat Studios studio team.

### B. Free & Open Assets (§14)
- **Content:** Curated modular game-dev starter assets (e.g., faceted rocks, wooden crates, modular grass/dirt tiles, earthenware urns, PBR materials).
- **License:** Creative Commons Zero 1.0 Universal (`CC0-1.0`).
- **Permissions:** Dedicated to the worldwide public domain. Commercial use, modification, and open redistribution permitted with zero attribution obligations.

---

## 4. User Asset Rights & Content Protection (§16, §84)

When importing custom assets into a project, users must confirm:
> *"I have the legal right to use and distribute this asset in my project."*

Key privacy and ownership guarantees:
1. **Local-First Privacy:** User-imported assets remain strictly private inside the local project filesystem. The engine **never** silently uploads user assets or projects to cloud servers.
2. **Zero Ownership Claims:** Mythic Bharat Studios makes zero claim of ownership over user-imported 3D models, textures, sounds, or game logic.

---

## 5. Asset Cache & Memory Management (§27, §28)

To preserve device battery and RAM:
- **Render-on-Demand Thumbnails:** Asset card thumbnails are rendered in an offscreen headless canvas only when the asset card scrolls into the viewport.
- **LRU In-Memory Texture Cache:** Textures are cached with an eviction policy when the project exceeds memory budgets.
- **Clean Cache Purging:** Users can purge the temporary cache (`cache/`) at any time from **Settings → Storage → Clear Cache** without endangering project source assets.
