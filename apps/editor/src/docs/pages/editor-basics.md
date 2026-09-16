# Editor Basics

## Layout

**On a PC or laptop** the editor shows:

- **Menu bar** — File, Edit, View, Add, Project, Build, Help
- **Toolbar** — Add, Move/Rotate/Scale, Undo/Redo, Play/Pause/Stop, Import, Build, Save
- **Scene** panel (left) — every object in the scene as a tree
- **Viewport** (centre) — the 3D view
- **Inspector** (right) — properties of the selected object, or scene settings when nothing is selected
- **Assets / Console** (bottom)

**On a phone** the editor is rearranged for touch:

- A top bar with Back, Save, Play and **⋯ More**
- The viewport fills the screen, with a floating Move/Rotate/Scale/Focus column when something is selected
- A bottom bar: **Add, Objects, Inspect, Assets, Undo, Redo** — panels open as sheets

## Moving around the view

| Action | Touch | Mouse |
|---|---|---|
| Select | Tap an object | Click |
| Orbit | Drag with one finger on empty space | Left-drag on empty space, or right-drag |
| Pan | Drag with two fingers | Middle-drag or Shift + left-drag |
| Zoom | Pinch | Mouse wheel |
| Rotate view | Twist two fingers | — |
| Focus selection | Focus button | **F** |

In 2D projects the view stays front-on; dragging pans.

## Transform gizmo
Select an object, then drag the arrows (Move), rings (Rotate) or cubes (Scale). Snapping can be turned on in **Settings → Editor**. Locked objects can't be selected in the view.

## Undo and redo
Almost every change can be undone: moving, rotating, scaling, adding, deleting, renaming, material and component edits, and scene settings. Dragging a value counts as one step.

## Saving
- **Save** writes the whole project in one step, so an interrupted save can't damage it.
- The last three saves are kept as backups (**Project Settings → Backups**).
- **Auto-save** (Settings → Editor) saves in the background every 5, 10 or 15 minutes.
- Unsaved work is also kept in a separate recovery snapshot. If the app closes unexpectedly, you'll be offered your changes next time.
