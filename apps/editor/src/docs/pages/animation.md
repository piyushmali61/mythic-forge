# Animation

Models imported from **GLB**, **glTF** or **FBX** keep their animation clips. The import screen lists the clips it found.

## Playing a clip

1. Add the model to the scene. Models with clips get an **Animator** automatically. Otherwise, select the object and choose **Add component → Animator**.
2. In the Inspector, pick the **Clip**. *First clip* uses the first one in the file.
3. Press **Play**. Animations run in play mode and in exported games. The editor view stays still, so an idle editor still uses no battery.

| Setting | What it does |
|---|---|
| **Clip** | The clip played while the object stands still. |
| **While moving** | A clip played while a **Player Controller** moves this object, for example *Run*. The Animator blends between the two clips. |
| **Speed** | 1 is normal speed, 0.5 is half speed, 0 freezes the animation. |
| **Play clip when idle** | Off: the object only animates while it moves. |
| **Loop** | Off: the clip plays once and holds its last frame. |

Stopping play mode puts the model back in its original pose.

## Tips

- A typical character has *Idle* as **Clip** and *Walk* or *Run* as **While moving**, plus a Player Controller.
- Disabled and collected objects are not animated, which saves battery.
- Simple motion without a model can use the **Rotate** and **Bob** behaviours.
- Keep bone counts low for phones: the import screen warns when a skeleton is large.

## Not available yet

- Starting clips from game events (other than moving)
- Editing keyframes inside Mythic Forge
- Previewing clips in the editor view (use Play)
