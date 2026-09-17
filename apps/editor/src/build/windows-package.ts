import { UserFacingError, createZip, sanitizeFileName, utf8Encode } from '@mythic-forge/core';

/** Lines of launcher.txt: no line breaks or '=' can sneak into a value. */
const configValue = (s: string): string => s.replace(/[\r\n=]/g, ' ').trim().slice(0, 200);

/** launcher.txt, read by tools/desktop/GameLauncher.cs. */
export function launcherConfig(gameName: string): string {
  return [`title=${configValue(gameName)}`, 'width=1280', 'height=720', ''].join('\r\n');
}

/** README.txt shipped with Windows exports. */
export function windowsReadme(gameName: string, exeName: string): string {
  return [
    configValue(gameName),
    '',
    'HOW TO PLAY',
    '1. Extract the whole folder (right-click the zip > Extract All).',
    `2. Double-click ${exeName}.`,
    '',
    'The game opens in a Microsoft Edge app window (Edge is part of Windows 10 and 11).',
    'Without Edge, it opens in your default browser. You can also open game.html directly.',
    'Everything runs on this PC; no internet connection is needed.',
    '',
    `${exeName} is not code-signed, so Windows SmartScreen may ask for confirmation the first time`,
    '(More info > Run anyway). It only opens game.html from this folder.',
    '',
    'Made with Mythic Forge. Credits and open-source notices are in the game (Credits button).',
    '',
  ].join('\r\n');
}

export function isWindowsExecutable(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 1024 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pe = view.getUint32(0x3c, true);
  return pe + 4 <= bytes.byteLength && view.getUint32(pe, true) === 0x00004550;
}

/**
 * Zips a portable Windows game: `<name>/<name>.exe` (the launcher), `game.html`, `launcher.txt`
 * and `README.txt`.
 */
export function packageWindowsGame(input: { gameName: string; fileBase: string; launcher: Uint8Array; html: Uint8Array }): { bytes: Uint8Array; fileName: string } {
  if (!isWindowsExecutable(input.launcher)) {
    throw new UserFacingError('launcher-invalid', 'The Windows launcher in this installation is damaged.', 'Not a Windows executable.');
  }
  const base = sanitizeFileName(input.fileBase, 'game');
  const exeName = `${base}.exe`;
  const bytes = createZip([
    { path: `${base}/${exeName}`, bytes: input.launcher },
    { path: `${base}/game.html`, bytes: input.html },
    { path: `${base}/launcher.txt`, bytes: utf8Encode(launcherConfig(input.gameName)) },
    { path: `${base}/README.txt`, bytes: utf8Encode(windowsReadme(input.gameName, exeName)) },
  ]);
  return { bytes, fileName: `${base}-windows.zip` };
}
