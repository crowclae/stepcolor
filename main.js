////////////////////////////////////////////////////////////
// Imports
////////////////////////////////////////////////////////////

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';

import { OrbitControls }
from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/controls/OrbitControls.js';

////////////////////////////////////////////////////////////
// HTML Elements
////////////////////////////////////////////////////////////

const canvas =
    document.getElementById('viewer');

const stepFileInput =
    document.getElementById('stepFile');

const colorPicker =
    document.getElementById('colorPicker');

const loading =
    document.getElementById('loading');

const faceIdLabel =
    document.getElementById('faceId');

const meshNameLabel =
    document.getElementById('meshName');

const viewerContainer =
    document.getElementById('viewer-container');

////////////////////////////////////////////////////////////
// Scene
////////////////////////////////////////////////////////////

const scene = new THREE.Scene();

scene.background =
    new THREE.Color(0x2a2a2a);

////////////////////////////////////////////////////////////
// Camera
////////////////////////////////////////////////////////////

const camera =
    new THREE.PerspectiveCamera(
        45,
        window.innerWidth / window.innerHeight,
        0.1,
        100000
    );

camera.position.set(150, 120, 150);

////////////////////////////////////////////////////////////
// Renderer
////////////////////////////////////////////////////////////

const renderer =
    new THREE.WebGLRenderer({
        canvas,
        antialias: true
    });

renderer.setSize(
    window.innerWidth,
    window.innerHeight
);

renderer.setPixelRatio(
    window.devicePixelRatio
);

////////////////////////////////////////////////////////////
// Controls
////////////////////////////////////////////////////////////

const controls =
    new OrbitControls(
        camera,
        renderer.domElement
    );

controls.enableDamping = true;

////////////////////////////////////////////////////////////
// Lights
////////////////////////////////////////////////////////////

const ambientLight =
    new THREE.AmbientLight(
        0xffffff,
        1.4
    );

scene.add(ambientLight);

const dirLight =
    new THREE.DirectionalLight(
        0xffffff,
        2.0
    );

dirLight.position.set(100, 150, 100);

scene.add(dirLight);

////////////////////////////////////////////////////////////
// Grid
////////////////////////////////////////////////////////////

const grid =
    new THREE.GridHelper(
        500,
        50,
        0x666666,
        0x444444
    );

scene.add(grid);

////////////////////////////////////////////////////////////
// Raycaster
////////////////////////////////////////////////////////////

const raycaster =
    new THREE.Raycaster();

const mouse =
    new THREE.Vector2();

////////////////////////////////////////////////////////////
// State & Drag Paint Flags
////////////////////////////////////////////////////////////

let currentModel = null;

let selectedFaceIndex = null; 

// ドラッグペイント用のフラグ管理
let isLeftMouseDown = false; 

// 画面回転用のキー（Shift/Ctrl）が押されているか、または右/中クリックかを判定してペイントを無効化するため
let isRotating = false; 

////////////////////////////////////////////////////////////
// OpenCascade Init
////////////////////////////////////////////////////////////

loading.innerText =
    'Initializing OpenCascade...';

const occt = await occtimportjs();

loading.innerText =
    'Drop STEP File';

console.log(
    'OpenCascade Ready',
    occt
);

////////////////////////////////////////////////////////////
// STEP File Load
////////////////////////////////////////////////////////////

stepFileInput.addEventListener(
    'change',
    async (event) => {

        const file =
            event.target.files[0];

        if (!file) return;

        await loadStepFile(file);
    }
);

////////////////////////////////////////////////////////////
// Drag & Drop
////////////////////////////////////////////////////////////

viewerContainer.addEventListener(
    'dragover',
    (event) => {

        event.preventDefault();

        viewerContainer.classList.add(
            'dragover'
        );
    }
);

viewerContainer.addEventListener(
    'dragleave',
    () => {

        viewerContainer.classList.remove(
            'dragover'
        );
    }
);

viewerContainer.addEventListener(
    'drop',
    async (event) => {

        event.preventDefault();

        viewerContainer.classList.remove(
            'dragover'
        );

        const file =
            event.dataTransfer.files[0];

        if (!file) return;

        await loadStepFile(file);
    }
);

////////////////////////////////////////////////////////////
// STEP Loader
////////////////////////////////////////////////////////////

async function loadStepFile(file) {

    try {

        loading.style.display = 'block';

        loading.innerText =
            'Reading STEP File...';

        if (currentModel) {

            scene.remove(currentModel);

            currentModel.traverse((child) => {

                if (child.isMesh) {

                    child.geometry.dispose();

                    child.material.dispose();
                }
            });
        }

        const arrayBuffer =
            await file.arrayBuffer();

        const fileBuffer =
            new Uint8Array(arrayBuffer);

        loading.innerText =
            'Parsing STEP Geometry...';

        const result = occt.ReadStepFile(fileBuffer, null);

        console.log('STEP Result:', result);

        currentModel = new THREE.Group();

        const meshData = result.meshes[0];
        if (!meshData) return;

        const baseGeometry = new THREE.BufferGeometry();

        baseGeometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(meshData.attributes.position.array, 3)
        );

        if (meshData.attributes.normal) {
            baseGeometry.setAttribute(
                'normal',
                new THREE.Float32BufferAttribute(meshData.attributes.normal.array, 3)
            );
        }

        baseGeometry.setIndex(meshData.index.array);

        // ポリゴンを独立させて面ごとにきれいに塗れるようにする
        const geometry = baseGeometry.toNonIndexed();
        baseGeometry.dispose();

        // 初期色（薄いグレー）を設定
        const vertexCount = geometry.attributes.position.count;
        const colors = new Float32Array(vertexCount * 3);
        for (let i = 0; i < colors.length; i++) {
            colors[i] = 0.7; 
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.MeshStandardMaterial({
            vertexColors: true, 
            metalness: 0.0,
            roughness: 0.7
        });

        const mesh = new THREE.Mesh(geometry, material);

        mesh.userData = {
            name: meshData.name || "STEP_Model"
        };

        mesh.castShadow = true;
        mesh.receiveShadow = true;
        currentModel.add(mesh);

        scene.add(currentModel);

        fitCameraToObject(currentModel);

        selectedFaceIndex = null; 
        loading.style.display = 'none';
        console.log('STEP Loaded (Vertex Color Mode)');

    } catch (error) {
        console.error(error);
        loading.innerText = 'STEP Load Failed';
    }
}

////////////////////////////////////////////////////////////
// Fit Camera
////////////////////////////////////////////////////////////

function fitCameraToObject(object) {

    const box =
        new THREE.Box3()
            .setFromObject(object);

    const center =
        box.getCenter(
            new THREE.Vector3()
        );

    const size =
        box.getSize(
            new THREE.Vector3()
        );

    const maxDim =
        Math.max(
            size.x,
            size.y,
            size.z
        );

    const fitDistance =
        maxDim * 1.5;

    camera.position.set(
        center.x + fitDistance,
        center.y + fitDistance,
        center.z + fitDistance
    );

    controls.target.copy(center);

    camera.near =
        maxDim / 100;

    camera.far =
        maxDim * 100;

    camera.updateProjectionMatrix();

    controls.update();
}

////////////////////////////////////////////////////////////
// Paint Core Logic (共通ペイント処理)
////////////////////////////////////////////////////////////

function checkAndPaint(clientX, clientY) {
    if (!currentModel) return;

    const rect = canvas.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // インポートしたSTEPモデルのメッシュだけをターゲットにする（グリッドの誤爆を回避）
    const intersects = raycaster.intersectObjects(currentModel.children, true);

    if (intersects.length === 0) return;

    const intersect = intersects[0];
    selectedFaceIndex = intersect.faceIndex; 
    if (selectedFaceIndex === undefined) return;

    // UIの更新
    faceIdLabel.innerText = selectedFaceIndex;
    meshNameLabel.innerText = `Polygon_${selectedFaceIndex}`;

    // 対象のポリゴンを塗り替える
    applyColorToSelectedFace(colorPicker.value);
}

////////////////////////////////////////////////////////////
// Pointer Events (左クリックのみ・ドラッグ範囲選択対応)
////////////////////////////////////////////////////////////

// マウスが押されたとき
canvas.addEventListener('pointerdown', (event) => {
    // button === 0 が「左クリック」を表す。右(2)やホイール(1)は除外
    // また、ShiftやCtrlキーを押しながらの左ドラッグはカメラ操作（パンなど）とみなして除外
    if (event.button === 0 && !event.shiftKey && !event.ctrlKey) {
        isLeftMouseDown = true;
        isRotating = false;
        
        // 1発目のクリック時のペイント
        checkAndPaint(event.clientX, event.clientY);
    } else {
        isRotating = true; // カメラ回転・操作中
    }
});

// マウスが動いているとき（ドラッグ中）
canvas.addEventListener('pointermove', (event) => {
    // 左クリックが押されており、かつカメラ操作中でなければなぞった場所を塗る
    if (isLeftMouseDown && !isRotating) {
        // OrbitControlsの回転挙動を一時的に停止（ペイントを優先させるため）
        controls.enabled = false;
        
        checkAndPaint(event.clientX, event.clientY);
    }
});

// マウスが離されたとき / 画面外に出たとき
const stopPainting = () => {
    isLeftMouseDown = false;
    isRotating = false;
    controls.enabled = true; // カメラ操作を有効に戻す
};

window.addEventListener('pointerup', stopPainting);
canvas.addEventListener('pointerleave', stopPainting);

////////////////////////////////////////////////////////////
// Color Change Event (単発でピッカーを直接動かした時用)
////////////////////////////////////////////////////////////

colorPicker.addEventListener(
    'input',
    (event) => {
        if (selectedFaceIndex === null) return;
        applyColorToSelectedFace(event.target.value);
    }
);

////////////////////////////////////////////////////////////
// Function: 指定されたポリゴンの色を塗り替える
////////////////////////////////////////////////////////////

function applyColorToSelectedFace(hexColor) {
    if (selectedFaceIndex === null || !currentModel) return;

    const targetMesh = currentModel.children[0];
    if (!targetMesh) return;

    const geometry = targetMesh.geometry;
    const colorAttribute = geometry.attributes.color;
    
    if (!colorAttribute) return;

    const color = new THREE.Color(hexColor);
    const startVertex = selectedFaceIndex * 3;

    for (let i = 0; i < 3; i++) {
        const vertexIdx = startVertex + i;
        colorAttribute.setXYZ(vertexIdx, color.r, color.g, color.b);
    }

    colorAttribute.needsUpdate = true;
}

////////////////////////////////////////////////////////////
// Resize
////////////////////////////////////////////////////////////

window.addEventListener(
    'resize',
    () => {

        camera.aspect =
            window.innerWidth /
            window.innerHeight;

        camera.updateProjectionMatrix();

        renderer.setSize(
            window.innerWidth,
            window.innerHeight
        );
    }
);

////////////////////////////////////////////////////////////
// Animate
////////////////////////////////////////////////////////////

function animate() {

    requestAnimationFrame(
        animate
    );

    controls.update();

    renderer.render(
        scene,
        camera
    );
}

animate();
