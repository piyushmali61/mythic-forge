# Play Mode

Press **Play** (▶) to run your scene.

- The game runs on a **copy** of the scene. When you press **Stop**, everything returns exactly to how it was — nothing you do while playing is saved.
- **Pause** freezes the game and stops drawing frames.
- Play mode pauses automatically when you switch apps or the screen turns off.
- Editing is disabled while playing.

## Controls
| | Keyboard & mouse | Touch |
|---|---|---|
| Move | W A S D / arrow keys | On-screen stick |
| Jump | Space | Jump button |
| Look / orbit | Drag the view | Drag the view |
| Stop | Esc | ■ |

## The HUD
Scene settings (Inspector with nothing selected) control the title, score and win message.

## Errors
If a behaviour fails, it is switched off, a message appears, and the details are in the **Console**. The rest of the game keeps running.

## Performance while playing
Play mode runs at the target frame rate from your settings and project profile. If frames arrive late, **adaptive quality** lowers shadows first, then resolution, then frame rate, and restores them when possible. If the device reports it is getting hot, quality is reduced right away and you'll see *"Performance has been reduced to manage device temperature."*
