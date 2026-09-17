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

- **Traversal and absolute paths:** `..` segments, leading `/` or `\`, drive letters (`C:`), and URL schemes are rejected. `.` and empty segments are dropped, and backslashes are treated as `/`.
- **Windows reserved device names:** `CON`, `PRN`, `AUX`, `NUL`, `COM0`–`COM9`, `LPT0`–`LPT9` (with or without an extension) are rejected.
- **Forbidden characters:** control characters, DEL, `<`, `>`, `:`, `"`, `|`, `?` and `*` are rejected, as are segments ending in a dot or space. `sanitizeFileName()` replaces them in user-typed names instead.
- **Length limits:** at most 240 characters per path and 120 per segment.

---

## 4. Archive Security & Zip-Bomb Defense (§76, §77)

The `.mfpack` and asset zip unpacker (`safeUnzip` in `packages/core/src/security/archive.ts`) enforces the resource limits from `packages/core/src/security/limits.ts`:

| Constraint | Mobile | Desktop | Purpose |
|---|---|---|---|
| **Max archive size** | 512 MB | 2 GB | Bounds memory use before decompression starts. |
| **Max expanded size** | 768 MB | 3 GB | Stops zip bombs. Counted on the bytes actually produced, not on header claims. |
| **Max entries** | 4,096 | 16,384 | Stops archives with huge entry tables. |
| **Max compression ratio** | 200× per entry (checked once an entry passes 1 MB) | 200× | Aborts entries that inflate suspiciously. |

Directory entries are ignored and nothing is extracted to the real file system: entries become in-memory files whose paths pass the path checks above.

---

## 5. Scripting Sandboxing (§20)

Mythic Forge MVP does **not** execute arbitrary code (`eval`, `Function()`, `import()`) from imported project files.

Instead, game logic is driven through **declarative behaviours** (`packages/core/src/runtime/game-runtime.ts`):
- `rotate`: Rotates an entity around an axis at a specified angular speed.
- `bob`: Smooth sine-wave vertical oscillation.
- `playerController`: Input-bound kinematic controller with configurable move/jump speeds.
- `followCamera`: Smooth target tracking with spring damping.
- `collectible`: Adds to the score when the player touches it; can play an optional sound.

Because behaviours are purely declarative configuration data, malicious projects **cannot** execute arbitrary shell commands, access host filesystems, or steal sensitive tokens.

---

## 6. Content Security Policy

Production builds carry this policy (`apps/editor/vite.config.ts`):

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:;
media-src 'self' data: blob:; connect-src 'self' data: blob: [asset repository origin];
worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'none'
```

- No `'unsafe-eval'` and no `'unsafe-inline'`. Preact applies `style` props through the CSSOM, which `style-src` does not restrict. The Android shell serves the app from `https://localhost`, which `'self'` covers. The policy was checked in Chromium and on the Android 17 emulator (2026-09-17) with no violations.
- Images, media and requests cannot reach other sites. The only exception is the optional official asset repository (`VITE_ASSET_REPOSITORY_URL`, HTTPS only).
- The Tauri shell sets an equivalent policy in `tauri.conf.json`.

If a future feature seems to need a looser policy, fix the feature instead: move inline code into files, and keep remote content behind the asset repository's verification.
