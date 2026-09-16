# Scenes & Objects

A **scene** is a tree of **objects**. Each object has a **transform** (position, rotation, scale) and optional **components** that give it a look or behaviour.

## Adding objects
**Add** offers:

- Shapes: Cube, Sphere, Capsule, Cylinder, Cone, Plane, Quad, Torus
- Lights: Sun, Point, Spot, Sky
- Camera, Empty object
- Imported models and library assets

New objects appear at the centre of the view.

## Parenting
Children move, rotate and scale with their parent.

- **Desktop:** drag an object onto another in the Scene panel. Drop it on empty space to move it back to the root.
- **Any device:** **⋯ → Parent to…** or **Unparent**.

Objects keep their position in the world when you change their parent.

## Object options
| Option | Meaning |
|---|---|
| Enabled | Disabled objects (and their children) don't render or run |
| Visible (eye) | Hides the object in the editor only; it still appears when playing |
| Locked | Can't be selected or moved in the view |
| Static | The object never moves while playing. Lets the engine skip work |

## Components
Use **Inspector → Add component**: Mesh, Material, Light, Camera, Collider, Rigid Body, Audio Source and Behaviours. Remove one with its **×** button.

## Scene settings
With nothing selected, the Inspector shows the background colour, ambient light, fog, gravity and the **Game HUD** (title, score, and the message shown when everything is collected).
