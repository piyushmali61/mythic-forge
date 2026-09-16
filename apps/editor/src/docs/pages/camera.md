# Cameras

Play mode shows the scene through the **Main Camera** — the first enabled camera with *Main camera* ticked. If there is none, you'll see the editor view and a warning.

| Setting | Meaning |
|---|---|
| Projection | Perspective (3D) or Orthographic (flat, for 2D) |
| Field of view | How wide a perspective camera sees |
| View size | Half the visible height of an orthographic camera, in metres |
| Near / far | Closest and farthest distances drawn. The far distance is also limited by the quality level's draw distance |

## Following the player
Add **Behaviours → Follow Camera** to a camera at the scene root and choose the player as its **Target**. Distance, height and smoothing control where it sits. In third-person games, dragging the view orbits the camera around the player.

## First-person view
Put a camera **inside** the player object (as a child) at eye height, and set the player's controller style to **First person**. Dragging the view turns the player and tilts the camera.

## 2D
2D projects use an orthographic camera looking along −Z. The editor view is locked to the same angle.
