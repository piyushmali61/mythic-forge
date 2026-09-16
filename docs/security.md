# Mythic Forge — Security Architecture & Threat Model

## 1. Threat Model & Untrusted Input (§19, §76)

In Mythic Forge, **all external data is treated as untrusted input**:
- User-imported 3D models (GLB, OBJ, FBX) and textures.
- Imported `.mfpack` project archives from external sources.
- Remote asset metadata fetched from online catalogs.
- Serialized project and scene JSON files.

The engine defends against malicious payloads, remote code execution (RCE), path traversal, zip bombs, and resource exhaustion.

---

## 2. Magic Byte Sniffing & Executable Signature Blocking (§19, §76)

Relying on file extensions alone is unsafe. The engine validates the initial byte signatures (magic numbers) of all incoming files (`packages/core/src/security/file-types.ts`):

```typescript
// Magic byte sniffers
export function sniffFileType(header: Uint8Array): KnownFileType | null {
  // glTF Binary: 'glTF' (0x67 0x6C 0x54 0x46)
  if (header[0] === 0x67 && header[1] === 0x6C && header[2] === 0x54 && header[3] === 0x46) return 'glb';
  // PNG: 0x89 'P' 'N' 'G' 0x0D 0x0A 0x1A 0x0A
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) return 'png';
  // WebP: 'RIFF' .... 'WEBP'
  if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46) return 'webp';
  // ...
}
```

### Prohibited File Signatures
The engine scans for and **hard-rejects** any file beginning with:
- **`MZ` (0x4D 0x5A):** Windows PE executables (`.exe`, `.dll`, `.scr`).
- **`\x7FELF` (0x7F 0x45 0x4C 0x46):** Linux / Android ELF binaries.
- **Mach-O (0xFEEDFACE / 0xFEEDFACF):** macOS / iOS binaries.
- **Shebang (`#!`):** Shell scripts (`.sh`, `.bash`).
- **Script extensions:** `.bat`, `.cmd`, `.ps1`, `.vbs`, `.js`, `.mjs`, `.jar`.

Even if disguised with a `.glb` or `.png` extension, such files are detected and rejected.

---

## 3. Path Traversal Defense (§19, §76)

All file paths within projects, asset packs, and archives are sanitized through `isSafeRelativePath()` and `sanitizeFileName()` (`packages/core/src/security/paths.ts`):

- **Relative Traversal:** Any path containing `..`, `./`, or leading slashes (`/` or `\`) is rejected.
- **Windows Reserved Device Names:** Rejects `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`.
- **Illegal Characters:** Control characters ($0\text{x}00\text{–}0\text{x}1\text{F}$), `<`, `>`, `:`, `"`, `|`, `?`, `*` are stripped or rejected.
- **Depth Limits:** Paths cannot exceed 10 directory segments or 240 total characters.

---

## 4. Archive Security & Zip-Bomb Defense (§76, §77)

The `.mfpack` and asset zip unpacker (`safeUnzip` in `packages/core/src/security/archive.ts`) enforces strict decompression quotas:

| Constraint | Limit | Purpose |
|---|---|---|
| **Max Archive Size** | $150\text{ MB}$ | Prevents memory exhaustion on mobile devices. |
| **Max Uncompressed Size** | $400\text{ MB}$ | Thwarts zip bombs with massive uncompressed sizes. |
| **Max Entries in Archive** | $2,000$ | Prevents inode and directory table exhaustion. |
| **Max Expansion Ratio** | $10\times$ | Aborts extraction if uncompressed data grows disproportionately to compressed bytes. |
| **No Corrupted Symlinks** | Disallowed | Symlinks and hardlinks in archives are rejected. |

---

## 5. Scripting Sandboxing (§20)

Mythic Forge MVP does **not** execute arbitrary code (`eval`, `Function()`, `import()`) from imported project files.

Instead, game logic is driven through **declarative behaviours** (`packages/core/src/runtime/game-runtime.ts`):
- `rotate`: Rotates an entity around an axis at a specified angular speed.
- `bob`: Smooth sine-wave vertical oscillation.
- `playerController`: Input-bound kinematic controller with configurable move/jump speeds.
- `followCamera`: Smooth target tracking with spring damping.
- `collectible`: Trigger collision with score increment and particle/sound cue.

Because behaviours are purely declarative configuration data, malicious projects **cannot** execute arbitrary shell commands, access host filesystems, or steal sensitive tokens.
