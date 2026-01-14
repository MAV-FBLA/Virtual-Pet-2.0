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
    }
};

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

// Helper function to generate unique IDs for chore instances
// If global, the ID distinguishes the room. If local, it's just the base ID.
const getChoreInstanceId = (baseId, room) => {
    const cfg = CHORE_CONFIG[baseId];
    if (cfg.global) return `${baseId}_${room}`;
    return baseId;
};

// Helper function to calculate reward including education bonus
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


// Called from HTML buttons to start the game
window.startGame = (type) => {
    // Add Stop Propagation listeners to all prevented elements
    document.querySelectorAll('.prevent-click-through').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    });

    const nameInput = document.getElementById('pet-name-input').value.trim();

    if (!nameInput) {
        showNotification("Please name your pet!", "error");
        return;
    }

    STATE.petType = type;
    STATE.petName = nameInput;

    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('modal-help').classList.remove('hidden');

    initThreeJS();
    initGameLoop();

    showNotification(`Welcome, ${STATE.petName}!`, "success");

    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') interactWithRoom();
    });
};

// Initialize Three.js Scene, Camera, and Renderer
function initThreeJS() {
    const container = document.getElementById('canvas-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202025);
    scene.fog = new THREE.Fog(0x202025, 10, 50);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 15);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
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
}

// Handle Window Resize Events to keep 3D view correct
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function buildRoom() {
    if (roomGroup) scene.remove(roomGroup);
    roomGroup = new THREE.Group();

    setupChores(STATE.currentRoom);
    updateTaskSidebar();

    let floorMat, wallColor, doorFrameColor, doorPanelColor;

    if (STATE.currentRoom === 'bathroom') {
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

        floorMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
        wallColor = 0xf1f5f9;
        doorFrameColor = 0xffffff;
        doorPanelColor = 0xe2e8f0;
    } else {
        floorMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
        wallColor = 0x475569;
        doorFrameColor = 0x1e293b;
        doorPanelColor = 0x64748b;
    }

    const floorGeo = new THREE.PlaneGeometry(30, 30);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    roomGroup.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: wallColor });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(30, 10, 1), wallMat);
    backWall.position.set(0, 5, -15);
    backWall.receiveShadow = true;
    roomGroup.add(backWall);

    const sideWallGeo = new THREE.BoxGeometry(1, 10, 30);
    const leftWall = new THREE.Mesh(sideWallGeo, wallMat);
    leftWall.position.set(-15, 5, 0);
    leftWall.receiveShadow = true;
    roomGroup.add(leftWall);

    const rightWall = new THREE.Mesh(sideWallGeo, wallMat);
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
}

// Spawns interactive chore objects based on the current room
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

// Helper to create functional door objects
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

    const sign = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 0.2), new THREE.MeshStandardMaterial({ color: colorHex }));
    sign.position.set(0, 8.5, 0);
    doorGroup.add(sign);

    const hitBox = new THREE.Mesh(new THREE.BoxGeometry(5, 8, 2), new THREE.MeshBasicMaterial({ visible: false }));
    hitBox.position.y = 4;
    doorGroup.add(hitBox);

    roomGroup.add(doorGroup);
}

// Helper to create visual window objects
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

// Complex Geometry for Bathroom
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

// Helper to create basic furniture like Sofa or generic blocks
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

// Bedroom Logic (Bed interaction = Sleep)
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

// Kitchen Logic (Fridge interaction = Stock/Eat)
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

// Computer creation (Marketplace Access)
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

// Spawns unlocked toys in the Living Room
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
    }
}

// Constructed the 3D Pet Character
function buildPet() {
    if (petGroup) scene.remove(petGroup);
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
    decayInterval = setInterval(() => {
        decayStats();

        const nextTime = STATE.gameTime + 15;
        if (nextTime >= 1440) {
            STATE.day++;
            STATE.chores.progress = {};

            const rentCost = 10;
            STATE.money -= rentCost;
            STATE.spending.rent += rentCost;
            showNotification(`Rent Paid: -$${rentCost}`, "warning");

            showNotification("🌅 A brand new day! Tasks have been reset.", "info");
            buildRoom();
        }
        STATE.gameTime = nextTime % 1440;

        if (!renderer.currentLoop) return;
        updateUI();
        updatePetBehavior();
        updateEnvironment();
    }, 1000);

    interestInterval = setInterval(() => {
        if (STATE.savings > 0) {
            const interest = STATE.savings * 0.02;
            STATE.savings += interest;
            STATE.lifetimeEarnings += interest;
            showNotification(`Interest Earned: +$${interest.toFixed(2)}`, "success");
            updateUI();
        }
    }, 60000);

    renderer.setAnimationLoop(animate);
    renderer.currentLoop = true;
}

function decayStats() {
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
}

function gameOver(reason) {
    clearInterval(decayInterval);
    clearInterval(interestInterval);
    renderer.setAnimationLoop(null);
    renderer.currentLoop = false;

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

        <button onclick="location.reload()" class="px-10 py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold text-2xl transition transform hover:scale-105 shadow-[0_0_30px_rgba(220,38,38,0.5)] pointer-events-auto cursor-pointer">
            Try Again
        </button>
    `;
    document.body.appendChild(screen);
}

function updateUI() {
    document.getElementById('val-hunger').innerText = Math.floor(STATE.stats.hunger);
    document.getElementById('bar-hunger').style.width = `${STATE.stats.hunger}%`;

    document.getElementById('val-energy').innerText = Math.floor(STATE.stats.energy);
    document.getElementById('bar-energy').style.width = `${STATE.stats.energy}%`;

    document.getElementById('val-hygiene').innerText = Math.floor(STATE.stats.hygiene);
    document.getElementById('bar-hygiene').style.width = `${STATE.stats.hygiene}%`;

    document.getElementById('val-happiness').innerText = Math.floor(STATE.stats.happiness);
    document.getElementById('bar-happiness').style.width = `${STATE.stats.happiness}%`;

    document.getElementById('display-money').innerText = STATE.money.toFixed(2);
    document.getElementById('display-savings').innerText = STATE.savings.toFixed(2);
    const dayEl = document.getElementById('display-day');
    if (dayEl) dayEl.innerText = STATE.day;

    const hrs = Math.floor(STATE.gameTime / 60);
    const mins = STATE.gameTime % 60;
    const period = hrs >= 12 ? "PM" : "AM";
    const displayHrs = hrs % 12 || 12;
    const displayMins = mins.toString().padStart(2, '0');
    document.getElementById('display-time').innerText = `${displayHrs}:${displayMins} ${period}`;

    const isNight = hrs >= 22 || hrs < 6;
    document.getElementById('display-time').className = `text-2xl font-bold ${isNight ? 'text-indigo-400' : 'text-sky-400'}`;


    document.getElementById('spend-food').innerText = `$${STATE.spending.food.toFixed(2)}`;
    document.getElementById('spend-toys').innerText = `$${STATE.spending.toys.toFixed(2)}`;
    document.getElementById('spend-education').innerText = `$${STATE.spending.education.toFixed(2)}`;
    document.getElementById('spend-care').innerText = `$${STATE.spending.care.toFixed(2)}`;
    document.getElementById('spend-rent').innerText = `$${STATE.spending.rent.toFixed(2)}`;
    document.getElementById('spend-utilities').innerText = `$${STATE.spending.utilities.toFixed(2)}`;
}

// Determines Pet's current emotion and animates accordingly
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

// Updates Global Lighting/Fog based on time of day
function updateEnvironment() {
    if (!scene) return;
    const hrs = Math.floor(STATE.gameTime / 60);
    const isNight = hrs >= 22 || hrs < 6;

    const targetHex = isNight ? 0x020617 : 0x202025;
    scene.background.setHex(targetHex);
    scene.fog.color.setHex(targetHex);
}

// Handles Raycasting for 3D clicks
function onMouseClick(event) {
    if (event.target.tagName !== 'CANVAS') return;

    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

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

// Handles Raycasting for Tooltip (Hover)
function onMouseMove(event) {
    const tooltip = document.getElementById('tooltip');

    if (event.target.tagName !== 'CANVAS') {
        tooltip.style.opacity = 0;
        document.body.style.cursor = 'default';
        return;
    }

    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

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
            document.body.style.cursor = 'pointer';
        } else {
            tooltip.style.opacity = 0;
            document.body.style.cursor = 'default';
        }
    } else {
        tooltip.style.opacity = 0;
        document.body.style.cursor = 'default';
    }
}

// Helper to resolve tooltip text from UserData
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
        const room = data.action.split(':')[1];
        const names = { livingroom: 'Living Room', bedroom: 'Bedroom', kitchen: 'Kitchen', bathroom: 'Bathroom' };
        return `Go to ${names[room] || room}`;
    }
    if (data.action === 'playWithToy') return "Play with Toy";

    return null;
}

// Routes interactions to specific logic
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
            let currentProgress = 0;
            let totalNeeded = 0;

            if (choreDef.global) {
                totalNeeded = choreDef.count * choreDef.room.length;
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
                showNotification(`Global Task Complete! +$${reward.toFixed(2)}`, "success");
                showNotification(choreDef.lesson, "info");
            }
            updateUI();
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

        STATE.stats.hygiene = 100;
        showNotification(`Squeaky clean! 🛁 (Bill: -$${waterCost})`, "success");
        updateUI();
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
            // Rent Deduction (for sleeping overnight)
            const rentCost = 10;
            STATE.money -= rentCost;
            STATE.spending.rent += rentCost;

            STATE.chores.progress = {}; // Reset Chores
            buildRoom(); // Reset Visuals
            showNotification(`Slept ${Math.floor(minutesSlept / 60)}h. Energy: ${energyRestore}%. Rent -$${rentCost}. New Day! 🌅`, "success");
        } else {
            showNotification(`Slept ${Math.floor(minutesSlept / 60)}h. Energy: ${energyRestore}%.`, "success");
        }

        updateEnvironment();
        updateUI();
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
        updateUI();
        // Animation: Jump
        triggerPetReaction('play');
    }
}

// User Action: Change Room
window.changeRoom = (roomName) => {
    // Legacy: if 'work' was a room, redirect
    if (roomName === 'work') { doWork(); return; }

    // Set Room and Rebuild Scene
    STATE.currentRoom = roomName;
    buildRoom();
    showNotification(`Entered ${roomName}`, "info");
};

// Legacy Work Function (kept for fallback)
function doWork() {

    if (STATE.stats.happiness < 10) { showNotification("Too depressed to work...", "error"); return; }
    STATE.money += CONFIG.salary;
    STATE.lifetimeEarnings += CONFIG.salary;
    STATE.stats.hunger -= 10; STATE.stats.happiness -= 10;
    updateUI(); showNotification(`Worked hard! Earned $${CONFIG.salary}. Happiness -10`, "success");
}

// Global UI Action: Close Modal
window.closeModal = (id) => {
    document.getElementById(id).classList.add('hidden');
};

// Global UI Action: Buy Item
window.buyItem = (type, cost) => {
    if (STATE.money >= cost) {
        STATE.money -= cost;
        if (type === 'kibble') {
            STATE.inventory.food += 1;
            STATE.spending.food += cost;
            showNotification("Purchased Premium Kibble! +1 Stock", "success");

        } else if (type === 'ball') {
            if (!STATE.inventory.toys.includes('ball')) {
                STATE.inventory.toys.push('ball');
                renderToys();
            }
            STATE.spending.toys += cost;
            showNotification("Purchased Bouncy Ball!", "success");
        }
        updateUI();
    } else {
        showNotification("Not enough money!", "error");
    }
};

// Global UI Action: Upgrade Education
window.buyEducation = () => {
    const cost = 50;
    if (STATE.money >= cost) {
        STATE.money -= cost;
        STATE.educationLevel++;
        STATE.spending.education += cost;
        showNotification("Education Upgraded! Rewards +$2", "success");
        updateUI();
    } else {
        showNotification("Not enough money!", "error");
    }
};

// Global UI Action: Bank Deposit
window.depositSavings = () => {
    const el = document.getElementById('deposit-amount');
    const amt = parseInt(el.value);
    if (!amt || amt <= 0) return;
    if (STATE.money >= amt) {
        STATE.money -= amt;
        STATE.savings += amt;
        showNotification(`Deposited $${amt}`, "success");
        updateUI();
        checkSavingsRewards();
        el.value = '';
    } else {
        showNotification("Insufficient funds", "error");
    }
};

// Global UI Action: Bank Withdraw
window.withdrawSavings = () => {
    const el = document.getElementById('deposit-amount');
    const amt = parseInt(el.value);
    if (!amt || amt <= 0) return;
    if (STATE.savings >= amt) {
        STATE.savings -= amt;
        STATE.money += amt;
        showNotification(`Withdrew $${amt}`, "success");
        updateUI();
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

// Global UI Action: Refresh Fridge UI
window.checkFridge = () => {
    updateFridgeUI();
};

// Global UI Action: Consume Item from Inventory
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
            updateUI();
        } else {
            showNotification("No food! Buy some at the market.", "warning");
        }

    }
};

// Update Fridge Modal Text
function updateFridgeUI() {
    document.getElementById('stock-food').innerText = STATE.inventory.food;

}

// Shows floating text in 3D view (simulated via UI overlay)
let indicatorTimeout;
function showActionIndicator(text) {
    const el = document.getElementById('action-indicator'); const txt = document.getElementById('action-text');
    if (el && txt) {
        txt.innerText = text; el.classList.remove('hidden');
        if (indicatorTimeout) clearTimeout(indicatorTimeout);
        indicatorTimeout = setTimeout(() => { el.classList.add('hidden'); }, 1500);
    }
}

// Updates the Sidebar Task List based on active chores
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

// Visual Effect: Money Particles
function spawnMoneyParticles(pos) {
    if (!scene || !camera) return;
    const particle = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ color: 0x4ade80, side: THREE.DoubleSide, transparent: true }));
    particle.position.copy(pos); particle.lookAt(camera.position); scene.add(particle);
    let frame = 0;
    const anim = setInterval(() => {
        particle.position.y += 0.05; particle.scale.setScalar(1 + Math.sin(frame * 0.2) * 0.2); particle.material.opacity = Math.max(0, 1 - (frame / 30));
        frame++; if (frame > 30) { clearInterval(anim); if (particle.parent) scene.remove(particle); }
    }, 30);
}

// General Notification System (Toast)
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

// Main Render Loop (Three.js)
function animate() {
    if (petGroup) { petGroup.rotation.y += 0.01; }
    renderer.render(scene, camera);
}

// Triggers 3D animations and particles based on the action performed
function triggerPetReaction(type) {
    if (!petGroup) return;

    if (type === 'eating') {
        const animDuration = 20;
        let frame = 0;
        const anim = setInterval(() => {
            frame++;
            petGroup.rotation.x = Math.sin(frame * 0.5) * 0.3 + 0.2;
            petGroup.scale.set(1.1, 0.9, 1.1);
            if (frame > animDuration) {
                clearInterval(anim);
                petGroup.rotation.x = 0;
                petGroup.scale.set(1, 1, 1);
            }
        }, 50);
        spawnEmoteParticle('🍖');
        spawnEmoteParticle('😋');
    }

    else if (type === 'bath') {
        let spins = 0;
        const spinInterval = setInterval(() => {
            if (spins < 20) {
                petGroup.rotation.y += 0.8;
                spins++;
            } else {
                clearInterval(spinInterval);
                petGroup.rotation.y = 0;
            }
        }, 30);
        spawnEmoteParticle('🫧');
        spawnEmoteParticle('✨');
    }

    else if (type === 'sleep') {
        petGroup.rotation.z = Math.PI / 2;
        petGroup.position.y = 0.5;
        spawnEmoteParticle('💤');
        setTimeout(() => {
            if (petGroup) {
                petGroup.rotation.z = 0;
                petGroup.position.y = 0;
            }
        }, 2000);
    }

    else if (type === 'play') {
        let jumpHeight = 0;
        const jumpInt = setInterval(() => {
            jumpHeight += 0.2;
            petGroup.position.y = Math.sin(jumpHeight) * 2;
            if (jumpHeight > Math.PI) {
                clearInterval(jumpInt);
                petGroup.position.y = 0;
            }
        }, 30);
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
    const anim = setInterval(() => {
        sprite.position.y += 0.05;
        sprite.material.opacity = 1 - (frame / 50);
        frame++;
        if (frame > 50) {
            clearInterval(anim);
            scene.remove(sprite);
            mat.dispose();
            tex.dispose();
        }
    }, 30);
}
