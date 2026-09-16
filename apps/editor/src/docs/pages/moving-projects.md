# Moving Projects Between Devices

Projects live in Mythic Forge's private storage on each device. To continue a project somewhere else — phone → laptop → PC and back — move it as a **.mfpack** file.

## Export
- Project card **⋯ → Export (.mfpack)**, or in the editor **File → Export project**.
- On Android the share sheet opens: save to Files or Google Drive, or send it to yourself.
- On a PC the file is downloaded.

The package contains the project file, scenes, imported assets and their licence records, and the thumbnail. Caches and backups are left out to keep it small.

## Import
**Projects → Import** and choose the `.mfpack` file.

Before anything is written, Mythic Forge checks the package: allowed file layout only, no executable content, no oversized or "zip bomb" contents, every file matching its recorded checksum, and valid scenes and asset data. If any check fails, nothing is imported.

If the same project already exists on the device, the import is added as a separate copy named "(imported)".

## Versions
- Projects from **older** Mythic Forge versions are backed up and upgraded when you open them.
- Projects from a **newer** format can't be opened until you update the app.
