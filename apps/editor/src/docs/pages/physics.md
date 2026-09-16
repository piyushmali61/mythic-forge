# Physics & Colliders

Mythic Forge 0.1 has **simple character physics**, designed to be cheap on phones:

- gravity (set per scene)
- solid ground, walls and platforms
- walking up small steps (up to 0.45 m)
- jumping
- trigger areas (for collectibles)
- respawning if the player falls out of the world

It does **not** simulate tumbling, object rotation, stacking or vehicles yet.

## Colliders
A **Collider** is a box around an object. Use **Fit to object** to match the shape or model.

- Solid colliders block movement.
- **Trigger** colliders only detect touching (used by collectibles).
- Colliders on moving objects (e.g. with Bob) move with them.
- Objects marked **Static** are measured once when play starts.

Imported models get a collider automatically if *Generate collision* was ticked.

## Rigid bodies
A **Rigid Body** makes an object fall and collide. It needs a Collider and must be at the scene root (not inside another object).

| Setting | Meaning |
|---|---|
| Mass | Reserved for future physics; not used by the simple solver yet |
| Use gravity | Falls when not supported |
| Kinematic | Not moved by physics |
