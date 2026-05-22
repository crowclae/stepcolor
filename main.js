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

// UI要素
const undoButton = document.getElementById('undoButton');
const thresholdSlider = document.getElementById('thresholdSlider');
const thresholdValue = document.getElementById('thresholdValue');
const saveColorsButton = document.getElementById('saveColorsButton');
const importColorsFile = document.getElementById('importColorsFile');

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
// State & Paint Flags
////////////////////////////////////////////////////////////

let currentModel = null;

let selectedFaceIndex = null; 

let isLeftMouseDown = false; 

let isRotating = false; 

let adjacencyMap = null; 

// 可変しきい値
let smoothAngleThreshold = parseInt(thresholdSlider.value, 10); 

// 履歴管理（Undo用）
let colorHistory = [];
const MAX_HISTORY = 20;

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

        const geometry = baseGeometry.toNonIndexed();
        baseGeometry.dispose();

        geometry.computeVertexNormals();

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

        loading.innerText = 'Analyzing curvature surface...';
        buildAdjacencyMap(geometry);

        fitCameraToObject(currentModel);

        selectedFaceIndex = null; 
        colorHistory = []; 
        loading.style.display = 'none';
        console.log('STEP Loaded (Curvature Recognition Mode)');

    } catch (error) {
        console.error(error);
        loading.innerText = 'STEP Load Failed';
    }
}

////////////////////////////////////////////////////////////
// Function: 隣接関係マップ構築
////////////////////////////////////////////////////////////
function buildAdjacencyMap(geometry) {
    const posAttr = geometry.attributes.position;
    const faceCount = posAttr.count / 3;
    adjacencyMap = Array.from({ length: faceCount }, () => []);

    const vertexToFaces = new Map();

    for (let f = 0; f < faceCount; f++) {
        for (let v = 0; v < 3; v++) {
            const idx = f * 3 + v;
            const x = Math.round(posAttr.getX(idx) * 1000) / 1000;
            const y = Math.round(posAttr.getY(idx) * 1000) / 1000;
            const z = Math.round(posAttr.getZ(idx) * 1000) / 1000;
            const key = `${x},${y},${z}`;

            if (!vertexToFaces.has(key)) {
                vertexToFaces.set(key, []);
            }
            vertexToFaces.get(key).push(f);
        }
    }

    vertexToFaces.forEach((faces) => {
        if (faces.length > 1) {
            for (let i = 0; i < faces.length; i++) {
                for (let j = i + 1; j < faces.length; j++) {
                    const f1 = faces[i];
                    const f2 = faces[j];
                    if (!adjacencyMap[f1].includes(f2)) adjacencyMap[f1].push(f2);
                    if (!adjacencyMap[f2].includes(f1)) adjacencyMap[f2].push(f1);
                }
            }
        }
    });
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
// Paint Core Logic
////////////////////////////////////////////////////////////

function checkAndPaint(clientX, clientY, isFirstClick = false) {
    if (!currentModel || !adjacencyMap) return;

    const rect = canvas.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(currentModel.children, true);
    if (intersects.length === 0) return;

    const intersect = intersects[0];
    const startFaceIndex = intersect.faceIndex; 
    if (startFaceIndex === undefined) return;

    selectedFaceIndex = startFaceIndex;

    faceIdLabel.innerText = startFaceIndex;
    meshNameLabel.innerText = `CurvedFace_Root_${startFaceIndex}`;

    const targetMesh = intersect.object;
    const connectedFaces = findConnectedSmoothSurfaces(targetMesh.geometry, startFaceIndex);

    if (isFirstClick) {
        saveHistory(targetMesh);
    }

    applyColorToFaceGroup(targetMesh, connectedFaces, colorPicker.value);
}

////////////////////////////////////////////////////////////
// Algorithm: BFS曲面探索
////////////////////////////////////////////////////////////
function findConnectedSmoothSurfaces(geometry, startFace) {
    const normAttr = geometry.attributes.normal;
    const connected = new Set();
    const queue = [startFace];
    connected.add(startFace);

    const getFaceNormal = (fIdx, targetVec) => {
        const nA = new THREE.Vector3(normAttr.getX(fIdx*3), normAttr.getY(fIdx*3), normAttr.getZ(fIdx*3));
        const nB = new THREE.Vector3(normAttr.getX(fIdx*3+1), normAttr.getY(fIdx*3+1), normAttr.getZ(fIdx*3+1));
        const nC = new THREE.Vector3(normAttr.getX(fIdx*3+2), normAttr.getY(fIdx*3+2), normAttr.getZ(fIdx*3+2));
        targetVec.copy(nA).add(nB).add(nC).normalize();
    };

    const normal1 = new THREE.Vector3();
    const normal2 = new THREE.Vector3();
    const thresholdCos = Math.cos(THREE.MathUtils.degToRad(smoothAngleThreshold));

    while (queue.length > 0) {
        const currentFace = queue.shift();
        getFaceNormal(currentFace, normal1);

        const neighbors = adjacencyMap[currentFace] || [];
        for (let i = 0; i < neighbors.length; i++) {
            const neighbor = neighbors[i];
            if (connected.has(neighbor)) continue;

            getFaceNormal(neighbor, normal2);

            const dot = normal1.dot(normal2);

            if (dot >= thresholdCos) {
                connected.add(neighbor);
                queue.push(neighbor);
            }
        }
    }

    return Array.from(connected);
}

////////////////////////////////////////////////////////////
// Pointer Events
////////////////////////////////////////////////////////////

canvas.addEventListener('pointerdown', (event) => {
    if (event.button === 0 && !event.shiftKey && !event.ctrlKey) {
        isLeftMouseDown = true;
        isRotating = false;
        checkAndPaint(event.clientX, event.clientY, true);
    } else {
        isRotating = true; 
    }
});

canvas.addEventListener('pointermove', (event) => {
    if (isLeftMouseDown && !isRotating) {
        controls.enabled = false; 
        checkAndPaint(event.clientX, event.clientY, false);
    }
});

const stopPainting = () => {
    isLeftMouseDown = false;
    isRotating = false;
    controls.enabled = true; 
};

window.addEventListener('pointerup', stopPainting);
canvas.addEventListener('pointerleave', stopPainting);

////////////////////////////////////////////////////////////
// Color Change Events & Palette Links
////////////////////////////////////////////////////////////

// ★修正：カラーピッカーを変更した時は、直前にクリックした面を自動上書きしないように変更
// （次のクリック・なぞり操作のときからこの色で塗られるようになります）
colorPicker.addEventListener('input', (event) => {
    // 内部値を変更するだけで、自動で更新関数(updateCurrentSelectionColor)を呼ばないようにしました
    console.log('Brush color changed to:', event.target.value);
});

// ★修正：基本カラーパレットのボタンをクリックした時も、ピッカーの値を同期するだけに限定
document.querySelectorAll('.palette-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
        const hexColor = event.target.getAttribute('data-color');
        colorPicker.value = hexColor;
        console.log('Brush color changed via palette to:', hexColor);
    });
});

////////////////////////////////////////////////////////////
// Undo Logic (戻る機能)
////////////////////////////////////////////////////////////

function saveHistory(mesh) {
    const colorAttribute = mesh.geometry.attributes.color;
    if (!colorAttribute) return;

    const snapshot = new Float32Array(colorAttribute.array);
    colorHistory.push(snapshot);

    if (colorHistory.length > MAX_HISTORY) {
        colorHistory.shift();
    }
}

undoButton.addEventListener('click', () => {
    if (colorHistory.length === 0 || !currentModel) return;

    const targetMesh = currentModel.children[0];
    if (!targetMesh) return;

    const colorAttribute = targetMesh.geometry.attributes.color;
    if (!colorAttribute) return;

    const previousState = colorHistory.pop();
    colorAttribute.array.set(previousState);
    colorAttribute.needsUpdate = true;

    console.log('Undo executed.');
});

////////////////////////////////////////////////////////////
// Threshold Slider Event
////////////////////////////////////////////////////////////

thresholdSlider.addEventListener('input', (event) => {
    const val = parseInt(event.target.value, 10);
    smoothAngleThreshold = val;
    thresholdValue.innerText = `${val}°`;
});

////////////////////////////////////////////////////////////
// 保存(ダウンロード) & インポート(読み込み) の処理
////////////////////////////////////////////////////////////

saveColorsButton.addEventListener('click', () => {
    if (!currentModel) {
        alert('モデルがロードされていません。');
        return;
    }
    const targetMesh = currentModel.children[0];
    if (!targetMesh) return;

    const colorAttribute = targetMesh.geometry.attributes.color;
    if (!colorAttribute) return;

    const colorArray = Array.from(colorAttribute.array);

    const exportData = {
        application: "STEP Face Viewer Color Data",
        timestamp: Date.now(),
        vertexColorCount: colorArray.length,
        colors: colorArray
    };

    const jsonString = JSON.stringify(exportData);
    const blob = new Blob([jsonString], { type: 'application/json' });
    
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `step-model-colors.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);

    console.log('Color state downloaded successfully.');
});

importColorsFile.addEventListener('change', (event) => {
    if (!currentModel) {
        alert('最初にSTEPファイルをインポートしてください。');
        event.target.value = '';
        return;
    }

    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedData = JSON.parse(e.target.result);
            
            const targetMesh = currentModel.children[0];
            const colorAttribute = targetMesh ? targetMesh.geometry.attributes.color : null;

            if (!colorAttribute) {
                alert('モデルのジオメトリ構造が無効です。');
                return;
            }

            if (importedData.vertexColorCount !== colorAttribute.array.length) {
                alert('インポートされた色データは、現在開いているSTEPモデルと形状（ポリゴン数）が異なるため適用できません。');
                return;
            }

            saveHistory(targetMesh);
            colorAttribute.array.set(importedData.colors);
            colorAttribute.needsUpdate = true;

            alert('カラーデータをインポートして復元しました！');

        } catch (error) {
            console.error(error);
            alert('JSONファイルの読み込みに失敗しました。');
        }
        event.target.value = '';
    };

    reader.readAsText(file);
});

////////////////////////////////////////////////////////////
// Function: 指定グループの頂点カラーを書き換え
////////////////////////////////////////////////////////////

function applyColorToFaceGroup(mesh, faceIndices, hexColor) {
    const geometry = mesh.geometry;
    const colorAttribute = geometry.attributes.color;
    if (!colorAttribute) return;

    const color = new THREE.Color(hexColor);

    for (let f = 0; f < faceIndices.length; f++) {
        const fIdx = faceIndices[f];
        const startVertex = fIdx * 3;
        for (let i = 0; i < 3; i++) {
            colorAttribute.setXYZ(startVertex + i, color.r, color.g, color.b);
        }
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
