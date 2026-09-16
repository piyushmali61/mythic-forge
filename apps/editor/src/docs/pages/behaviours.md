# Behaviours (Scripting)

Mythic Forge 0.1 builds game logic from **behaviours**: ready-made, configurable pieces of logic you add to objects. There is no code to write, and — for safety — projects can't run code of their own.

| Behaviour | What it does | Key settings |
|---|---|---|
| **Rotate** | Spins the object | Axis, degrees per second |
| **Bob** | Moves it gently up and down | Height, speed |
| **Player Controller** | Moves the object with keys or the on-screen stick; jump with Space/Jump | Style (third person, first person, platformer), move and jump speed |
| **Follow Camera** | Makes a camera follow a target | Target, distance, height, smoothing |
| **Collectible** | Disappears and adds score when the player touches it; optional sound | Score, sound |

## Making a collect-the-items game
1. Give your player a **Collider**, a **Rigid Body** and a **Player Controller**.
2. Add a camera with **Follow Camera** targeting the player.
3. Add shapes or models with a **Collider** and a **Collectible** behaviour.
4. With nothing selected, turn on **Game HUD → Show score** and write a win message.
5. Press Play.

## If a behaviour fails
If a behaviour hits an error while playing, only that behaviour stops; the game keeps running and the Console shows what happened.

## Coming later
A sandboxed scripting language and visual scripting are planned. They will only be able to use an approved engine API — never files, the network or system commands.
