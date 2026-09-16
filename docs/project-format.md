# Mythic Forge — Project Format Specification

## 1. Design Principles (§4)

A Mythic Forge project is designed to be:
- **Portable:** Seamlessly transferable between Android phones, tablets, laptops, and desktop PCs.
- **Human-Readable:** Manifests and scene hierarchies are standard UTF-8 JSON.
- **Versioned & Forward-Compatible:** Every document embeds an engine and format version.
- **Corrupt-Resistant:** All disk operations are executed via single-transaction atomic filesystem writes with automated backup rotation.
- **Asset Integrity Coupled:** Asset binary files and their corresponding legal provenance/licensing metadata reside in the same dedicated directory (`assets/<assetId>/`), preventing accidental decoupling or orphaned files.

---

## 2. Directory Structure (§4, §6)

A Mythic Forge project directory is organized as follows:

```
<project-root>/
├── project.mfproj                     # Master Project Manifest
├── scenes/
│   ├── main.mfscene                   # Start / Primary Scene Document
│   └── level-02.mfscene               # Secondary Scene Documents
├── assets/
│   ├── a_4f8b1c2e/                    # Dedicated folder per unique asset ID
│   │   ├── asset.meta.json            # Full Provenance, License, Stats & Verification
│   │   └── shrine-platform.glb        # Binary asset payload
│   └── a_9d2a3f10/
│       ├── asset.meta.json
│       └── wood-texture.webp
├── metadata/
│   ├── thumbnail.webp                 # Project preview thumbnail (256x256)
│   └── backups/                       # Rotating atomic snapshots of previous saves
│       ├── 20260917T031500123Z-save/
│       │   ├── project.mfproj
│       │   └── scenes/main.mfscene
│       └── 20260917T030000456Z-save/
├── cache/                             # Derived runtime data (NEVER packaged into .mfpack)
│   ├── thumbnails/
│   └── optimized-meshes/
└── builds/                            # Exported game bundles (NEVER packaged into .mfpack)
    └── web/
```

> [!IMPORTANT]
> The traditional layout (`models/`, `textures/`, `sounds/`) is intentionally superseded by `assets/<assetId>/`. This ensures that an asset's byte payload and its legal attribution/license metadata can **never** be separated during renaming, moving, or packaging.

---

## 3. File Specifications

### A. `project.mfproj` (Project Manifest)

```json
{
  "format": "mythic-forge-project",
  "formatVersion": 1,
  "engineVersion": "0.1.0",
  "rendererVersion": "webgl2-three-r182",
  "id": "p_8f1b2c3d4e5f",
  "name": "Mythic Warrior",
  "description": "3D Adventure Prototype",
  "type": "3d-game",
  "targets": ["android", "windows", "web"],
  "performanceProfile": "balanced",
  "createdAt": "2026-09-17T03:00:00.000Z",
  "modifiedAt": "2026-09-17T03:20:00.000Z",
  "startScene": "scenes/main.mfscene",
  "scenes": [
    { "id": "s_main", "name": "Main", "path": "scenes/main.mfscene" }
  ],
  "archived": false,
  "settings": {
    "physics": {
      "gravity": [0, -9.81, 0],
      "fixedTimestep": 0.016667
    },
    "rendering": {
      "shadows": true,
      "fog": true
    }
  }
}
```

### B. `scenes/<name>.mfscene` (Scene Document)

Scenes represent a flat entity dictionary with an explicit root ordering:

```json
{
  "format": "mythic-forge-scene",
  "formatVersion": 1,
  "name": "Main",
  "rootIds": ["e_cam01", "e_sun01", "e_platform01"],
  "entities": {
    "e_cam01": {
      "id": "e_cam01",
      "name": "Main Camera",
      "parent": null,
      "children": [],
      "transform": {
        "position": [0, 3, 10],
        "rotation": [-15, 0, 0],
        "scale": [1, 1, 1]
      },
      "components": {
        "camera": {
          "projection": "perspective",
          "fov": 60,
          "near": 0.1,
          "far": 500,
          "isPrimary": true
        }
      },
      "isStatic": false,
      "locked": false,
      "visible": true
    },
    "e_platform01": {
      "id": "e_platform01",
      "name": "Shrine Platform",
      "parent": null,
      "children": [],
      "transform": {
        "position": [0, 0, 0],
        "rotation": [0, 0, 0],
        "scale": [1, 1, 1]
      },
      "components": {
        "model": {
          "assetId": "a_4f8b1c2e",
          "materialOverride": null
        },
        "collider": {
          "shape": "box",
          "size": [8, 1.2, 8],
          "center": [0, 0.6, 0],
          "isTrigger": false
        }
      },
      "isStatic": true,
      "locked": false,
      "visible": true
    }
  },
  "environment": {
    "background": "#1e1e24",
    "ambientColor": "#ffffff",
    "ambientIntensity": 0.4,
    "fogEnabled": true,
    "fogColor": "#1e1e24",
    "fogNear": 10,
    "fogFar": 100
  }
}
```

### C. `assets/<assetId>/asset.meta.json` (Asset Metadata & Provenance)

```json
{
  "format": "mythic-forge-asset",
  "formatVersion": 1,
  "id": "a_4f8b1c2e",
  "name": "Stepped Shrine Platform",
  "kind": "model",
  "fileFormat": "glb",
  "mainFile": "shrine-platform.glb",
  "files": [
    {
      "name": "shrine-platform.glb",
      "size": 22676,
      "sha256": "4b6f...c81a"
    }
  ],
  "importedAt": "2026-09-17T03:10:00.000Z",
  "originalBytes": 22676,
  "provenance": {
    "source": "official-catalog",
    "userConfirmedRights": true,
    "originalFileName": "mbs.shrine-platform.glb",
    "catalogId": "mbs.shrine-platform",
    "catalogVersion": "1.0.0",
    "license": {
      "creator": "Mythic Bharat Studios",
      "owner": "Mythic Bharat Studios",
      "licenseId": "MBS-ASSET-1.0",
      "licenseName": "Mythic Bharat Studios Asset License 1.0 (DRAFT)",
      "commercialUse": true,
      "modificationAllowed": true,
      "redistributionAllowed": true,
      "attributionRequired": false,
      "attributionText": "",
      "verifiedBy": "Mythic Bharat Studios Review Team",
      "verificationDate": "2026-09-17",
      "verificationStatus": "verified"
    }
  },
  "stats": {
    "triangles": 536,
    "vertices": 1608,
    "boundsMin": [-4.03, 0, -4.03],
    "boundsMax": [4.03, 1.54, 4.03]
  }
}
```

---

## 4. The `.mfpack` Archive Format (§6, §33)

To share projects across devices (or import from phone to PC), Mythic Forge uses the `.mfpack` format:

1. **Physical Container:** Standard uncompressed or Deflate ZIP container with MIME type `application/vnd.mythicforge.project-pack`.
2. **Integrity Manifest (`pack.json`):** Located at the root of the ZIP. Contains SHA-256 digests for every file within the archive:
   ```json
   {
     "format": "mythic-forge-pack",
     "formatVersion": 1,
     "engineVersion": "0.1.0",
     "projectName": "Mythic Warrior",
     "createdAt": "2026-09-17T03:20:00.000Z",
     "files": [
       { "path": "project.mfproj", "size": 607, "sha256": "..." },
       { "path": "scenes/main.mfscene", "size": 4210, "sha256": "..." },
       { "path": "assets/a_4f8b1c2e/shrine-platform.glb", "size": 22676, "sha256": "..." },
       { "path": "assets/a_4f8b1c2e/asset.meta.json", "size": 840, "sha256": "..." }
     ]
   }
   ```
3. **Excluded Directories:** Temporary data (`cache/`), build targets (`builds/`), and older historical backups (`metadata/backups/`) are strictly stripped during export to minimize package size and battery consumption.
4. **Validation on Import:** The importer extracts files using `safeUnzip()`, enforces decompression ratio limits (defeating zip bombs), verifies all SHA-256 hashes against `pack.json`, and validates the project and scene schemas before writing to persistent storage.
