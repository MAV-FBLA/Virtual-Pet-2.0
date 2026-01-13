# Virtual Pet 2.0 - Core Logic & Architecture
> **Guide for Presentation & Technical Understanding**

This document breaks down the "Virtual Pet 2.0" application into its core functional components. It explains *how* the code works, focused on the logical flow from the User Interface down to the Data State.

---

## 1. 🏗️ High-Level Architecture
The application is built on a **Model-View-Controller (MVC)** inspired pattern, though simplified for this project without external frameworks.

| Layer | File | Purpose |
| :--- | :--- | :--- |
| **View (UI)** | `index.html` | The "Skeleton". Displays the 2D HUD (stats, buttons) and holds the 3D Canvas. |
| **View (3D)** | `script.js` (Three.js) | The "World". Renders the 3D room, lighting, and pet using WebGL. |
| **Model (Data)** | `script.js` (`STATE`) | The "Brain". Stores numbers (Hunger: 50, Money: $100). Truth source. |
| **Controller** | `script.js` (Logic) | The "Manager". Updates the Model based on User Input, then redraws Views. |

---

## 2. 🧠 The "Brain": State Management
Everything you see on screen is a reflection of the `STATE` variable in `script.js`. We never modify the screen directly; we modify the **State**, and the screen updates to match.

### The `STATE` Object
```javascript
const STATE = {
    money: 200,          // Current balance
    gameTime: 480,       // Minutes from midnight (480 = 8:00 AM)
    stats: {             // Pet health metrics (0-100)
        hunger: 100,
        energy: 100,
        ...
    },
    chores: {
        progress: {}     // Tracks which specific chores are done
                         // e.g. "dishes_0": true
    }
};
```
**Why this matters**: This allows us to "save" or "reset" the game easily. By clearing `STATE.chores.progress`, we instantly reset the daily tasks without needing complex logic.

---

## 3. 💓 The "Heartbeat": The Game Loop
The game is "alive" because of the **Game Loop** (`initGameLoop`). This runs automatically every 1 second (1000ms).

### Cycle Steps:
1.  **Decay**: Every second, the pet gets slightly hungrier and dirtier (`decayStats()`).
2.  **Time**: In-game time moves forward by 15 minutes.
3.  **Check Triggers**:
    *   **New Day**: If time passes 1440 (24:00), we wrap around to 0. We reset chores and charge Rent ($10).
    *   **Game Over**: If any stat hits 0, the loop stops, and the "Death Screen" is shown.
4.  **Update View**: Calls `updateUI()` and `updatePetBehavior()` to ensure the player sees the new numbers immediately.

---

## 4. 👁️ The "World": 3D Rendering (Three.js)
We use a library called **Three.js** to draw 3D shapes in the browser.

### The Rendering Pipeline:
1.  **Scene**: The empty universe (background color, fog).
2.  **Camera**: The user's eye. Positioned at `(0, 5, 15)` to look down at the room.
3.  **Renderer**: The paint. It takes the Scene + Camera and draws it to the `<canvas>` 60 times a second (`animate()` function).

### Dynamic Generation (`buildRoom`):
Instead of "loading" a pre-made level, we simple **code the room**.
*   **Logic**: `buildRoom()` checks `STATE.currentRoom` (e.g., "kitchen").
*   **Action**: It wipes the previous room and runs specific commands like `createFurniture()` or `createKitchenFixtures()` to place 3D boxes and cylinders in the right spots.
*   **Result**: Changing rooms is instantaneous and requires no file loading.

---

## 5. 👆 The "Touch": Interaction (Raycasting)
Since the 3D screen is just a 2D image to the mouse, we use **Raycasting** to detect clicks.

### The Click Logic:
1.  **Event**: User clicks the mouse on the screen.
2.  **Normalize**: We turn the pixel coordinates (e.g., x:500, y:300) into a standard -1 to +1 grid.
3.  **Raycast**: We mathematically shoot a "laser beam" from the camera interactions through that point into the 3D world.
4.  **Detect**: The laser returns a list of all objects it passed through.
5.  **Identify**: We look at the first object hit. We check its **UserData**:
    *   `obj.userData = { action: 'openFridge' }`
6.  **Execute**: If a valid action is found, we run the corresponding function.

---

## 6. 🧹 The "Economy": Chore System
The economy drives player engagement. It connects the 3D world interactions to the Data Model.

### Work Flow:
1.  **Spawn**: `setupChores()` places objects (Dirt, Dishes) in the room *only if* they aren't in `STATE.chores.progress`.
2.  **Click**: When a player clicks a chore:
    *   **Hide**: The 3D object disappears.
    *   **Record**: The ID is saved to `STATE.chores.progress`.
    *   **Pay**: Money is added to `STATE.money`.
    *   **React**: The pet plays an animation.

### Global Chores (e.g., Floors):
Some tasks exist in *multiple* rooms.
*   **Logic**: The code counts how many "Floor" instances are done *across all rooms*.
*   **Reward**: The big cash prize ($120) is only given when `TotalDone == TotalExists`.

---

## 7. 🏦 The "Progress": Savings & Rewards
To keep players motivated, we implemented a tiered reward system tied to **Financial Literacy**.

*   **Compound Interest**: Every minute, `STATE.savings` grows by 2%. This teaches the value of saving early.
*   **Unlockables**:
    *   The function `checkSavingsRewards()` runs whenever money is deposited.
    *   If `Savings > $200`, it sets `STATE.inventory.rugUnlocked = true`.
    *   The `buildRoom()` function sees this flag and draws a **Rug** in the living room next time it updates.
    *   This provides a visual trophy for good financial habits.
