////////////////////////////////////////////////////////////
// Imports
////////////////////////////////////////////////////////////

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';

// OrbitControls から TrackballControls に変更
import { TrackballControls }
from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/controls/TrackballControls.js';

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

// 新規追加UI要素
const thresholdSlider = document.getElementById('thresholdSlider');
const thresholdValue = document.getElementById('thresholdValue');
const thresholdMinus = document.getElementById('thresholdMinus');
const thresholdPlus = document.getElementById('thresholdPlus');
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
// Controls (TrackballControls による全方位自由回転)
////////////////////////////////////////////////////////////

const controls =
    new TrackballControls(
        camera,
        renderer.domElement
    );

// 各種操作の感度・速度設定
controls.rotateSpeed = 1.2;
controls.zoomSpeed = 1.2;
controls.panSpeed = 0.8;

// なめらかな動き（慣性）の有効化
controls.dynamicDampingFactor = 0.1;

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
// State
////////////////////////////////////////////////////////////

let currentModel = null;

let selectedMesh = null;

// 曲率判定用のしきい値変数
let smoothAngleThreshold = parseInt(thresholdSlider.value, 10);

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

        //////////////////////////////////////////////////////
        // Remove previous model
        //////////////////////////////////////////////////////

        if (currentModel) {

            scene.remove(currentModel);

            currentModel.traverse((child) => {

                if (child.isMesh) {

                    child.geometry.dispose();

                    child.material.dispose();
                }
            });
        }

        //////////////////////////////////////////////////////
        // Read file
        //////////////////////////////////////////////////////

        const arrayBuffer =
            await file.arrayBuffer();

        const fileBuffer =
            new Uint8Array(arrayBuffer);

        //////////////////////////////////////////////////////
        // Parse STEP
        //////////////////////////////////////////////////////

        loading.innerText =
            'Parsing STEP Geometry...';

        const result =
            occt.ReadStepFile(
                fileBuffer,
                null
            );

        console.log(
            'STEP Result:',
            result
        );

        //////////////////////////////////////////////////////
        // Build Three.js Object
        //////////////////////////////////////////////////////

        currentModel =
            new THREE.Group();

        //////////////////////////////////////////////////////
        // Mesh Build
        //////////////////////////////////////////////////////

        for (
            let i = 0;
            i < result.meshes.length;
            i++
        ) {

            const meshData =
                result.meshes[i];

            //////////////////////////////////////////////////
            // Geometry
            //////////////////////////////////////////////////

            const geometry =
                new THREE.BufferGeometry();

            geometry.setAttribute(
                'position',
                new THREE.Float32BufferAttribute(
                    meshData.attributes.position.array,
                    3
                )
            );

            //////////////////////////////////////////////////
            // Normal
            //////////////////////////////////////////////////

            if (
                meshData.attributes.normal
            ) {

                geometry.setAttribute(
                    'normal',
                    new THREE.Float32BufferAttribute(
                        meshData.attributes.normal.array,
                        3
                    )
                );
            }

            //////////////////////////////////////////////////
            // Index
            //////////////////////////////////////////////////

            geometry.setIndex(
                meshData.index.array
            );

            //////////////////////////////////////////////////
            // Material
            //////////////////////////////////////////////////

            const material =
                new THREE.MeshStandardMaterial({

                    color: 0xb0b0b0,

                    metalness: 0.0,

                    roughness: 0.7
                });

            //////////////////////////////////////////////////
            // Mesh
            //////////////////////////////////////////////////

            const mesh =
                new THREE.Mesh(
                    geometry,
                    material
                );

            //////////////////////////////////////////////////
            // Face Metadata
            //////////////////////////////////////////////////

            mesh.userData = {

                faceId: i,

                name:
                    meshData.name ||
                    `Face_${i}`
            };

            //////////////////////////////////////////////////
            // Shadow
            //////////////////////////////////////////////////

            mesh.castShadow = true;

            mesh.receiveShadow = true;

            //////////////////////////////////////////////////
            // Add
            //////////////////////////////////////////////////

            currentModel.add(mesh);
        }

        //////////////////////////////////////////////////////
        // Add scene
        //////////////////////////////////////////////////////

        scene.add(currentModel);

        //////////////////////////////////////////////////////
        // Auto Fit
        //////////////////////////////////////////////////////

        fitCameraToObject(
            currentModel
        );

        //////////////////////////////////////////////////////
        // Done
        //////////////////////////////////////////////////////

        selectedMesh = null;
        loading.style.display = 'none';

        console.log(
            'STEP Loaded'
        );

    } catch (error) {

        console.error(error);

        loading.innerText =
            'STEP Load Failed';
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

    // TrackballControls 用に最小・最大ズーム範囲を再計算
    controls.minDistance = maxDim / 10;
    controls.maxDistance = maxDim * 10;

    controls.handleResize();
    controls.update();
}

////////////////////////////////////////////////////////////
// Face Select & Click Paint
////////////////////////////////////////////////////////////

window.addEventListener(
    'pointerdown',
    (event) => {
        // キャンバスおよびヘッダー等コントロール以外のクリックのみ反応させる
        if (event.target !== canvas) return;

        mouse.x =
            (event.clientX / window.innerWidth)
            * 2 - 1;

        mouse.y =
            -(event.clientY / window.innerHeight)
            * 2 + 1;

        raycaster.setFromCamera(
            mouse,
            camera
        );

        const intersects =
            raycaster.intersectObjects(
                scene.children,
                true
            );

        if (
            intersects.length === 0
        ) return;

        //////////////////////////////////////////////////////
        // Reset previous highlight
        //////////////////////////////////////////////////////

        if (selectedMesh) {
            if (
                selectedMesh.material &&
                selectedMesh.material.emissive
            ) {
                selectedMesh.material.emissive.set(0x000000);
            }
        }

        //////////////////////////////////////////////////////
        // Select & Paint
        //////////////////////////////////////////////////////

        selectedMesh = intersects[0].object;

        // ★変更点：クリックした瞬間に、現在の「ピッカーの色」を適用する
        if (selectedMesh.material) {
            selectedMesh.material.color.set(colorPicker.value);
            
            // ハイライトも同時に少し入れる（視認性向上のため）
            if (selectedMesh.material.emissive) {
                selectedMesh.material.emissive.set(0x222222);
            }
        }

        //////////////////////////////////////////////////////
        // UI Update
        //////////////////////////////////////////////////////

        faceIdLabel.innerText =
            selectedMesh.userData.faceId;

        meshNameLabel.innerText =
            selectedMesh.userData.name;

        console.log(
            'Selected & Painted:',
            selectedMesh.userData
        );
    }
);

////////////////////////////////////////////////////////////
// Color Change (★修正：ピッカー変更による自動上書きを廃止)
////////////////////////////////////////////////////////////

colorPicker.addEventListener(
    'input',
    (event) => {
        // ここでの selectedMesh に対する自動色変更ロジックを廃止しました。
        // これにより、カラーピッカーの色を変えても過去の選択パーツは汚染されず、
        // 「次にクリックしたパーツ」から新しい色が適用されるようになります。
        console.log('Brush color reserved:', event.target.value);
    }
);

////////////////////////////////////////////////////////////
// Threshold Controls (スライダー & 左右の増減ボタン)
////////////////////////////////////////////////////////////

thresholdSlider.addEventListener('input', (event) => {
    const val = parseInt(event.target.value, 10);
    updateThresholdDisplay(val);
});

thresholdMinus.addEventListener('click', () => {
    let currentVal = parseInt(thresholdSlider.value, 10);
    currentVal = Math.max(0, currentVal - 5);
    thresholdSlider.value = currentVal; 
    updateThresholdDisplay(currentVal);
});

thresholdPlus.addEventListener('click', () => {
    let currentVal = parseInt(thresholdSlider.value, 10);
    currentVal = Math.min(90, currentVal + 5);
    thresholdSlider.value = currentVal; 
    updateThresholdDisplay(currentVal);
});

function updateThresholdDisplay(val) {
    smoothAngleThreshold = val;
    thresholdValue.innerText = `${val}°`;
    console.log('Threshold updated to:', val);
}

////////////////////////////////////////////////////////////
// 保存(ダウンロード) & インポート(読み込み) 処理
////////////////////////////////////////////////////////////

saveColorsButton.addEventListener('click', () => {
    if (!currentModel) {
        alert('モデルがロードされていません。');
        return;
    }

    const colorDataList = [];

    // 各子メッシュの色情報をスキャンして配列化
    currentModel.children.forEach((mesh) => {
        if (mesh.isMesh && mesh.material) {
            colorDataList.push({
                faceId: mesh.userData.faceId,
                hex: "#" + mesh.material.color.getHexString()
            });
        }
    });

    const exportData = {
        application: "STEP Face Viewer Color Data",
        timestamp: Date.now(),
        faceCount: colorDataList.length,
        colors: colorDataList
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `step-model-colors.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);

    console.log('Color data downloaded.');
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

            if (importedData.faceCount !== currentModel.children.length) {
                alert('インポートされた色データは、現在開いているSTEPモデルとメッシュ数が異なるため適用できません。');
                return;
            }

            // メッシュのIDをキーにして色を一括復元
            const colorMap = new Map(importedData.colors.map(item => [item.faceId, item.hex]));

            currentModel.children.forEach((mesh) => {
                if (mesh.isMesh && mesh.material) {
                    const savedColor = colorMap.get(mesh.userData.faceId);
                    if (savedColor) {
                        mesh.material.color.set(savedColor);
                    }
                }
            });

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

        controls.handleResize();
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
