# Troubleshooting

## "Mythic Forge could not start"
The device or browser must support **WebGL 2** and **IndexedDB**. Update your browser or Android System WebView. Private/incognito windows may block storage.

## The 3D view is black or froze
The system may have reset graphics (common after switching apps on low-memory phones). The view returns automatically; if not, close and reopen the project. Your work is safe — unsaved changes are kept in a recovery snapshot.

## "We found a recoverable version of your project"
Mythic Forge closed before you saved. **Restore** loads the unsaved version (save it to keep it), **Discard** deletes the snapshot.

## A model looks wrong or didn't import
- Prefer GLB. FBX support is experimental.
- For glTF/OBJ, select the `.bin`, `.mtl` and texture files together with the model.
- Check the warnings on the import screen.

## An object shows a red marker instead of its model
Its asset was removed from the project. Import it again or change the object's **Model → Asset**.

## The game is slow
Lower **Settings → Graphics → Quality**, choose **Battery → Balanced** or **Maximum Battery Saving**, reduce shadows, and check triangle counts with the performance overlay.

## Storage is full
**Settings → Storage → Clear Cache** removes rebuildable data. Export and delete projects you don't need.

## Reporting a problem
Turn on **Settings → General → Developer mode** to see technical details, then **Settings → Privacy → Export logs** and send the file with a description through the support channel in **Settings → About**.
