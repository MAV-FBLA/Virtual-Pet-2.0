const CONFIG = {
    decayRates: {
        hunger: 0.8,
        energy: 0.5,
        hygiene: 0.6,
        happiness: 0.5
    },
    savingsGoal: 100,
    salary: 50
};

const STATE = {
    money: 200,
    savings: 0,
    day: 1,
    uiHidden: false,
    lifetimeEarnings: 0,
    petName: "Buddy",
    petType: "dog",
    stats: {
        hunger: 100,
        energy: 100,
        hygiene: 100,
        happiness: 100
    },
    gameTime: 480,
    spending: {
        food: 0,
        toys: 0,
        education: 0,
        care: 0,
        rent: 0,
        utilities: 0
    },
    educationLevel: 0,
    inventory: {
        food: 0,

        toys: [],
        hatUnlocked: false,
        rugUnlocked: false,
        plantUnlocked: false,
        paintingUnlocked: false,
        trophyUnlocked: false
    },
    currentRoom: 'livingroom',
    lastTick: Date.now(),
    chores: {
        progress: {}
    },
    tracking: {
        totalHappinessTicks: 0,
        happinessTickCount: 0,
        nearDeathScenarios: 0,
        nearDeathFlags: { hunger: false, energy: false, hygiene: false, happiness: false }
    },
    transactions: [],
    netWorthHistory: [],
    gameOver: false
};

// === CORE SYSTEM: PERSISTENCE ===

/**
 * @description The factory default state snapshot. Deep cloned at runtime.
 * @constant {Object}
 */
const DEFAULT_STATE = JSON.parse(JSON.stringify(STATE));

const SAVE_KEY = 'MAVPet_SaveData';

/**
 * Recursively traverses a Three.js group, disposing all geometries, materials, and textures.
 *
 * @param {THREE.Object3D} group - The root object to dispose.
 * @returns {void}
 */
function disposeGroup(group) {
    if (!group) return;
    group.traverse((child) => {
        if (child.isMesh || child.isSprite) {
            if (child.geometry && !child.geometry.isCached) child.geometry.dispose();
            if (child.material && !child.material.isCached) {
                if (child.material.map && !child.material.map.isCached) child.material.map.dispose();
                child.material.dispose();
            }
        }
    });
}

/** Cached DOM element references to avoid repeated getElementById calls. */
let DOM = {};

/** When true, updateUI() will run on the next game tick. */
let uiDirty = true;

/** Shared animation queue processed in the render loop. Each entry returns true when done. */
const activeAnimations = [];

/** Tick counter for save throttling. */
let tickCounter = 0;

/**
 * Logs a finalized monetary transaction into the player's historical ledger.
 *
 * @param {string} category - Classification subset (e.g., 'Income').
 * @param {string} description - Readable log output for audit statements.
 * @param {number} amount - The numeric delta adjusted in the account.
 * @returns {void}
 */
function recordTransaction(category, description, amount) {
    STATE.transactions.push({ day: STATE.day, time: STATE.gameTime, category, description, amount });
    if (STATE.transactions.length > 200) STATE.transactions.shift();
}

/**
 * Emits a snapshot of the player's total cumulative fiat assets.
 * Evaluated historically within global graphs.
 * 
 * @returns {void}
 */
function recordNetWorth() {
    STATE.netWorthHistory.push({ day: STATE.day, netWorth: STATE.money + STATE.savings });
}

/**
 * Serializes global environment constructs to persistent storage memory.
 * Operations invoke standard error suppression.
 *
 * @returns {void}
 * @throws {Error} Will intercept and log warnings gracefully.
 */
function saveGameState() {
    try {
        const serialized = JSON.stringify(STATE);
        localStorage.setItem(SAVE_KEY, serialized);
    } catch (e) {
        console.warn('[MAV-Pet] Save failed:', e);
    }
}

/**
 * Safely transverses nested states mapping loaded parameters to pristine defaults.
 * Resilient against partial save states from earlier software releases.
 *
 * @param {Object} defaults - Pristine reference schema.
 * @param {Object} saved - Retrieved persistence schema payload.
 * @returns {Object} Deep-merged memory graph context.
 */
function deepMerge(defaults, saved) {
    const result = {};
    for (const key of Object.keys(defaults)) {
        if (
            saved.hasOwnProperty(key) &&
            typeof defaults[key] === 'object' &&
            defaults[key] !== null &&
            !Array.isArray(defaults[key])
        ) {
            // Recurse into nested plain objects
            result[key] = deepMerge(defaults[key], saved[key] ?? {});
        } else if (saved.hasOwnProperty(key)) {
            result[key] = saved[key];
        } else {
            result[key] = defaults[key];
        }
    }
    return result;
}

/**
 * Ensures strict typing bounds verifying saved parameters aren't corrupted.
 * 
 * @param {Object} data - Transient payload object to scrutinize.
 * @returns {boolean} Whether validation confirms an intact game struct.
 */
function validateSaveData(data) {
    // Ensure core properties are the right type
    if (typeof data.money !== 'number' || isNaN(data.money)) return false;
    if (typeof data.day !== 'number' || data.day < 1) return false;
    if (typeof data.petType !== 'string' || !['dog', 'cat', 'rabbit'].includes(data.petType)) return false;
    if (typeof data.petName !== 'string' || data.petName.length === 0) return false;

    // Validate stats are numbers in [0, 100]
    const statKeys = ['hunger', 'energy', 'hygiene', 'happiness'];
    for (const s of statKeys) {
        const val = data.stats?.[s];
        if (typeof val !== 'number' || isNaN(val) || val < 0 || val > 100) return false;
    }

    return true;
}

/**
 * Engages global system bootstrap utilizing localStorage payload records.
 * Generates initial tick deltas mapping game resumption state.
 *
 * @returns {boolean} True if the hydration operation finalized securely.
 */
function loadGameState() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return false;

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return false;

        // Deep-merge saved data over defaults so missing keys get defaults
        const merged = deepMerge(DEFAULT_STATE, parsed);

        if (!validateSaveData(merged)) {
            console.warn('[MAV-Pet] Save data failed validation – starting fresh.');
            localStorage.removeItem(SAVE_KEY);
            return false;
        }

        // Hydrate the live STATE object
        Object.assign(STATE, merged);
        STATE.lastTick = Date.now(); // Reset tick timer so decay doesn't jump
        return true;
    } catch (e) {
        console.warn('[MAV-Pet] Load failed (corrupted data?) – starting fresh:', e);
        localStorage.removeItem(SAVE_KEY);
        return false;
    }
}

/**
 * Fully purges environment variables triggering system-level interface wipe.
 *
 * @returns {void}
 */
function resetGame() {
    localStorage.removeItem(SAVE_KEY);
    location.reload();
}
window.resetGame = resetGame;

const CHORE_CONFIG = {
    dishes: {
        id: 'dishes',
        name: 'Dish Dynamo',
        reward: 10,
        lesson: "Consistent, small-scale labor pays off!",
        room: 'kitchen',
        count: 3,
        actionName: "Scrubbing Dish"
    },
    dusting: {
        id: 'dusting',
        name: 'Dusting the Hub',
        reward: 6,
        room: 'livingroom',
        count: 3,
        actionName: "Dusting"
    },
    recycling: {
        id: 'recycling',
        name: 'Recycling Sort',
        reward: 14,
        room: 'livingroom',
        count: 1,
        actionName: "Sorting Recycling"
    },
    floors: {
        id: 'floors',
        name: 'Clean The Floor',
        reward: 120,
        lesson: "Large-scale tasks take time but pay better.",
        room: ['livingroom', 'kitchen', 'bedroom', 'bathroom'],
        count: 2,
        global: true,
        actionName: "Polishing Floor"
    },
    laundry: {
        id: 'laundry',
        name: 'Laundry Specialist',
        reward: 12,
        room: 'bedroom',
        count: 3,
        actionName: "Folding Laundry"
    },
    windows: {
        id: 'windows',
        name: 'Crystal Clear Windows',
        reward: 80,
        lesson: "Maintaining assets increases their longevity.",
        room: ['livingroom'],
        count: 2,
        global: true,
        actionName: "Cleaning Window"
    },
    mirror: {
        id: 'mirror',
        name: 'Mirror Shine',
        reward: 8,
        room: 'bathroom',
        count: 1,
        actionName: "Wiping Mirror"
    }
};

/**
 * Resolves deterministic global chore mapping unique identifier identifiers.
 *
 * @param {string} baseId - Core mapping tag.
 * @param {string} room - Physical domain string matching room keys.
 * @returns {string} Fully qualified instance mapping layout string.
 */
const getChoreInstanceId = (baseId, room) => {
    const cfg = CHORE_CONFIG[baseId];
    if (cfg.global) return `${baseId}_${room}`;
    return baseId;
};

/**
 * Extracts and transforms chore baseline compensation by parsing player education attributes.
 *
 * @param {string} baseId - Core mapping tag utilized array searching.
 * @returns {number} Computed positive compensation integral.
 */
const getChoreReward = (baseId) => {
    const cfg = CHORE_CONFIG[baseId];
    return cfg.reward + (STATE.educationLevel * 5);
};


let scene, camera, renderer;
let petGroup, petMesh, emoteSprite;
let hatMesh;
let roomGroup;
let raycaster, pointer;
let decayInterval, interestInterval;

const CACHE = {
    mat: {},
    geo: {}
};
let interactableObjects = [];
let lastIsNight = null;

function setText(el, val) {
    if (el && el.innerText !== String(val)) el.innerText = val;
}
function setWidth(el, val) {
    if (el && el.style.width !== String(val)) el.style.width = val;
}
function updateInteractables() {
    interactableObjects = [];
    if (!scene) return;
    scene.traverse((obj) => {
        if (obj.userData && obj.userData.type === 'interactable') {
            interactableObjects.push(obj);
        }
    });
}


/**
 * Attaches stopPropagation listeners to all prevent-click-through elements.
 * 
 * @returns {void}
 */
function attachPreventClickThrough() {
    document.querySelectorAll('.prevent-click-through').forEach(el => {
        el.addEventListener('click', (e) => e.stopPropagation());
    });
}

/** Tracks whether the global spacebar listener has been registered. */
let spacebarListenerAttached = false;

/**
 * Bootstraps runtime application instances post character election logic.
 *
 * @param {string} type - Core enum ('dog', 'cat', 'rabbit').
 * @returns {void}
 */
window.startGame = (type) => {
    attachPreventClickThrough();

    const nameInput = document.getElementById('pet-name-input').value.trim();

    if (!nameInput) {
        showNotification("Please name your pet!", "error");
        return;
    }

    // Reset STATE to factory defaults before starting fresh
    Object.assign(STATE, JSON.parse(JSON.stringify(DEFAULT_STATE)));

    STATE.petType = type;
    STATE.petName = nameInput;
    recordNetWorth();

    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');

    initDOMCache();
    initThreeJS();
    initGameLoop();

    saveGameState(); // Persist initial state

    showNotification(`Welcome, ${STATE.petName}!`, "success");

    if (!spacebarListenerAttached) {
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') e.preventDefault();
        });
        spacebarListenerAttached = true;
    }

    startTutorial();
};

/**
 * Escalates core bootstrap procedures, immediately delegating previously populated contexts.
 *
 * @returns {void}
 */
window.resumeGame = () => {
    attachPreventClickThrough();

    // Hydrate STATE from save data now (not before)
    loadGameState();

    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');

    initDOMCache();
    initThreeJS();
    initGameLoop();

    showNotification(`Welcome back, ${STATE.petName}!`, "success");

    if (!spacebarListenerAttached) {
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') e.preventDefault();
        });
        spacebarListenerAttached = true;
    }
};

/**
 * Mounts standard WebGL Three.js orchestration dependencies.
 * Establishes perspective, geometry pipelines, and lighting constraints.
 * 
 * @returns {void}
 */
function initThreeJS() {
    const container = document.getElementById('canvas-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202025);
    scene.fog = new THREE.Fog(0x202025, 10, 50);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 15);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);

    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();
    window.addEventListener('click', onMouseClick);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', onWindowResize);

    buildRoom();
    buildPet();
    updateInteractables();
}

/**
 * Syncs canvas viewport constraints against browser native resize intercepts.
 * 
 * @returns {void}
 */
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function initCaches() {
    if (CACHE.geo.floor) return;

    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 32, 32); ctx.fillRect(32, 32, 32, 32);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 10);
    tex.isCached = true;

    CACHE.mat.bathroomFloor = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
    CACHE.mat.bathroomWall = new THREE.MeshStandardMaterial({ color: 0xf1f5f9 });
    CACHE.mat.normalFloor = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
    CACHE.mat.normalWall = new THREE.MeshStandardMaterial({ color: 0x475569 });
    
    Object.values(CACHE.mat).forEach(m => m && (m.isCached = true));

    CACHE.geo.floor = new THREE.PlaneGeometry(30, 30);
    CACHE.geo.backWall = new THREE.BoxGeometry(30, 10, 1);
    CACHE.geo.sideWall = new THREE.BoxGeometry(1, 10, 30);
    Object.values(CACHE.geo).forEach(g => g && (g.isCached = true));
}

/**
 * Programmatically destructs and rebuilds 3D environment nodes mapped to room navigation states.
 * 
 * @returns {void}
 */
function buildRoom() {
    initCaches();
    
    if (roomGroup) {
        disposeGroup(roomGroup);
        scene.remove(roomGroup);
    }
    roomGroup = new THREE.Group();

    setupChores(STATE.currentRoom);
    updateTaskSidebar();

    let floorMat, wallMat, doorFrameColor, doorPanelColor;

    if (STATE.currentRoom === 'bathroom') {
        floorMat = CACHE.mat.bathroomFloor;
        wallMat = CACHE.mat.bathroomWall;
        doorFrameColor = 0xffffff;
        doorPanelColor = 0xe2e8f0;
    } else {
        floorMat = CACHE.mat.normalFloor;
        wallMat = CACHE.mat.normalWall;
        doorFrameColor = 0x1e293b;
        doorPanelColor = 0x64748b;
    }

    const floor = new THREE.Mesh(CACHE.geo.floor, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    roomGroup.add(floor);

    const backWall = new THREE.Mesh(CACHE.geo.backWall, wallMat);
    backWall.position.set(0, 5, -15);
    backWall.receiveShadow = true;
    roomGroup.add(backWall);

    const leftWall = new THREE.Mesh(CACHE.geo.sideWall, wallMat);
    leftWall.position.set(-15, 5, 0);
    leftWall.receiveShadow = true;
    roomGroup.add(leftWall);

    const rightWall = new THREE.Mesh(CACHE.geo.sideWall, wallMat);
    rightWall.position.set(15, 5, 0);
    rightWall.receiveShadow = true;
    roomGroup.add(rightWall);

    if (STATE.currentRoom === 'livingroom') {
        createFurniture(13, 0, 0, 0x1e293b, "Sofa", -Math.PI / 2);
        createComputer(0, 2, -14);

        createDoor(-8, 0, -14.5, 0, 'kitchen', 0xf97316);
        createDoor(8, 0, -14.5, 0, 'bathroom', 0x3b82f6);
        createDoor(-14.5, 0, -9, Math.PI / 2, 'bedroom', 0x8b5cf6);

        createWindow(-12.5, 6, -14.4, 0, 2.5, 3.5);
        createWindow(12.5, 6, -14.4, 0, 2.5, 3.5);
        createWindow(14.4, 5, 0, -Math.PI / 2, 8, 3.5);

    } else if (STATE.currentRoom === 'kitchen') {
        createKitchenFixtures();
        createDoor(0, 0, -14.5, 0, 'livingroom', 0x14b8a6);

    } else if (STATE.currentRoom === 'bedroom') {
        createBedroomFixtures();
        createDoor(14.5, 0, -9, -Math.PI / 2, 'livingroom', 0x14b8a6);

    } else if (STATE.currentRoom === 'bathroom') {
        createBathroomFixtures();
        createDoor(-8, 0, -14.5, 0, 'livingroom', 0x14b8a6, doorFrameColor, doorPanelColor);
    }

    if (STATE.currentRoom === 'livingroom') {
        renderToys();
    }

    scene.add(roomGroup);
    updateInteractables();
}

/**
 * Orchestrates rendering mapping protocols for interactive chore manifestations.
 *
 * @param {string} room - Active domain context.
 * @returns {void}
 */
function setupChores(room) {
    const makeInteractable = (mesh, baseId, subId) => {
        const uniqueId = getChoreInstanceId(baseId, room);
        mesh.userData = {
            type: 'interactable',
            action: `doChore:${baseId}:${uniqueId}:${subId}`,
            choreId: baseId
        };
        return mesh;
    };

    const isCleaned = (baseId, subId) => {
        const uniqueId = getChoreInstanceId(baseId, room);
        const progress = STATE.chores.progress[uniqueId] || [];
        return progress.includes(subId);
    }

    if (room === 'kitchen') {
        for (let i = 0; i < CHORE_CONFIG.dishes.count; i++) {
            if (isCleaned('dishes', i)) continue;

            const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
            const grime = new THREE.Mesh(new THREE.CircleGeometry(0.3, 8), new THREE.MeshBasicMaterial({ color: 0x5c4033, opacity: 0.7, transparent: true }));
            grime.rotation.x = -Math.PI / 2;
            grime.position.y = 0.03;
            plate.add(grime);

            plate.position.set(-11 + (Math.random() * 0.5), 3.6 + (i * 0.06), -13.5 + (Math.random() * 0.5));
            roomGroup.add(makeInteractable(plate, 'dishes', i));
        }
    }

    if (room === 'livingroom') {
        for (let i = 0; i < CHORE_CONFIG.dusting.count; i++) {
            if (isCleaned('dusting', i)) continue;

            const dustGroup = new THREE.Group();
            const particleMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.8, roughness: 1 });
            for (let px = 0; px < 5; px++) {
                const size = 0.1 + Math.random() * 0.15;
                const p = new THREE.Mesh(new THREE.SphereGeometry(size, 4, 4), particleMat);
                p.position.set((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.4);
                dustGroup.add(p);
            }
            const positions = [
                { x: -8, y: 0.2, z: 2 },
                { x: 8, y: 0.2, z: 2 },
                { x: 7, y: 0.2, z: 6 }
            ];
            const pos = positions[i] || { x: i, y: 0, z: 0 };
            dustGroup.position.set(pos.x + (Math.random() - 0.5), pos.y, pos.z + (Math.random() - 0.5));

            const hitBox = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), new THREE.MeshBasicMaterial({ color: 0xff0000, visible: true, transparent: true, opacity: 0 }));
            dustGroup.add(hitBox);
            roomGroup.add(makeInteractable(dustGroup, 'dusting', i));
        }
    }

    if (room === 'livingroom' && !isCleaned('recycling', 0)) {
        const binGroup = new THREE.Group();
        binGroup.position.set(-10, 0, 10);
        const colors = [0x3b82f6, 0x22c55e, 0xef4444];
        colors.forEach((col, idx) => {
            const bin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2, 1.5), new THREE.MeshStandardMaterial({ color: col }));
            bin.position.set(idx * 2, 1, 0);
            binGroup.add(bin);
        });
        roomGroup.add(binGroup);

        const trash = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6), new THREE.MeshStandardMaterial({ color: 0x475569, wireframe: true }));
        trash.position.set(-8, 0.6, 8);
        roomGroup.add(makeInteractable(trash, 'recycling', 0));
    }

    if (CHORE_CONFIG.floors.room.includes(room)) {
        for (let i = 0; i < CHORE_CONFIG.floors.count; i++) {
            if (isCleaned('floors', i)) continue;

            const grime = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshStandardMaterial({ color: 0x332f2c, transparent: true, opacity: 0.8 }));
            grime.rotation.x = -Math.PI / 2;
            const rx = (Math.random() * 17) - 12;
            const rz = (Math.random() * 20) - 10;
            grime.position.set(rx, 0.05, rz);
            roomGroup.add(makeInteractable(grime, 'floors', i));
        }
    }

    if (room === 'bedroom') {
        const basket = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1, 1.5, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0xd97706, side: THREE.DoubleSide }));
        basket.position.set(-10, 0.75, 10);
        roomGroup.add(basket);

        for (let i = 0; i < CHORE_CONFIG.laundry.count; i++) {
            if (isCleaned('laundry', i)) continue;
            const clothes = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.8), new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff }));
            clothes.rotation.y = Math.random() * Math.PI;
            clothes.position.set((Math.random() * 10) - 5, 0.1, (Math.random() * 10) - 5);
            roomGroup.add(makeInteractable(clothes, 'laundry', i));
        }
    }

    if (CHORE_CONFIG.windows.room.includes(room)) {
        let winPositions = [];
        if (room === 'livingroom') winPositions = [
            { x: 12.5, y: 5.5, z: -14.3 },
            { x: 11.5, y: 4.5, z: -14.3 }
        ];

        // Limit to count
        winPositions.slice(0, CHORE_CONFIG.windows.count).forEach((pos, idx) => {
            if (isCleaned('windows', idx)) return;
            const grime = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x57534e, transparent: true, opacity: 0.7 }));
            grime.position.set(pos.x, pos.y, pos.z);
            if (pos.rot) grime.rotation.y = pos.rot;
            if (pos.rot) grime.position.x -= 0.1; else grime.position.z += 0.1;
            roomGroup.add(makeInteractable(grime, 'windows', idx));
        });
    }

    if (room === 'bathroom') {
        const fogPos = [{ x: -0.5, y: 5.5 }, { x: 0.5, y: 5.5 }, { x: -0.5, y: 4.5 }, { x: 0.5, y: 4.5 }];
        fogPos.slice(0, CHORE_CONFIG.mirror.count).forEach((p, i) => {
            if (isCleaned('mirror', i)) return;
            const fog = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
            fog.position.set(p.x, p.y, -14.8);
            roomGroup.add(makeInteractable(fog, 'mirror', i));
        });
    }
}

/**
 * Assembles architectural bounding box gateways establishing cross-room navigational vectors.
 *
 * @param {number} x - Vector x coordinate translation.
 * @param {number} y - Vector y coordinate translation.
 * @param {number} z - Vector z coordinate translation.
 * @param {number} rotationY - Euler rotation constraint isolating Y-axis pivot.
 * @param {string} targetRoom - Target enum route identifier matching DOM room nodes.
 * @param {number} colorHex - Base hexadecimal integer for core door accent.
 * @param {number} [frameColor=0x1e293b] - Hexadecimal integer isolating door molding.
 * @param {number} [panelColor=0x64748b] - Hexadecimal integer isolating door pane.
 * @returns {void}
 */
function createDoor(x, y, z, rotationY, targetRoom, colorHex, frameColor = 0x1e293b, panelColor = 0x64748b) {
    const doorGroup = new THREE.Group();
    doorGroup.position.set(x, y, z);
    doorGroup.rotation.y = rotationY;

    doorGroup.userData = { type: 'interactable', action: `changeRoom:${targetRoom}` };

    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(5, 8, 1), new THREE.MeshStandardMaterial({ color: frameColor }));
    doorFrame.position.y = 4;
    doorGroup.add(doorFrame);

    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(4, 7.5, 0.2), new THREE.MeshStandardMaterial({ color: panelColor }));
    doorPanel.position.set(0, 3.8, 0.6);
    doorGroup.add(doorPanel);

    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshStandardMaterial({ color: colorHex }));
    knob.position.set(1.5, 3.5, 0.8);
    doorGroup.add(knob);

    const signGroup = new THREE.Group();
    signGroup.position.set(0, 4.5, 1.0); // Floating slightly above the doorknob (knob is y=3.5)
    signGroup.rotation.x = 0; // Flat orientation since it's around camera level

    const sign = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 0.2), new THREE.MeshStandardMaterial({ color: colorHex }));
    sign.position.set(0, 0, 0);
    signGroup.add(sign);

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const names = { livingroom: 'Living Room', bedroom: 'Bedroom', kitchen: 'Kitchen', bathroom: 'Bathroom' };
    const roomDisplayName = names[targetRoom] || targetRoom;
    ctx.fillText(roomDisplayName, 256, 64);

    const tex = new THREE.CanvasTexture(canvas);
    const textPlane = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.75), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    textPlane.position.set(0, 0, 0.11); // perfectly layered on top of the sign block
    signGroup.add(textPlane);

    doorGroup.add(signGroup);

    const hitBox = new THREE.Mesh(new THREE.BoxGeometry(5, 8, 2), new THREE.MeshBasicMaterial({ visible: false }));
    hitBox.position.y = 4;
    doorGroup.add(hitBox);

    roomGroup.add(doorGroup);
}

/**
 * Binds geometric visual portals acting as ambient environmental light diffusers.
 *
 * @param {number} x - Origin scalar x position.
 * @param {number} y - Origin scalar y position.
 * @param {number} z - Origin scalar z position.
 * @param {number} rotationY - Transform orientation mapping.
 * @param {number} [width=3] - Scalable dimension modifier along x-axis.
 * @param {number} [height=4] - Scalable dimension modifier along y-axis.
 * @returns {void}
 */
function createWindow(x, y, z, rotationY, width = 3, height = 4) {
    const winGroup = new THREE.Group();
    winGroup.position.set(x, y, z);
    winGroup.rotation.y = rotationY;

    const frameGeo = new THREE.BoxGeometry(width + 0.4, height + 0.4, 0.2);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    winGroup.add(frame);

    const skyGeo = new THREE.PlaneGeometry(width, height);
    const skyMat = new THREE.MeshBasicMaterial({ color: 0x87ceeb });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.position.z = 0.11;
    winGroup.add(sky);

    const glassGeo = new THREE.PlaneGeometry(width, height);
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, roughness: 0, metalness: 0.9 });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.z = 0.12;
    winGroup.add(glass);

    const barV = new THREE.Mesh(new THREE.BoxGeometry(0.2, height, 0.1), frameMat);
    barV.position.z = 0.13;
    winGroup.add(barV);

    const barH = new THREE.Mesh(new THREE.BoxGeometry(width, 0.2, 0.1), frameMat);
    barH.position.z = 0.13;
    winGroup.add(barH);

    roomGroup.add(winGroup);
}

/**
 * Renders high-fidelity mesh hierarchies strictly corresponding to sanitary amenities.
 * 
 * @returns {void}
 */
function createBathroomFixtures() {
    const tubGroup = new THREE.Group();
    tubGroup.position.set(6, 0, -10);
    const tubMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.8, roughness: 0.2 });

    const tubBottom = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 3), tubMat); tubBottom.position.y = 0.25; tubGroup.add(tubBottom);
    const wallFront = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 0.2), tubMat); wallFront.position.set(0, 1.5, 1.4); tubGroup.add(wallFront);
    const wallBack = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 0.2), tubMat); wallBack.position.set(0, 1.5, -1.4); tubGroup.add(wallBack);
    const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 2.6), tubMat); wallLeft.position.set(-2.9, 1.5, 0); tubGroup.add(wallLeft);
    const wallRight = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 2.6), tubMat); wallRight.position.set(2.9, 1.5, 0); tubGroup.add(wallRight);

    const water = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.5, 2.6), new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6 }));
    water.position.set(0, 1.0, 0);
    tubGroup.add(water);

    const tFaucetV = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.5), chromeMat); tFaucetV.position.set(0, 1.25, -1.6); tubGroup.add(tFaucetV);
    const tFaucetH = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8), chromeMat); tFaucetH.position.set(0, 2.5, -1.2); tFaucetH.rotation.x = Math.PI / 2; tubGroup.add(tFaucetH);
    const tFaucetTip = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3), chromeMat); tFaucetTip.position.set(0, 2.5, -0.8); tubGroup.add(tFaucetTip);

    tubGroup.userData = { type: 'interactable', action: 'cleanPet' };
    const tubHit = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 3), new THREE.MeshBasicMaterial({ visible: false })); tubHit.position.y = 1.5; tubGroup.add(tubHit);
    roomGroup.add(tubGroup);

    const toiletGroup = new THREE.Group(); toiletGroup.position.set(-13, 0, -14);
    const tBase = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 2), tubMat); tBase.position.y = 0.75; toiletGroup.add(tBase);
    const tTank = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2, 0.8), tubMat); tTank.position.set(0, 2.5, -0.6); toiletGroup.add(tTank);
    roomGroup.add(toiletGroup);

    const sinkGroup = new THREE.Group(); sinkGroup.position.set(0, 0, -14);
    const sPedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 3), tubMat); sPedestal.position.y = 1.5; sinkGroup.add(sPedestal);
    const sBasin = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 1.5), tubMat); sBasin.position.y = 3; sinkGroup.add(sBasin);
    const sFaucetV = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5), chromeMat); sFaucetV.position.set(0, 3.25, -0.6); sinkGroup.add(sFaucetV);
    const sFaucetH = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5), chromeMat); sFaucetH.position.set(0, 3.5, -0.4); sFaucetH.rotation.x = Math.PI / 2; sinkGroup.add(sFaucetH);
    const sTip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2), chromeMat); sTip.position.set(0, 3.4, -0.15); sinkGroup.add(sTip);
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(2, 3), new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.1 })); mirror.position.set(0, 5, -14.9); roomGroup.add(mirror);
    roomGroup.add(sinkGroup);
}

/**
 * Instantiates customizable volumetric furniture models.
 *
 * @param {number} x - X-axis global offset.
 * @param {number} y - Y-axis global offset.
 * @param {number} z - Z-axis global offset.
 * @param {number} color - Texture base standard map albedo hex.
 * @param {string} type - Distinct routing key mapping structural subsets.
 * @param {number} [rotationY=0] - Rotational pivot mapping.
 * @returns {void}
 */
function createFurniture(x, y, z, color, type, rotationY = 0) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    if (type === "Sofa") {
        const mat = new THREE.MeshStandardMaterial({ color: color });
        const seat = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 2), mat); seat.position.y = 0.5; seat.castShadow = true; seat.receiveShadow = true; group.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 0.5), mat); back.position.set(0, 1.25, -0.75); back.castShadow = true; back.receiveShadow = true; group.add(back);

        const armGeo = new THREE.BoxGeometry(0.5, 1.5, 2);
        const armL = new THREE.Mesh(armGeo, mat); armL.position.set(-1.75, 0.75, 0); armL.castShadow = true; armL.receiveShadow = true; group.add(armL);
        const armR = new THREE.Mesh(armGeo, mat); armR.position.set(1.75, 0.75, 0); armR.castShadow = true; armR.receiveShadow = true; group.add(armR);
    } else {
        const geo = new THREE.BoxGeometry(4, 2, 2);
        const mat = new THREE.MeshStandardMaterial({ color: color });
        const mesh = new THREE.Mesh(geo, mat); mesh.position.y = 1; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    }
    group.userData = { type: 'furniture', name: type };
    roomGroup.add(group);
}

/**
 * Loads bedroom models and hooks resting state interactive volumes.
 * 
 * @returns {void}
 */
function createBedroomFixtures() {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f });
    const mattressMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const sheetMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6 });
    const pillowMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0 });

    const bedGroup = new THREE.Group(); bedGroup.position.set(0, 0, -10);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 7), woodMat); frame.position.y = 1; bedGroup.add(frame);
    const headboard = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 0.5), woodMat); headboard.position.set(0, 3, -3.25); bedGroup.add(headboard);
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(7.5, 1, 6.5), mattressMat); mattress.position.y = 2.5; bedGroup.add(mattress);
    const sheets = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.1, 4), sheetMat); sheets.position.set(0, 2.5, 1.25); bedGroup.add(sheets);
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.8, 1.5), pillowMat); p1.position.set(-2, 3.2, -2); bedGroup.add(p1);
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.8, 1.5), pillowMat); p2.position.set(2, 3.2, -2); bedGroup.add(p2);

    bedGroup.userData = { type: 'interactable', action: 'sleep' };
    roomGroup.add(bedGroup);

    const nsGeo = new THREE.BoxGeometry(2, 2.5, 2);

    const nsL = new THREE.Mesh(nsGeo, woodMat); nsL.position.set(-5.5, 1.25, -12); roomGroup.add(nsL);
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x000000 })); lampBase.position.set(-5.5, 2.75, -12); roomGroup.add(lampBase);
    const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1, 4, 1, true), new THREE.MeshStandardMaterial({ color: 0xfff7ed, transparent: true, opacity: 0.9 })); lampShade.position.set(-5.5, 3.5, -12); roomGroup.add(lampShade);

    const nsR = new THREE.Mesh(nsGeo, woodMat); nsR.position.set(5.5, 1.25, -12); roomGroup.add(nsR);
    const lampBaseR = lampBase.clone(); lampBaseR.position.set(5.5, 2.75, -12); roomGroup.add(lampBaseR);
    const lampShadeR = lampShade.clone(); lampShadeR.position.set(5.5, 3.5, -12); roomGroup.add(lampShadeR);
}

/**
 * Deploys kitchen scene nodes wrapping culinary processing architectures.
 * 
 * @returns {void}
 */
function createKitchenFixtures() {
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.6, roughness: 0.3 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f });

    const fridgeGroup = new THREE.Group();
    fridgeGroup.position.set(-13.2, 0, -7.1);
    fridgeGroup.rotation.y = Math.PI / 2;

    const fridgeBody = new THREE.Mesh(new THREE.BoxGeometry(3, 7, 3), whiteMat); fridgeBody.position.y = 3.5; fridgeGroup.add(fridgeBody);

    // Door Handles
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, 0.2), chromeMat); handle.position.set(-1, 4, 1.6); fridgeGroup.add(handle);
    const handleLower = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, 0.2), chromeMat); handleLower.position.set(-1, 2, 1.6); fridgeGroup.add(handleLower);

    fridgeGroup.userData = { type: 'interactable', action: 'openFridge' };
    roomGroup.add(fridgeGroup);

    const counterHeight = 3.5;

    const cornerCab = new THREE.Mesh(new THREE.BoxGeometry(3, counterHeight, 3), woodMat);
    cornerCab.position.set(-13.5, counterHeight / 2, -13.5);
    roomGroup.add(cornerCab);
    const cornerTop = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 3), chromeMat);
    cornerTop.position.set(-13.5, counterHeight, -13.5);
    roomGroup.add(cornerTop);

    const sideCab = new THREE.Mesh(new THREE.BoxGeometry(3, counterHeight, 3.5), woodMat);
    sideCab.position.set(-13.5, counterHeight / 2, -10.25);
    roomGroup.add(sideCab);
    const sideTop = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 3.5), chromeMat);
    sideTop.position.set(-13.5, counterHeight, -10.25);
    roomGroup.add(sideTop);

    const sinkKGroup = new THREE.Group(); sinkKGroup.position.set(-8.75, 0, -13.5);

    const sinkCab = new THREE.Mesh(new THREE.BoxGeometry(6.5, counterHeight, 3), woodMat); sinkCab.position.y = counterHeight / 2; sinkKGroup.add(sinkCab);
    const sinkTop = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.2, 3), chromeMat); sinkTop.position.y = counterHeight; sinkKGroup.add(sinkTop);

    const basin = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 2), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2 }));
    basin.position.set(0, counterHeight + 0.11, 0); sinkKGroup.add(basin);

    const fV = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1), chromeMat); fV.position.set(0, counterHeight + 0.5, -0.8); sinkKGroup.add(fV);
    const fH = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.6), chromeMat); fH.position.set(0, counterHeight + 1, -0.6); fH.rotation.x = Math.PI / 2; sinkKGroup.add(fH);
    const fT = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2), chromeMat); fT.position.set(0, counterHeight + 0.9, -0.3); sinkKGroup.add(fT);
    roomGroup.add(sinkKGroup);

    // --- Stove ---
    const stoveGroup = new THREE.Group(); stoveGroup.position.set(-4, 0, -13.5);
    // Body
    const stoveBody = new THREE.Mesh(new THREE.BoxGeometry(3, counterHeight, 3), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 })); stoveBody.position.y = counterHeight / 2; stoveGroup.add(stoveBody);

    // Burners (4 cylinders)
    const burnerGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.1); const burnerMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
    const b1 = new THREE.Mesh(burnerGeo, burnerMat); b1.position.set(-0.7, counterHeight + 0.05, 0.7); stoveGroup.add(b1);
    const b2 = new THREE.Mesh(burnerGeo, burnerMat); b2.position.set(0.7, counterHeight + 0.05, 0.7); stoveGroup.add(b2);
    const b3 = new THREE.Mesh(burnerGeo, burnerMat); b3.position.set(-0.7, counterHeight + 0.05, -0.7); stoveGroup.add(b3);
    const b4 = new THREE.Mesh(burnerGeo, burnerMat); b4.position.set(0.7, counterHeight + 0.05, -0.7); stoveGroup.add(b4);

    // Oven Window
    const ovenWin = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.5), new THREE.MeshStandardMaterial({ color: 0x000000 })); ovenWin.position.set(0, 1.8, 1.51); stoveGroup.add(ovenWin);
    roomGroup.add(stoveGroup);

    // --- Dining Table ---
    const tableGroup = new THREE.Group(); tableGroup.position.set(8, 0, -5);
    const tTop = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.2, 32), new THREE.MeshStandardMaterial({ color: 0xffedd5 })); tTop.position.y = 2.5; tableGroup.add(tTop);
    const tLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 2.5), new THREE.MeshStandardMaterial({ color: 0x78350f })); tLeg.position.y = 1.25; tableGroup.add(tLeg);

    // Chairs arranged in circle
    for (let i = 0; i < 4; i++) {
        const chair = new THREE.Group(); const angle = (i / 4) * Math.PI * 2; const radius = 5;
        chair.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
        chair.lookAt(Math.cos(angle) * radius * 2, 0, Math.sin(angle) * radius * 2);
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 1.5), woodMat); seat.position.y = 1.2; chair.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 0.2), woodMat); back.position.set(0, 2, 0.65); chair.add(back);
        const cBase = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2), woodMat); cBase.position.y = 0.6; chair.add(cBase);
        tableGroup.add(chair);
    }
    roomGroup.add(tableGroup);
}

/**
 * Injects marketplace terminal mesh generating UI interactions mapping to e-commerce modal.
 *
 * @param {number} x - Core mapping origin local x.
 * @param {number} y - Core mapping origin local y.
 * @param {number} z - Core mapping origin local z.
 * @returns {void}
 */
function createComputer(x, y, z) {
    const group = new THREE.Group(); group.position.set(x, y, z);

    const desk = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 2), new THREE.MeshStandardMaterial({ color: 0x5c3a21 })); group.add(desk);

    const monitor = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, 0.1), new THREE.MeshStandardMaterial({ color: 0x000000 })); monitor.position.set(0, 0.6, 0); group.add(monitor);

    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8), new THREE.MeshBasicMaterial({ color: 0x00ff00 })); screen.position.set(0, 0.6, 0.06); group.add(screen);

    group.userData = { type: 'interactable', action: 'openMarket' };

    const hitBox = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 2), new THREE.MeshBasicMaterial({ visible: false }));
    hitBox.userData = { type: 'interactable', action: 'openMarket' };
    group.add(hitBox);
    roomGroup.add(group);
}

/**
 * Hydrates unlocked dynamic decorative entities into the active scene graph based on player inventory.
 * 
 * @returns {void}
 */
function renderToys() {
    // Render unlocked savings rewards
    if (STATE.inventory.rugUnlocked) {
        const rug = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.1, 32), new THREE.MeshStandardMaterial({ color: 0xbe185d }));
        rug.position.set(0, 0.1, 0); rug.receiveShadow = true;
        roomGroup.add(rug);
    }
    if (STATE.inventory.plantUnlocked) {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.6, 1.5), new THREE.MeshStandardMaterial({ color: 0xd97706 }));
        pot.position.set(-13, 0.75, 13);
        const plant = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2), new THREE.MeshStandardMaterial({ color: 0x16a34a }));
        plant.position.set(0, 1.4, 0); pot.add(plant);
        roomGroup.add(pot);
    }
    if (STATE.inventory.paintingUnlocked) {
        const artGroup = new THREE.Group(); artGroup.position.set(0, 6, -14.9);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 0.2), new THREE.MeshStandardMaterial({ color: 0xca8a04 }));
        const canvas = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 3.5), new THREE.MeshStandardMaterial({ color: 0x3b82f6 })); canvas.position.z = 0.11;
        artGroup.add(frame); artGroup.add(canvas);
        roomGroup.add(artGroup);
    }
    if (STATE.inventory.trophyUnlocked) {
        const trophy = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.3, 1.5), new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1, roughness: 0.3 }));
        trophy.position.set(0, 2.75, -14); // On the computer desk
        roomGroup.add(trophy);
    }

    if (STATE.inventory.toys.includes('ball')) {
        const ballGeo = new THREE.SphereGeometry(1, 32, 32);
        const ballMat = new THREE.MeshStandardMaterial({ color: 0xff4757 });
        const ball = new THREE.Mesh(ballGeo, ballMat);
        ball.position.set(5, 1, 8); ball.castShadow = true; ball.receiveShadow = true;
        // Interaction: Play
        ball.userData = { type: 'interactable', action: 'playWithToy' };
        roomGroup.add(ball);
        updateInteractables();
    }
}

/**
 * Assembles and paints specialized character avatar geometry mapping to discrete pet typologies.
 * 
 * @returns {void}
 */
function buildPet() {
    if (petGroup) {
        disposeGroup(petGroup);
        scene.remove(petGroup);
    }
    petGroup = new THREE.Group();

    const mainColor = STATE.petType === 'dog' ? 0xd97706 : (STATE.petType === 'cat' ? 0x94a3b8 : 0xe2e8f0);
    const secondaryColor = 0xffffff;

    if (['dog', 'cat', 'rabbit'].includes(STATE.petType)) {
        const bodyScale = STATE.petType === 'rabbit' ? 0.7 : 1;

        const matInfo = {
            body: new THREE.MeshStandardMaterial({ color: mainColor }),
            accent: new THREE.MeshStandardMaterial({ color: secondaryColor }),
            dark: new THREE.MeshStandardMaterial({ color: 0x1e293b })
        };

        const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1.4), matInfo.body);
        bodyMesh.position.y = 1 * bodyScale; bodyMesh.castShadow = true; petGroup.add(bodyMesh);

        const headGroup = new THREE.Group(); headGroup.position.set(0, 1.8, 0.8);
        headGroup.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matInfo.body));

        const snoutLen = STATE.petType === 'dog' ? 0.6 : 0.2;
        const snoutMesh = new THREE.Mesh(new THREE.BoxGeometry(0.6 * (STATE.petType === 'rabbit' ? 0.8 : 1), 0.4, snoutLen), matInfo.accent);
        snoutMesh.position.set(0, -0.1, 0.5 + snoutLen / 2); headGroup.add(snoutMesh);

        const noseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.1), matInfo.dark);
        noseMesh.position.set(0, 0.05, 0.5 + snoutLen); headGroup.add(noseMesh);

        let earGeo, earPosL, earPosR, earRotL, earRotR;
        if (STATE.petType === 'rabbit') {
            earGeo = new THREE.BoxGeometry(0.2, 1.2, 0.1);
            earPosL = new THREE.Vector3(-0.25, 1.0, 0); earPosR = new THREE.Vector3(0.25, 1.0, 0);
            earRotL = { x: 0, z: -0.1 }; earRotR = { x: 0, z: 0.1 };
        } else {
            earGeo = new THREE.ConeGeometry(0.2, 0.4, 4);
            earPosL = new THREE.Vector3(-0.35, 0.6, 0); earPosR = new THREE.Vector3(0.35, 0.6, 0);
            earRotL = { x: -0.2, z: 0.2 }; earRotR = { x: -0.2, z: -0.2 };
        }
        const earL = new THREE.Mesh(earGeo, matInfo.body); earL.position.copy(earPosL); earL.rotation.x = earRotL.x; earL.rotation.z = earRotL.z;
        const earR = new THREE.Mesh(earGeo, matInfo.body); earR.position.copy(earPosR); earR.rotation.x = earRotR.x; earR.rotation.z = earRotR.z;
        headGroup.add(earL); headGroup.add(earR);

        const eyeGeo = new THREE.BoxGeometry(0.15, 0.15, 0.1);
        const eyeL = new THREE.Mesh(eyeGeo, matInfo.dark); eyeL.position.set(-0.25, 0.1, 0.5); headGroup.add(eyeL);
        const eyeR = new THREE.Mesh(eyeGeo, matInfo.dark); eyeR.position.set(0.25, 0.1, 0.5); headGroup.add(eyeR);
        petGroup.add(headGroup);

        const legGeo = new THREE.BoxGeometry(0.35, 0.8, 0.35);
        [{ x: -0.4, y: 0.4, z: 0.6 }, { x: 0.4, y: 0.4, z: 0.6 }, { x: -0.4, y: 0.4, z: -0.6 }, { x: 0.4, y: 0.4, z: -0.6 }].forEach(pos => {
            const leg = new THREE.Mesh(legGeo, matInfo.body); leg.position.set(pos.x, pos.y, pos.z); leg.castShadow = true; petGroup.add(leg);
        });

        const tailGeo = STATE.petType === 'rabbit' ? new THREE.SphereGeometry(0.25) : new THREE.BoxGeometry(0.2, 0.2, 0.8);
        const tail = new THREE.Mesh(tailGeo, matInfo.body); tail.position.set(0, 1.4 * bodyScale, -0.9 * bodyScale);
        if (STATE.petType !== 'rabbit') tail.rotation.x = 0.5;
        petGroup.add(tail);
    }

    // Unlocked Hat (Crown)
    if (STATE.inventory.hatUnlocked) {
        // Create a Crown Group
        hatMesh = new THREE.Group();

        // Base Gold Ring (Blocky - 8 sides for low-poly look)
        const crownBaseGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 8);
        const crownMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.4, metalness: 0.6, flatShading: true });
        const crownBase = new THREE.Mesh(crownBaseGeo, crownMat);
        hatMesh.add(crownBase);

        // Spikes (4 points to match blocky style)
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2;
            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 4), crownMat);
            spike.position.set(Math.cos(angle) * 0.35, 0.3, Math.sin(angle) * 0.35);
            spike.rotation.y = Math.PI / 4; // Align pyramid with loose cardinal directions
            hatMesh.add(spike);

            // Jewels on spikes (Cubes)
            const jewel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? 0xef4444 : 0x3b82f6, flatShading: true }));
            jewel.position.set(Math.cos(angle) * 0.35, 0.5, Math.sin(angle) * 0.35);
            hatMesh.add(jewel);
        }

        hatMesh.position.set(0, 2.7, 0.8);
        if (STATE.petType === 'rabbit') hatMesh.position.y += 0.8; // Higher for rabbit ears

        petGroup.add(hatMesh);
    }

    // Interaction Hitbox
    const petHit = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), new THREE.MeshBasicMaterial({ visible: false }));
    petHit.position.y = 1.5;
    petGroup.add(petHit);

    scene.add(petGroup);
}

function initGameLoop() {
    const runGameTick = () => {
        decayStats();

        const nextTime = STATE.gameTime + 15;
        if (nextTime >= 1440) {
            STATE.day++;
            STATE.chores.progress = {};

            const rentCost = 10;
            STATE.money -= rentCost;
            STATE.spending.rent += rentCost;
            recordTransaction('Rent', 'Daily rent payment', -rentCost);
            showNotification(`Rent Paid: -$${rentCost}`, "warning");

            showNotification("🌅 A brand new day! Tasks have been reset.", "info");
            recordNetWorth();
            buildRoom();
        }
        STATE.gameTime = nextTime % 1440;
        uiDirty = true;

        if (!renderer.currentLoop) return;
        if (uiDirty) { updateUI(); uiDirty = false; }
        
        updatePetBehavior();
        updateEnvironment();

        tickCounter++;
        if (tickCounter % 10 === 0) saveGameState();

        const speedMultiplier = Math.floor((STATE.day - 1) / 5);
        const nextTickSpeed = Math.max(200, 1000 - (speedMultiplier * 150));

        decayInterval = setTimeout(runGameTick, nextTickSpeed);
    };

    decayInterval = setTimeout(runGameTick, 1000);

    interestInterval = setInterval(() => {
        if (STATE.savings > 0) {
            const interest = STATE.savings * 0.02;
            STATE.savings += interest;
            STATE.lifetimeEarnings += interest;
            recordTransaction('Interest', 'Savings interest (2%)', interest);
            showNotification(`Interest Earned: +$${interest.toFixed(2)}`, "success");
            uiDirty = true;
        }
    }, 60000);

    renderer.setAnimationLoop(animate);
    renderer.currentLoop = true;
}

function decayStats() {
    if (window.currentTutorialStep !== undefined && window.currentTutorialStep >= 0) return;

    STATE.tracking.totalHappinessTicks += STATE.stats.happiness;
    STATE.tracking.happinessTickCount++;

    STATE.stats.hunger = Math.max(0, STATE.stats.hunger - CONFIG.decayRates.hunger);
    if (STATE.stats.hunger === 0) return gameOver("Starvation");

    STATE.stats.energy = Math.max(0, STATE.stats.energy - CONFIG.decayRates.energy);
    if (STATE.stats.energy === 0) return gameOver("Exhaustion");

    STATE.stats.hygiene = Math.max(0, STATE.stats.hygiene - CONFIG.decayRates.hygiene);
    if (STATE.stats.hygiene === 0) return gameOver("Sickness");

    let happinessDecay = CONFIG.decayRates.happiness;
    if (STATE.stats.hunger < 40) happinessDecay *= 1.5;
    if (STATE.stats.hygiene < 40) happinessDecay *= 1.2;

    STATE.stats.happiness = Math.max(0, STATE.stats.happiness - happinessDecay);
    if (STATE.stats.happiness === 0) return gameOver("Depression");

    if (STATE.stats.hunger < 20 && Math.random() < 0.1) showNotification(`${STATE.petName} is hungry!`, "warning");
    if (STATE.stats.energy < 20 && Math.random() < 0.1) showNotification(`${STATE.petName} is tired!`, "warning");

    ['hunger', 'energy', 'hygiene', 'happiness'].forEach(stat => {
        if (STATE.stats[stat] < 20) {
            if (!STATE.tracking.nearDeathFlags[stat]) {
                STATE.tracking.nearDeathFlags[stat] = true;
                STATE.tracking.nearDeathScenarios++;
            }
        } else {
            STATE.tracking.nearDeathFlags[stat] = false;
        }
    });
}

function gameOver(reason) {
    clearTimeout(decayInterval);
    clearInterval(interestInterval);
    renderer.setAnimationLoop(null);
    renderer.currentLoop = false;

    STATE.gameOver = true;
    saveGameState(); // Persist the death so a dead save can't be resumed

    const ui = document.getElementById('ui-layer');
    if (ui) ui.style.pointerEvents = 'none';

    const screen = document.createElement('div');
    screen.className = "fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 text-center fade-in text-white";
    screen.innerHTML = `
        <div class="text-8xl mb-6">💀</div>
        <h1 class="text-6xl font-bold text-red-500 mb-6 tracking-widest">GAME OVER</h1>
        <p class="text-3xl mb-2">Your pet has passed away.</p>
        <p class="text-xl text-slate-400 mb-6">Cause of Death: <span class="text-red-400 font-bold uppercase">${reason}</span></p>
        
        <div class="grid grid-cols-2 gap-8 mb-12 max-w-lg mx-auto w-full">
            <div class="glass-panel p-6 rounded-2xl bg-slate-800/50">
                <div class="text-sm text-slate-400 uppercase tracking-widest mb-2">Days Survived</div>
                <div class="text-5xl font-bold text-white">${STATE.day}</div>
            </div>
            <div class="glass-panel p-6 rounded-2xl bg-slate-800/50">
                <div class="text-sm text-slate-400 uppercase tracking-widest mb-2">Total Wealth Collected</div>
                <div class="text-4xl font-bold text-green-400">$${STATE.lifetimeEarnings.toFixed(2)}</div>
            </div>
        </div>

        <div class="flex gap-4 max-w-3xl mx-auto w-full justify-center">
            <button onclick="location.reload()" class="px-8 py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold text-xl transition transform hover:scale-105 shadow-[0_0_30px_rgba(220,38,38,0.5)] pointer-events-auto cursor-pointer">
                Try Again
            </button>
            <button onclick="openBankAudit('${reason}')" class="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-xl transition transform hover:scale-105 shadow-[0_0_30px_rgba(37,99,235,0.5)] pointer-events-auto cursor-pointer flex items-center gap-2">
                🖨️ Print Bank Audit Statement
            </button>
        </div>
    `;
    document.body.appendChild(screen);
}

/**
 * Caches frequently accessed DOM elements to avoid repeated getElementById calls.
 * 
 * @returns {void}
 */
function initDOMCache() {
    DOM = {
        valHunger: document.getElementById('val-hunger'),
        barHunger: document.getElementById('bar-hunger'),
        valEnergy: document.getElementById('val-energy'),
        barEnergy: document.getElementById('bar-energy'),
        valHygiene: document.getElementById('val-hygiene'),
        barHygiene: document.getElementById('bar-hygiene'),
        valHappiness: document.getElementById('val-happiness'),
        barHappiness: document.getElementById('bar-happiness'),
        displayMoney: document.getElementById('display-money'),
        displaySavings: document.getElementById('display-savings'),
        displayDay: document.getElementById('display-day'),
        displayTime: document.getElementById('display-time'),
        spendFood: document.getElementById('spend-food'),
        spendToys: document.getElementById('spend-toys'),
        spendEducation: document.getElementById('spend-education'),
        spendCare: document.getElementById('spend-care'),
        spendRent: document.getElementById('spend-rent'),
        spendUtilities: document.getElementById('spend-utilities'),
        tooltip: document.getElementById('tooltip')
    };
}

function updateUI() {
    setText(DOM.valHunger, Math.floor(STATE.stats.hunger));
    setWidth(DOM.barHunger, `${STATE.stats.hunger}%`);

    setText(DOM.valEnergy, Math.floor(STATE.stats.energy));
    setWidth(DOM.barEnergy, `${STATE.stats.energy}%`);

    setText(DOM.valHygiene, Math.floor(STATE.stats.hygiene));
    setWidth(DOM.barHygiene, `${STATE.stats.hygiene}%`);

    setText(DOM.valHappiness, Math.floor(STATE.stats.happiness));
    setWidth(DOM.barHappiness, `${STATE.stats.happiness}%`);

    setText(DOM.displayMoney, STATE.money.toFixed(2));
    setText(DOM.displaySavings, STATE.savings.toFixed(2));
    if (DOM.displayDay) setText(DOM.displayDay, STATE.day);

    const hrs = Math.floor(STATE.gameTime / 60);
    const mins = STATE.gameTime % 60;
    const period = hrs >= 12 ? "PM" : "AM";
    const displayHrs = hrs % 12 || 12;
    const displayMins = mins.toString().padStart(2, '0');
    setText(DOM.displayTime, `${displayHrs}:${displayMins} ${period}`);

    const isNight = hrs >= 22 || hrs < 6;
    const newClass = `text-2xl font-bold ${isNight ? 'text-indigo-400' : 'text-sky-400'}`;
    if (DOM.displayTime.className !== newClass) DOM.displayTime.className = newClass;

    setText(DOM.spendFood, `$${STATE.spending.food.toFixed(2)}`);
    setText(DOM.spendToys, `$${STATE.spending.toys.toFixed(2)}`);
    setText(DOM.spendEducation, `$${STATE.spending.education.toFixed(2)}`);
    setText(DOM.spendCare, `$${STATE.spending.care.toFixed(2)}`);
    setText(DOM.spendRent, `$${STATE.spending.rent.toFixed(2)}`);
    setText(DOM.spendUtilities, `$${STATE.spending.utilities.toFixed(2)}`);
}

/**
 * Evaluates core stat deltas extracting specific emotional bounds and triggering localized avatar updates.
 * 
 * @returns {void}
 */
function updatePetBehavior() {
    let emotion = "Happy";
    let emoji = "😊";

    if (STATE.stats.hunger < 20 && STATE.stats.energy < 20) {
        emotion = "Exhausted"; emoji = "😫";
    } else if (STATE.stats.hunger < 30) { emotion = "Hungry"; emoji = "🤤"; }
    else if (STATE.stats.energy < 20) { emotion = "Sleepy"; emoji = "😴"; }
    else if (STATE.stats.happiness < 30) { emotion = "Sad"; emoji = "😢"; }
    else if (STATE.stats.happiness > 80 && STATE.stats.energy > 50) { emotion = "Excited"; emoji = "🤩"; }
    else if (STATE.stats.energy > 80) { emotion = "Happy"; emoji = "😊"; }

    document.getElementById('pet-emoji').innerText = emoji;
    document.getElementById('pet-status-text').innerText = emotion;

    if (petGroup) {
        petGroup.position.y = Math.max(0, petGroup.position.y * 0.9);
        petGroup.rotation.z = 0;
        petGroup.position.x = 0;

        if (emotion === "Excited") petGroup.position.y = Math.abs(Math.sin(Date.now() / 200)) * 0.5;
        else if (emotion === "Sleepy") petGroup.rotation.z = Math.PI / 4;
    }
}

/**
 * Mutates global directional light attenuation and fog density corresponding to procedural game-time.
 * 
 * @returns {void}
 */
function updateEnvironment() {
    if (!scene) return;
    const hrs = Math.floor(STATE.gameTime / 60);
    const isNight = hrs >= 22 || hrs < 6;

    if (lastIsNight !== isNight) {
        lastIsNight = isNight;
        const targetHex = isNight ? 0x020617 : 0x202025;
        scene.background.setHex(targetHex);
        scene.fog.color.setHex(targetHex);
    }
}

/**
 * Emits raycasting vector calculation to resolve volumetric collision detecting interactive targets.
 *
 * @param {MouseEvent} event - DOM mouse click propagation.
 * @returns {void}
 */
function onMouseClick(event) {
    if (event.target.tagName !== 'CANVAS') return;

    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(interactableObjects, false);

    if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj) {
            if (obj.userData && obj.userData.type === 'interactable') {
                handleInteraction(obj.userData.action, obj);
                break;
            }
            obj = obj.parent;
        }
    }
}

/** Timestamp of last mousemove raycast for throttling. */
let lastMouseMoveTime = 0;

/**
 * Interpolates vector projection to dynamically assess hover states on three-dimensional colliders.
 *
 * @param {MouseEvent} event - DOM mouse position intercept.
 * @returns {void}
 */
function onMouseMove(event) {
    const tooltip = DOM.tooltip;
    if (!tooltip) return;

    if (event.target.tagName !== 'CANVAS') {
        tooltip.style.opacity = 0;
        document.body.style.cursor = 'default';
        return;
    }

    const now = Date.now();
    if (now - lastMouseMoveTime < 50) return;
    lastMouseMoveTime = now;

    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(interactableObjects, false);

    let hoveredObj = null;

    if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj) {
            if (obj.userData && obj.userData.type === 'interactable') {
                hoveredObj = obj;
                break;
            }
            obj = obj.parent;
        }
    }

    if (hoveredObj) {
        const text = getTooltipText(hoveredObj.userData);
        if (text) {
            tooltip.innerText = text;
            tooltip.style.left = `${event.clientX}px`;
            tooltip.style.top = `${event.clientY - 10}px`; // Offset slightly above
            tooltip.style.opacity = 1;
        } else {
            tooltip.style.opacity = 0;
        }
        document.body.style.cursor = 'pointer';
    } else {
        tooltip.style.opacity = 0;
        document.body.style.cursor = 'default';
    }
}

/**
 * Parses context strings linked via Three.js node UserData schemas.
 *
 * @param {Object} data - Transient string dictionary tied to a mesh object.
 * @returns {string|null} Localized string mapped payload, null if missing mapping.
 */
function getTooltipText(data) {
    if (!data.action) return null;

    if (data.action.startsWith('doChore:')) {
        const parts = data.action.split(':');
        return CHORE_CONFIG[parts[1]]?.name || "Chore";
    }
    if (data.action === 'openMarket') return "Computer (Marketplace)";
    if (data.action === 'openFridge') return "Open Fridge";
    if (data.action === 'cleanPet') return "Use Bathtub";
    if (data.action === 'sleep') return "Sleep (Bed)";
    if (data.action.startsWith('changeRoom:')) {
        return null;
    }
    if (data.action === 'playWithToy') return "Play with Toy";

    return null;
}

/**
 * Global dispatch routing layer assessing strings against bounded action behaviors.
 *
 * @param {string} action - Unpacked identifier scalar correlating to a method.
 * @param {THREE.Object3D} [object] - Native WebGL object emitting the invocation trigger.
 * @returns {void}
 */
function handleInteraction(action, object) {
    if (!action) return;

    if (action.startsWith('doChore:')) {
        const parts = action.split(':');
        const baseId = parts[1];
        const uniqueId = parts[2];
        const subId = parseInt(parts[3]);
        const choreDef = CHORE_CONFIG[baseId];

        if (choreDef) {
            if (!STATE.chores.progress[uniqueId]) STATE.chores.progress[uniqueId] = [];
            if (STATE.chores.progress[uniqueId].includes(subId)) return;


            STATE.stats.happiness = Math.max(0, STATE.stats.happiness - 2);
            STATE.chores.progress[uniqueId].push(subId);

            if (object) {
                object.userData.type = 'ignore';
                object.visible = false;
                object.position.y = -1000;
                spawnMoneyParticles(object.position.clone().add(new THREE.Vector3(0, 1, 0)));
            }
            showActionIndicator(`${choreDef.actionName || 'Working'}...`);

            let isComplete = false;

            if (choreDef.global) {
                const totalNeeded = choreDef.count * choreDef.room.length;
                let totalDone = 0;
                choreDef.room.forEach(r => {
                    const rId = `${baseId}_${r}`;
                    totalDone += (STATE.chores.progress[rId] || []).length;
                });
                if (totalDone >= totalNeeded) isComplete = true;
            } else {
                if (STATE.chores.progress[uniqueId].length >= choreDef.count) isComplete = true;
            }

            if (isComplete) {
                const reward = getChoreReward(baseId);
                STATE.money += reward;
                STATE.lifetimeEarnings += reward;
                recordTransaction('Income', `Chore: ${choreDef.name}`, reward);
                showNotification(`Global Task Complete! +$${reward.toFixed(2)}`, "success");
                showNotification(choreDef.lesson, "info");
            }
            uiDirty = true;
            updateTaskSidebar();
        }
        return;
    }

    // Modal Triggers
    if (action === 'openMarket') { document.getElementById('modal-marketplace').classList.remove('hidden'); }
    if (action === 'openFridge') { updateFridgeUI(); document.getElementById('modal-fridge').classList.remove('hidden'); }
    if (action && action.startsWith('changeRoom:')) { changeRoom(action.split(':')[1]); }

    // Cleaning the Pet (Bathtub)
    if (action === 'cleanPet') {
        const waterCost = 1;
        if (STATE.money < waterCost) {
            showNotification("Not enough money for water bill!", "error");
            return;
        }
        STATE.money -= waterCost;
        STATE.spending.utilities += waterCost;
        recordTransaction('Utilities', 'Bath water bill', -waterCost);

        STATE.stats.hygiene = 100;
        showNotification(`Squeaky clean! 🛁 (Bill: -$${waterCost})`, "success");
        uiDirty = true;
        triggerPetReaction('bath');
    }

    // Sleeping (Bed) - Restricted to Night
    if (action === 'sleep') {
        const hrs = Math.floor(STATE.gameTime / 60);
        if (hrs >= 6 && hrs < 22) {
            showNotification("It's too light to sleep! Wait for night (10 PM).", "warning");
            return;
        }

        const wakeTime = 480; // 8:00 AM
        let minutesSlept = 0;
        let crossedMidnight = false;

        // Determine sleep duration
        if (STATE.gameTime > wakeTime) { // Sleeping from previous night (e.g. 22:00)
            minutesSlept = (1440 - STATE.gameTime) + wakeTime;
            crossedMidnight = true;
        } else { // Sleeping post-midnight (e.g. 02:00)
            minutesSlept = wakeTime - STATE.gameTime;
        }

        // Variable Energy Gain: 8 hours (480 mins) = 100% restoration
        const energyRestore = Math.min(100, Math.floor((minutesSlept / 480) * 100));
        STATE.stats.energy = energyRestore;
        STATE.gameTime = wakeTime; // Fast forward to Morning

        if (crossedMidnight) {
            STATE.day++;
            // Rent Deduction (for sleeping overnight)
            const rentCost = 10;
            STATE.money -= rentCost;
            STATE.spending.rent += rentCost;
            recordTransaction('Rent', 'Overnight rent payment', -rentCost);
            recordNetWorth();

            STATE.chores.progress = {}; // Reset Chores
            buildRoom(); // Reset Visuals
            showNotification(`Slept ${Math.floor(minutesSlept / 60)}h. Energy: ${energyRestore}%. Rent -$${rentCost}. New Day! 🌅`, "success");
        } else {
            showNotification(`Slept ${Math.floor(minutesSlept / 60)}h. Energy: ${energyRestore}%.`, "success");
        }

        updateEnvironment();
        uiDirty = true;
        // Animation: Lie down
        triggerPetReaction('sleep');
        return;
    }

    // Playing (Toys)
    if (action === 'playWithToy') {
        if (STATE.stats.energy < 10) { showNotification(`${STATE.petName} is too tired to play!`, "warning"); return; }
        STATE.stats.happiness = Math.min(100, STATE.stats.happiness + 20);
        STATE.stats.energy = Math.max(0, STATE.stats.energy - 10);
        showNotification(`Played with Toy! Happiness +20`, "success");
        uiDirty = true;
        // Animation: Jump
        triggerPetReaction('play');
    }
}

/**
 * Intercepts spatial navigational calls rebinding global scene boundaries.
 *
 * @param {string} roomName - Key linked to environmental room layout nodes.
 * @returns {void}
 */
window.changeRoom = (roomName) => {
    // Legacy: if 'work' was a room, redirect
    if (roomName === 'work') { doWork(); return; }

    // Set Room and Rebuild Scene
    STATE.currentRoom = roomName;
    buildRoom();
    showNotification(`Entered ${roomName}`, "info");
};

/**
 * Deprecated synchronous progression callback testing simple stat depreciation constraints.
 * 
 * @returns {void}
 */
function doWork() {

    if (STATE.stats.happiness < 10) { showNotification("Too depressed to work...", "error"); return; }
    STATE.money += CONFIG.salary;
    STATE.lifetimeEarnings += CONFIG.salary;
    STATE.stats.hunger -= 10; STATE.stats.happiness -= 10;
    updateUI(); showNotification(`Worked hard! Earned $${CONFIG.salary}. Happiness -10`, "success");
}

/**
 * Hard-terminates visibility attributes mapping back to active window nodes.
 *
 * @param {string} id - Identifier correlating to the target view to close.
 * @returns {void}
 */
window.closeModal = (id) => {
    document.getElementById(id).classList.add('hidden');
};

/**
 * Safely inverts display constraints cascading completely across all HUD DOM references.
 * 
 * @returns {void}
 */
window.toggleUI = () => {
    STATE.uiHidden = !STATE.uiHidden;
    const topBar = document.getElementById('hud-top-bar');
    const emotionPanel = document.getElementById('pet-emotion-panel');
    const taskSidebar = document.getElementById('task-sidebar');
    const icon = document.getElementById('toggle-ui-icon');

    if (STATE.uiHidden) {
        if (topBar) { topBar.style.opacity = '0'; topBar.style.pointerEvents = 'none'; }
        if (emotionPanel) { emotionPanel.style.opacity = '0'; emotionPanel.style.pointerEvents = 'none'; }
        if (taskSidebar) { taskSidebar.style.opacity = '0'; taskSidebar.style.pointerEvents = 'none'; }
        if (icon) icon.innerText = '🙈';
        showNotification("UI Minimized", "info");
    } else {
        if (topBar) { topBar.style.opacity = '1'; topBar.style.pointerEvents = 'auto'; }
        if (emotionPanel) { emotionPanel.style.opacity = '1'; emotionPanel.style.pointerEvents = 'auto'; }
        if (taskSidebar) { taskSidebar.style.opacity = '1'; taskSidebar.style.pointerEvents = 'auto'; }
        if (icon) icon.innerText = '👁️';
    }
};

/**
 * Validates fiat bounds intercepting generic logic for item injections natively.
 *
 * @param {string} type - Identifier dictating categorical stock logic mutations.
 * @param {number} cost - Value evaluated against the unified banking ledger.
 * @returns {void}
 */
window.buyItem = (type, cost) => {
    if (STATE.money >= cost) {
        STATE.money -= cost;
        if (type === 'kibble') {
            STATE.inventory.food += 1;
            STATE.spending.food += cost;
            recordTransaction('Food', 'Premium Kibble', -cost);
            showNotification("Purchased Premium Kibble! +1 Stock", "success");

        } else if (type === 'ball') {
            if (!STATE.inventory.toys.includes('ball')) {
                STATE.inventory.toys.push('ball');
                renderToys();
            }
            STATE.spending.toys += cost;
            recordTransaction('Toys', 'Bouncy Ball', -cost);
            showNotification("Purchased Bouncy Ball!", "success");
        }
        uiDirty = true;
    } else {
        showNotification("Not enough money!", "error");
    }
};

/**
 * Escalates base educational tier indices modifying subsequent chore payout parameters natively.
 * 
 * @returns {void}
 */
window.buyEducation = () => {
    const cost = 50;
    if (STATE.money >= cost) {
        STATE.money -= cost;
        STATE.educationLevel++;
        STATE.spending.education += cost;
        recordTransaction('Education', `Education Course (Lv.${STATE.educationLevel})`, -cost);
        showNotification("Education Upgraded! Rewards +$2", "success");
        uiDirty = true;
    } else {
        showNotification("Not enough money!", "error");
    }
};

/**
 * Relocates transient assets transforming them firmly into yielding banking ledger subsets.
 * 
 * @returns {void}
 */
window.depositSavings = () => {
    const el = document.getElementById('deposit-amount');
    const amt = parseInt(el.value);
    if (!amt || amt <= 0) return;
    if (STATE.money >= amt) {
        STATE.money -= amt;
        STATE.savings += amt;
        recordTransaction('Transfer', 'Deposit to savings', -amt);
        showNotification(`Deposited $${amt}`, "success");
        uiDirty = true;
        checkSavingsRewards();
        el.value = '';
    } else {
        showNotification("Insufficient funds", "error");
    }
};

/**
 * Diverts locked banking funds resolving them backwards toward the transient wallet node.
 * 
 * @returns {void}
 */
window.withdrawSavings = () => {
    const el = document.getElementById('deposit-amount');
    const amt = parseInt(el.value);
    if (!amt || amt <= 0) return;
    if (STATE.savings >= amt) {
        STATE.savings -= amt;
        STATE.money += amt;
        recordTransaction('Transfer', 'Withdrawal from savings', amt);
        showNotification(`Withdrew $${amt}`, "success");
        uiDirty = true;
        el.value = '';
    } else {
        showNotification("Insufficient savings", "error");
    }
};

function checkSavingsRewards() {
    let newUnlock = false;

    if (STATE.savings >= 100 && !STATE.inventory.hatUnlocked) {
        STATE.inventory.hatUnlocked = true;
        buildPet();
        showNotification("Reached $100! Golden Crown Unlocked! 👑", "success");
        newUnlock = true;
    }
    if (STATE.savings >= 200 && !STATE.inventory.rugUnlocked) {
        STATE.inventory.rugUnlocked = true;
        showNotification("Reached $200! Fancy Rug Unlocked! 🧶", "success");
        newUnlock = true;
    }
    if (STATE.savings >= 300 && !STATE.inventory.plantUnlocked) {
        STATE.inventory.plantUnlocked = true;
        showNotification("Reached $300! Houseplant Unlocked! 🪴", "success");
        newUnlock = true;
    }
    if (STATE.savings >= 400 && !STATE.inventory.paintingUnlocked) {
        STATE.inventory.paintingUnlocked = true;
        showNotification("Reached $400! Art Piece Unlocked! 🎨", "success");
        newUnlock = true;
    }
    if (STATE.savings >= 500 && !STATE.inventory.trophyUnlocked) {
        STATE.inventory.trophyUnlocked = true;
        showNotification("Reached $500! Financing Champion Trophy! 🏆", "success");
        newUnlock = true;
    }

    if (newUnlock && STATE.currentRoom === 'livingroom') {
        buildRoom();
    }
}

/**
 * Triggers DOM synchronization parsing active static inventory variables against fridge container hooks.
 * 
 * @returns {void}
 */
window.checkFridge = () => {
    updateFridgeUI();
};

/**
 * Simulates volumetric consumption delegating to corresponding character stats.
 *
 * @param {string} type - Identifier linked to consumable inventory models.
 * @returns {void}
 */
window.consumeItem = (type) => {
    if (type === 'food') {
        if (STATE.inventory.food > 0) {
            STATE.inventory.food--;
            STATE.stats.hunger = Math.min(100, STATE.stats.hunger + 40); // Restore Hunger
            STATE.stats.happiness = Math.min(100, STATE.stats.happiness + 15);
            STATE.stats.energy = Math.min(100, STATE.stats.energy + 5);
            showNotification("Premium Kibble! Hunger -40, Happy +15", "success");
            triggerPetReaction('eating');
            updateFridgeUI();
            uiDirty = true;
        } else {
            showNotification("No food! Buy some at the market.", "warning");
        }

    }
};

/**
 * Recalculates visual quantity metrics mapping active inventory limits down to DOM labels.
 * 
 * @returns {void}
 */
function updateFridgeUI() {
    document.getElementById('stock-food').innerText = STATE.inventory.food;

}

/**
 * Orchestrates transient graphical text nodes rendering at explicit collision points.
 *
 * @param {string} text - Payload string for localized overlay display.
 * @returns {void}
 */
let indicatorTimeout;
function showActionIndicator(text) {
    const el = document.getElementById('action-indicator'); const txt = document.getElementById('action-text');
    if (el && txt) {
        txt.innerText = text; el.classList.remove('hidden');
        if (indicatorTimeout) clearTimeout(indicatorTimeout);
        indicatorTimeout = setTimeout(() => { el.classList.add('hidden'); }, 1500);
    }
}

/**
 * Interrogates persistence trees rendering comparative progress DOM widgets globally scaling context.
 * 
 * @returns {void}
 */
function updateTaskSidebar() {
    const list = document.getElementById('task-list-content'); if (!list) return;
    list.innerHTML = '';

    const renderItem = (label, current, max, isHere) => {
        const percent = Math.min(100, (current / max) * 100);
        const isDone = current >= max;
        const opacity = isHere ? 'opacity-100' : 'opacity-40 grayscale';
        const div = document.createElement('div');
        div.className = `p-3 rounded-lg bg-slate-800/80 border border-slate-700 ${opacity} transition-all`;
        div.innerHTML = `<div class="flex justify-between text-xs text-slate-300 mb-1"><span class="font-bold ${isDone ? 'text-green-400 line-through' : 'text-slate-100'}">${label}</span><span>${current}/${max}</span></div><div class="w-full bg-slate-900 h-2 rounded-full overflow-hidden"><div class="bg-gradient-to-r from-teal-500 to-emerald-400 h-full transition-all duration-500" style="width: ${percent}%"></div></div>`;
        return div;
    };

    const entries = [];
    Object.keys(CHORE_CONFIG).forEach(key => {
        const cfg = CHORE_CONFIG[key];

        if (cfg.global) {
            const rooms = Array.isArray(cfg.room) ? cfg.room : [cfg.room];
            const max = cfg.count * rooms.length;
            let current = 0;
            rooms.forEach(r => {
                current += (STATE.chores.progress[`${key}_${r}`] || []).length;
            });
            if (!entries.find(e => e.label === cfg.name)) {
                entries.push({ label: cfg.name, current, max, room: 'all', allowedRooms: rooms, isGlobal: true });
            }
        } else {
            const relevantRooms = Array.isArray(cfg.room) ? cfg.room : [cfg.room];
            relevantRooms.forEach(r => {
                const progress = (STATE.chores.progress[key] || []).length;
                entries.push({ label: `${cfg.name} (${r})`, current: progress, max: cfg.count, room: r });
            });
        }
    });

    entries.sort((a, b) => {
        const isHereA = a.isGlobal ? a.allowedRooms.includes(STATE.currentRoom) : a.room === STATE.currentRoom;
        const isHereB = b.isGlobal ? b.allowedRooms.includes(STATE.currentRoom) : b.room === STATE.currentRoom;
        if (isHereA && !isHereB) return -1;
        if (!isHereA && isHereB) return 1;
        return 0;
    });

    entries.forEach(e => {
        const isHere = e.isGlobal ? e.allowedRooms.includes(STATE.currentRoom) : e.room === STATE.currentRoom;
        list.appendChild(renderItem(e.label, e.current, e.max, isHere));
    });
}

/**
 * Emits volatile billboard particles visually indicating financial acquisition deltas.
 *
 * @param {THREE.Vector3} pos - Geometric origin locus triggering spatial emission.
 * @returns {void}
 */
function spawnMoneyParticles(pos) {
    if (!scene || !camera) return;
    const mat = new THREE.MeshBasicMaterial({ color: 0x4ade80, side: THREE.DoubleSide, transparent: true });
    const geo = new THREE.PlaneGeometry(0.5, 0.5);
    const particle = new THREE.Mesh(geo, mat);
    particle.position.copy(pos); particle.lookAt(camera.position); scene.add(particle);
    let frame = 0;
    activeAnimations.push(() => {
        frame++;
        particle.position.y += 0.05;
        particle.scale.setScalar(1 + Math.sin(frame * 0.2) * 0.2);
        mat.opacity = Math.max(0, 1 - (frame / 30));
        if (frame > 30) {
            if (particle.parent) scene.remove(particle);
            geo.dispose();
            mat.dispose();
            return true;
        }
        return false;
    });
}

/**
 * Enqueues contextual DOM overlays conveying immediate system-state notifications.
 *
 * @param {string} msg - Human-readable communication string.
 * @param {string} [type='info'] - Tailored enumeration scaling warning weights explicitly.
 * @returns {void}
 */
function showNotification(msg, type = 'info') {
    const container = document.getElementById('notification-area'); if (!container) return;
    const toast = document.createElement('div');
    // Styles
    let colors = "bg-slate-800 border-slate-600";
    if (type === 'success') colors = "bg-green-900/80 border-green-500";
    if (type === 'error') colors = "bg-red-900/80 border-red-500";
    if (type === 'warning') colors = "bg-yellow-900/80 border-yellow-500";

    toast.className = `p-3 rounded-lg border text-white text-sm shadow-lg mb-2 w-full toast-enter ${colors}`;
    toast.innerText = msg;
    container.appendChild(toast);

    requestAnimationFrame(() => { toast.classList.remove('toast-enter'); toast.classList.add('toast-enter-active'); });
    setTimeout(() => { toast.classList.remove('toast-enter-active'); toast.classList.add('toast-exit-active'); setTimeout(() => toast.remove(), 300); }, 3000);
}

/**
 * Recurses high-frequency draw calls computing per-frame geometric transformations cleanly.
 * 
 * @returns {void}
 */
function animate() {
    if (petGroup) { petGroup.rotation.y += 0.01; }
    for (let i = activeAnimations.length - 1; i >= 0; i--) {
        if (activeAnimations[i]()) activeAnimations.splice(i, 1);
    }
    renderer.render(scene, camera);
}

/**
 * Dispatches rigid-body character procedural skeletal animations correlated to predefined intents.
 *
 * @param {string} type - Key distinguishing between distinct skeletal interpolations.
 * @returns {void}
 */
function triggerPetReaction(type) {
    if (!petGroup) return;

    if (type === 'eating') {
        const animDuration = 20;
        let frame = 0;
        activeAnimations.push(() => {
            frame++;
            petGroup.rotation.x = Math.sin(frame * 0.5) * 0.3 + 0.2;
            petGroup.scale.set(1.1, 0.9, 1.1);
            if (frame > animDuration) {
                petGroup.rotation.x = 0;
                petGroup.scale.set(1, 1, 1);
                return true;
            }
            return false;
        });
        spawnEmoteParticle('🍖');
        spawnEmoteParticle('😋');
    }

    else if (type === 'bath') {
        let spins = 0;
        activeAnimations.push(() => {
            if (spins < 20) {
                petGroup.rotation.y += 0.8;
                spins++;
                return false;
            } else {
                petGroup.rotation.y = 0;
                return true;
            }
        });
        spawnEmoteParticle('🫧');
        spawnEmoteParticle('✨');
    }

    else if (type === 'sleep') {
        petGroup.rotation.z = Math.PI / 2;
        petGroup.position.y = 0.5;
        spawnEmoteParticle('💤');
        let sleepFrame = 0;
        activeAnimations.push(() => {
            sleepFrame++;
            if (sleepFrame > 120) {
                if (petGroup) {
                    petGroup.rotation.z = 0;
                    petGroup.position.y = 0;
                }
                return true;
            }
            return false;
        });
    }

    else if (type === 'play') {
        let jumpHeight = 0;
        activeAnimations.push(() => {
            jumpHeight += 0.2;
            petGroup.position.y = Math.sin(jumpHeight) * 2;
            if (jumpHeight > Math.PI) {
                petGroup.position.y = 0;
                return true;
            }
            return false;
        });
        spawnEmoteParticle('❤️');
        spawnEmoteParticle('🎾');
    }
}

function spawnEmoteParticle(emoji) {
    if (!scene || !petGroup) return;

    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.font = '80px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 64, 64);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);

    sprite.scale.set(3, 3, 1); // Size of the emote
    sprite.position.copy(petGroup.position);
    sprite.position.y += 2.5;
    sprite.position.x += (Math.random() - 0.5) * 2;
    sprite.position.z += (Math.random() - 0.5) * 2;

    scene.add(sprite);

    let frame = 0;
    activeAnimations.push(() => {
        sprite.position.y += 0.05;
        sprite.material.opacity = 1 - (frame / 50);
        frame++;
        if (frame > 50) {
            scene.remove(sprite);
            mat.dispose();
            tex.dispose();
            return true;
        }
        return false;
    });
}

// ─── Bank Audit System ──────────────────────────────────────────────────────
// Professional financial audit modal with Chart.js visualizations, metrics,
// a transaction ledger, refined grading, and print/export capability.

/**
 * Aggregates runtime persistent state metrics resolving bounded financial health indices.
 * 
 * @returns {Object} JSON payload populated with ratio and ROI metrics.
 */
function computeFinancialMetrics() {
    const totalSpending = Object.values(STATE.spending).reduce((a, b) => a + b, 0);
    const totalAssets = STATE.money + STATE.savings;
    const savingsRate = totalAssets > 0 ? (STATE.savings / totalAssets) * 100 : 0;
    const dtiRatio = STATE.lifetimeEarnings > 0 ? Math.min(1, totalSpending / STATE.lifetimeEarnings) : 0;

    const choreCompletions = STATE.transactions.filter(t => t.category === 'Income').length;
    const educationSpending = STATE.spending.education;
    const educationROI = educationSpending > 0
        ? ((STATE.educationLevel * 5 * choreCompletions) / educationSpending) * 100
        : 0;

    const avgHappiness = STATE.tracking.happinessTickCount > 0
        ? STATE.tracking.totalHappinessTicks / STATE.tracking.happinessTickCount
        : 100;

    return { totalSpending, totalAssets, savingsRate, dtiRatio, educationROI, avgHappiness, choreCompletions };
}

/**
 * Resolves static threshold rubrics distilling granular financial metrics into overarching tier grades.
 * Strict conditions require concurrent liquidity and proactive education spending.
 *
 * @param {Object} m - Upstream metric payload.
 * @returns {Object} Presentation-ready mapped tuple dictating UI aesthetics and classification.
 */
function computeFinancialGrade(m) {
    if (STATE.day > 10 && STATE.savings >= 200 && STATE.educationLevel >= 2 &&
        m.savingsRate > 30 && m.avgHappiness > 80)
        return { grade: 'A+', color: '#4ade80', desc: 'Exceptional Financial Stewardship' };
    if (STATE.day > 7 && STATE.savings >= 100 && STATE.educationLevel >= 1 &&
        m.savingsRate > 20 && m.avgHappiness > 70)
        return { grade: 'A', color: '#22c55e', desc: 'Excellent Financial Health' };
    if (STATE.day > 5 && STATE.savings >= 50 && m.avgHappiness > 60)
        return { grade: 'B+', color: '#a3e635', desc: 'Very Good Standing' };
    if (STATE.day > 4 && m.avgHappiness > 50)
        return { grade: 'B', color: '#facc15', desc: 'Good Standing' };
    if (STATE.day > 2)
        return { grade: 'C', color: '#fb923c', desc: 'Fair \u2014 Needs Improvement' };
    return { grade: 'F', color: '#ef4444', desc: 'Poor \u2014 Critical Review Required' };
}

/**
 * Constructs dynamic DOM layout strings projecting tabular historical ledger structures.
 * 
 * @returns {string} Validated layout HTML strings mapped to application state.
 */
function buildTransactionLedgerHTML() {
    if (STATE.transactions.length === 0) {
        return '<p style="text-align:center;color:#64748b;padding:32px;font-style:italic">No transactions recorded yet.</p>';
    }
    const rows = STATE.transactions.slice().reverse().map(t => {
        const pos = t.amount >= 0;
        const cls = pos ? 'audit-positive' : 'audit-negative';
        const sign = pos ? '+' : '';
        const hrs = Math.floor((t.time || 0) / 60);
        const mins = (t.time || 0) % 60;
        const period = hrs >= 12 ? 'PM' : 'AM';
        const dh = hrs % 12 || 12;
        const ts = `${dh}:${mins.toString().padStart(2, '0')} ${period}`;
        return `<tr>
            <td>Day ${t.day} <span class="audit-time-sub">${ts}</span></td>
            <td><span class="audit-cat-badge audit-cat-${t.category.toLowerCase()}">${t.category}</span></td>
            <td>${t.description}</td>
            <td class="${cls}">${sign}$${Math.abs(t.amount).toFixed(2)}</td>
        </tr>`;
    }).join('');
    return `<table class="audit-table">
        <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
}

/** Chart.js instance references for cleanup on modal re-open. */
let netWorthChartInstance = null;
let spendingChartInstance = null;

/**
 * Instantiates responsive temporal Chart.js projection canvasing historical net growth arrays.
 * 
 * @returns {void}
 */
function initNetWorthChart() {
    const canvas = document.getElementById('chart-net-worth');
    if (!canvas || typeof Chart === 'undefined') return;
    const data = STATE.netWorthHistory.length > 0
        ? STATE.netWorthHistory
        : [{ day: STATE.day, netWorth: STATE.money + STATE.savings }];
    if (netWorthChartInstance) netWorthChartInstance.destroy();
    netWorthChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: data.map(d => `Day ${d.day}`),
            datasets: [{
                label: 'Net Worth ($)',
                data: data.map(d => d.netWorth),
                borderColor: '#2dd4bf',
                backgroundColor: function (context) {
                    const chart = context.chart;
                    const area = chart.chartArea;
                    if (!area) return 'rgba(45,212,191,0.1)';
                    const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                    g.addColorStop(0, 'rgba(45,212,191,0.25)');
                    g.addColorStop(1, 'rgba(45,212,191,0.02)');
                    return g;
                },
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#2dd4bf',
                pointBorderColor: '#0f172a',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7,
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15,23,42,0.95)',
                    borderColor: 'rgba(45,212,191,0.5)',
                    borderWidth: 1,
                    titleColor: '#2dd4bf',
                    bodyColor: '#e2e8f0',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: { label: (ctx) => `Net Worth: $${ctx.parsed.y.toFixed(2)}` }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#94a3b8', font: { family: 'Inter', size: 11 } },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    border: { color: 'rgba(255,255,255,0.08)' }
                },
                y: {
                    ticks: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, callback: (v) => `$${v}` },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    border: { color: 'rgba(255,255,255,0.08)' }
                }
            }
        }
    });
}

/**
 * Instantiates comparative categorical Chart.js views projecting segmented outflow magnitudes.
 * 
 * @returns {void}
 */
function initSpendingChart() {
    const canvas = document.getElementById('chart-spending');
    if (!canvas || typeof Chart === 'undefined') return;
    const cats = ['food', 'toys', 'education', 'rent', 'utilities', 'care'];
    const labels = ['Food', 'Toys', 'Education', 'Rent', 'Utilities', 'Healthcare'];
    const colors = ['#f97316', '#ec4899', '#8b5cf6', '#06b6d4', '#22c55e', '#ef4444'];
    const data = cats.map(c => STATE.spending[c] || 0);
    const hasData = data.some(v => v > 0);
    if (spendingChartInstance) spendingChartInstance.destroy();
    spendingChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: hasData ? labels : ['No Spending Yet'],
            datasets: [{
                data: hasData ? data : [1],
                backgroundColor: hasData ? colors : ['#334155'],
                borderColor: '#0f172a',
                borderWidth: 3,
                hoverBorderColor: '#1e293b',
                hoverBorderWidth: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#e2e8f0', padding: 10, font: { family: 'Inter', size: 11 }, usePointStyle: true, pointStyle: 'circle' }
                },
                tooltip: {
                    backgroundColor: 'rgba(15,23,42,0.95)',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    titleColor: '#e2e8f0',
                    bodyColor: '#94a3b8',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx) => {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                            return `${ctx.label}: $${ctx.parsed.toFixed(2)} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Forces visibility onto the unified audit viewport while synchronizing downstream dependency updates.
 * 
 * @param {string|null} [reason=null] - Optional strict string signaling closure parameters.
 * @returns {void}
 */
window.openBankAudit = (reason = null) => {
    const existing = document.getElementById('modal-bank-audit');
    if (existing) closeBankAudit();

    const metrics = computeFinancialMetrics();
    const gi = computeFinancialGrade(metrics);
    const dtiColor = metrics.dtiRatio > 0.8 ? '#ef4444' : metrics.dtiRatio > 0.5 ? '#facc15' : '#4ade80';

    const modal = document.createElement('div');
    modal.id = 'modal-bank-audit';
    modal.className = 'audit-modal';
    modal.innerHTML = `
        <div class="audit-container" id="audit-printable">
            <div class="audit-header">
                <div class="audit-header-row">
                    <div>
                        <div class="audit-bank-name">\uD83C\uDFE6 MAV NATIONAL BANK</div>
                        <div class="audit-subtitle">Official Audit Statement</div>
                    </div>
                    <div class="audit-header-right">
                        <div class="audit-acct-label">Account Holder</div>
                        <div class="audit-acct-value">${STATE.petName} <span style="opacity:.7">(${STATE.petType})</span></div>
                        <div class="audit-acct-label" style="margin-top:4px">Statement Period</div>
                        <div class="audit-acct-value">Day 1 \u2014 Day ${STATE.day}</div>
                        ${reason ? `<div class="audit-acct-label" style="margin-top:4px;color:#f87171">Cause of Closure</div><div class="audit-acct-value" style="color:#ef4444">${reason.toUpperCase()}</div>` : ''}
                    </div>
                </div>
            </div>
            <div class="audit-section">
                <div class="audit-charts-grid">
                    <div class="audit-chart-card">
                        <h3 class="audit-chart-title">\uD83D\uDCC8 Net Worth Over Time</h3>
                        <div class="audit-chart-wrap"><canvas id="chart-net-worth"></canvas></div>
                    </div>
                    <div class="audit-chart-card">
                        <h3 class="audit-chart-title">\uD83D\uDCCA Spending Categories</h3>
                        <div class="audit-chart-wrap"><canvas id="chart-spending"></canvas></div>
                    </div>
                </div>
            </div>
            <div class="audit-section">
                <h3 class="audit-section-title">Financial Health Summary</h3>
                <div class="audit-metrics-grid">
                    <div class="audit-metric-card audit-grade-card">
                        <div class="audit-metric-label">Financial Grade</div>
                        <div class="audit-grade" style="color:${gi.color}">${gi.grade}</div>
                        <div class="audit-grade-desc">${gi.desc}</div>
                    </div>
                    <div class="audit-metric-card">
                        <div class="audit-metric-label">Savings Rate</div>
                        <div class="audit-metric-value" style="color:#38bdf8">${metrics.savingsRate.toFixed(1)}%</div>
                        <div class="audit-metric-sub">of total assets in savings</div>
                    </div>
                    <div class="audit-metric-card">
                        <div class="audit-metric-label">Spend-to-Income</div>
                        <div class="audit-metric-value" style="color:${dtiColor}">${(metrics.dtiRatio * 100).toFixed(1)}%</div>
                        <div class="audit-metric-sub">spending vs lifetime earnings</div>
                    </div>
                    <div class="audit-metric-card">
                        <div class="audit-metric-label">Education ROI</div>
                        <div class="audit-metric-value" style="color:#a78bfa">${metrics.educationROI > 0 ? metrics.educationROI.toFixed(0) + '%' : 'N/A'}</div>
                        <div class="audit-metric-sub">Lv.${STATE.educationLevel} \u2014 +$${STATE.educationLevel * 5}/chore</div>
                    </div>
                </div>
            </div>
            <div class="audit-section">
                <h3 class="audit-section-title">Account Summary</h3>
                <div class="audit-summary-grid">
                    <div class="audit-summary-item">
                        <span class="audit-summary-label">Checking Balance</span>
                        <span class="audit-summary-value">$${STATE.money.toFixed(2)}</span>
                    </div>
                    <div class="audit-summary-item">
                        <span class="audit-summary-label">Savings Balance</span>
                        <span class="audit-summary-value">$${STATE.savings.toFixed(2)}</span>
                    </div>
                    <div class="audit-summary-item audit-summary-total">
                        <span class="audit-summary-label">Total Net Worth</span>
                        <span class="audit-summary-value" style="color:#2dd4bf;font-size:16px">$${(STATE.money + STATE.savings).toFixed(2)}</span>
                    </div>
                    <div class="audit-summary-item">
                        <span class="audit-summary-label">Lifetime Earnings</span>
                        <span class="audit-summary-value" style="color:#4ade80">$${STATE.lifetimeEarnings.toFixed(2)}</span>
                    </div>
                    <div class="audit-summary-item">
                        <span class="audit-summary-label">Total Expenditures</span>
                        <span class="audit-summary-value audit-negative">-$${metrics.totalSpending.toFixed(2)}</span>
                    </div>
                </div>
            </div>
            <div class="audit-section">
                <h3 class="audit-section-title">Transaction Ledger</h3>
                <div class="audit-ledger-wrap custom-scrollbar">${buildTransactionLedgerHTML()}</div>
            </div>
            <div class="audit-footer">
                <button onclick="printAudit()" class="audit-btn audit-btn-print">\uD83D\uDDA8\uFE0F Print Audit</button>
                <button onclick="closeBankAudit()" class="audit-btn audit-btn-close">Close Statement</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    setTimeout(() => { initNetWorthChart(); initSpendingChart(); }, 150);
};

/**
 * Disposes native charting dependencies strictly mitigating memory leakage before detaching DOM nodes.
 * 
 * @returns {void}
 */
window.closeBankAudit = () => {
    if (netWorthChartInstance) { netWorthChartInstance.destroy(); netWorthChartInstance = null; }
    if (spendingChartInstance) { spendingChartInstance.destroy(); spendingChartInstance = null; }
    const modal = document.getElementById('modal-bank-audit');
    if (modal) modal.remove();
};

/**
 * Invokes native system print spoolers configured to target specific document nodes.
 * 
 * @returns {void}
 */
window.printAudit = () => {
    window.print();
};

window.currentTutorialStep = -1;

const TUTORIAL_STEPS = [
    { text: "Welcome to Virtual Pet! Let me show you around. This is your new pet!", pos3D: { x: 0, y: 1.5, z: 0 }, dir: "down", yOffset: 60 },
    { text: "Keep a close eye on these 4 stats! If any of them reach 0, it's Game Over.", focusId: "val-hunger", dir: "up", yOffset: 30 },
    { text: "Here is your Money, Time, and Current Day count.", focusId: "display-money", dir: "up", yOffset: 30 },
    { text: "Click on messes around the house (like this trash bin) to earn money!", pos3D: { x: -8, y: 1, z: 8 }, dir: "down", yOffset: 60 },
    { text: "Use your computer to access the Marketplace to buy food, toys, and upgrades.", pos3D: { x: 0, y: 2, z: -14 }, dir: "down", yOffset: 60 },
    { text: "Use these doors to visit the Kitchen, Bathroom, or Bedroom.", pos3D: { x: -8, y: 4, z: -14.5 }, dir: "down", yOffset: 60 },
    { text: "At night, go to the Bedroom and click the Bed to sleep and restore energy. Have fun!", dir: "none" }
];

window.startTutorial = () => {
    window.currentTutorialStep = 0;
    const layer = document.getElementById('tutorial-layer');
    if (layer) layer.classList.remove('hidden');
    updateTutorial();
    window.addEventListener('resize', updateTutorial);
};

window.nextTutorialStep = () => {
    window.currentTutorialStep++;
    if (window.currentTutorialStep >= TUTORIAL_STEPS.length) {
        window.skipTutorial();
    } else {
        updateTutorial();
    }
};

window.skipTutorial = () => {
    window.currentTutorialStep = -1;
    const layer = document.getElementById('tutorial-layer');
    if (layer) layer.classList.add('hidden');
    window.removeEventListener('resize', updateTutorial);
};

window.updateTutorial = () => {
    if (window.currentTutorialStep < 0) return;
    const step = TUTORIAL_STEPS[window.currentTutorialStep];
    if (!step) return;

    const textEl = document.getElementById('tutorial-text');
    if (textEl) textEl.innerText = step.text;

    const pointer = document.getElementById('tutorial-pointer');
    if (!pointer) return;

    if (step.dir === "none") {
        pointer.style.opacity = 0;
        return;
    }

    pointer.style.opacity = 1;
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;

    if (step.pos3D) {
        const vec = new THREE.Vector3(step.pos3D.x, step.pos3D.y, step.pos3D.z);
        vec.project(camera);
        targetX = (vec.x * 0.5 + 0.5) * window.innerWidth;
        targetY = (vec.y * -0.5 + 0.5) * window.innerHeight;
    } else if (step.focusId) {
        const el = document.getElementById(step.focusId);
        if (el) {
            const rect = el.getBoundingClientRect();
            targetX = rect.left + rect.width / 2;
            targetY = rect.top + rect.height / 2;
        }
    }

    if (step.dir === "down") {
        pointer.innerText = "👇";
        pointer.style.left = `${targetX}px`;
        pointer.style.top = `${targetY - (step.yOffset || 50)}px`;
    } else if (step.dir === "up") {
        pointer.innerText = "👆";
        pointer.style.left = `${targetX}px`;
        pointer.style.top = `${targetY + (step.yOffset || 50)}px`;
    }
};
