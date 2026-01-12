# FBLA Virtual Pet 2026: "Eco-Bot & Friends"

**FBLA Competitive Event**: Introduction to Programming (2025-2026)  
**Student Developer**: [Your Name]  
**School**: Stevenson High School

---

## 1. Project Title & Description
**Eco-Bot & Friends** is a **3D Virtual Pet Simulation** that merges the nostalgic engagement of a Tamagotchi with rigorous **Financial Literacy** concepts.

**Elevator Pitch**:  
Unlike traditional virtual pets that only require feeding and playing, "Eco-Bot & Friends" simulates a real-world micro-economy. The player must manage scarce resources (**Energy**) to perform labor (**Chores**), earn income (**Money**), and maintain a budget for their pet's survival. The game introduces the unique "Cost of Care" system, where neglecting the pet results in prohibitively expensive "Vet Bills," teaching the economic principle that preventative maintenance is cheaper than emergency repairs.

### Key Capabilities
*   **3D Interactive World**: A fully explorable house with four distinct rooms (Living Room, Kitchen, Bedroom, Bathroom).
*   **Financial Simulation**: Features a savings account with compound interest and "Education" investments for long-term ROI.
*   **Dynamic Pet AI**: A Finite State Machine (FSM) drives the pet's needs and emotional responses.

---

## 2. Installation & Requirements

### A. Prerequisites
To run this software, the judge/user requires:
*   A modern web browser (Google Chrome, Microsoft Edge, or Firefox).
*   **No backend installation** (Node.js/Python) is required as the project uses client-side technologies.
*   *Optional*: Visual Studio Code with the "Live Server" extension is recommended for the most stable experience (avoids local CORS restrictions).

### B. Installation Steps
1.  **Download**: Unzip the project folder `Virtual Pet 2.0`.
2.  **Launch**:
    *   **Method 1 (Recommended)**: Right-click `index.html` and select "Open with Live Server" (if using VS Code).
    *   **Method 2**: Simply double-click `index.html` to open it in your default browser.
3.  **Verification**: The game requires an active internet connection on the first launch to load the **Three.js** and **Tailwind CSS** libraries via CDN.

---

## 3. Usage Instructions (How to Play)

### A. Commands & Controls
The interface is designed for intuitive User Experience (UX):

| Action | Control Input | Description |
| :--- | :--- | :--- |
| **Move Room** | Keys `1` - `4` | `1`: Living Room, `2`: Kitchen, `3`: Bedroom, `4`: Bathroom |
| **Interact** | **Left Click** | Click on 3D objects (Chores, Doors, Items) to interact. |
| **Action** | `Spacebar` | Trigger the room's main utility (e.g., Sleep in Bed). |
| **Help** | **Help Button (?)** | View the instruction modal at any time. |

### B. The "Cost of Care" Financial System
Success in this game depends on financial discipline, not just clicking buttons.
1.  **Earning (The Labor Market)**:
    *   Navigate rooms to find chores (e.g., *Dishes* in Kitchen, *Laundry* in Bedroom).
    *   **Trade-off**: Every chore costs **Energy**. If your Energy hits 0, you cannot work.
    *   **Strategy**: Invest in the **Education Upgrade ($50)** early. It raises the payout of *all* future chores by $5.

2.  **Spending (The Marketplace)**:
    *   Access the **Computer** in the Living Room to buy Food, Energy Drinks, and Toys.
    *   **Budgeting**: Essential items (Food) fluctuate in necessity. Non-essentials (Toys) boost Happiness but drain savings.

3.  **Saving (Compound Interest)**:
    *   Money deposited in the bank earns **2% Interest per minute**.
    *   **Goal**: Reach $200 in savings to unlock the "Golden Crown" status symbol.

### C. Pet Care
Monitor the HUD bars at the top left:
*   **Hunger**: Buy 'Kibble' ($15) from the Market and feed via the Fridge.
*   **Energy**: Sleep in the Bedroom (10 PM - 6 AM). Use 'Energy Drinks' ($40) for emergency boosts.
*   **Hygiene**: Click the Bathtub in the Bathroom.
*   **Happiness**: Play with toys or keep the house clean.

---

## 4. Technologies Used

### Development Environment
*   **IDE**: Visual Studio Code
*   **Version Control**: Git

### Languages & Libraries
*   **Core Logic**: Vanilla JavaScript (ES6+) - *No heavy game engines used.*
*   **Rendering**: **Three.js** (r128 via CDN) - *Used for WebGL scene graph and 3D rendering.*
*   **Styling**: **Tailwind CSS** (v3.4 via CDN) - *Utility-first CSS for responsive HUD design.*
*   **Markup**: HTML5 - *Semantic structure.*

---

## 5. Credits & Acknowledgments

### FBLA Academic Integrity Statement
The core game logic, including the Finite State Machine (FSM), Financial Algorithms, and Raycasting Interaction System, was written 100% by the student developer. No generative AI or templates were used to generate the game loop.

### External Assets & Attribution
We strictly attribute the following external resources used under the MIT License or Open Source provisions:
*   **3D Core Library**: [Three.js](https://threejs.org/) (MIT License).
*   **CSS Framework**: [Tailwind CSS](https://tailwindcss.com/) (MIT License).
*   **Fonts**: "Inter" font family via [Google Fonts](https://fonts.google.com/) (Open Font License).
*   **Textures**: All floor and wall textures are **procedurally generated** using the HTML5 Canvas API within the code (`buildRoom` function). No copyrighted image files were downloaded or included.
*   **Emojis**: UI Icons utilize standard Unicode Emojis (System Default).

---

> **Created by [Your Name], Stevenson High School.**
>
> *Inspired by a passion for Mechanical Engineering and Financial Literacy.*
