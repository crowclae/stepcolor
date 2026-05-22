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
// State
////////////////////////////////////////////////////////////

let currentModel = null;

// 今回はメッシュ全体ではなく、選択されたマテリアルのインデックス（Group ID）を保持する
let selectedGroupIndex = null; 

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

                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
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

        const result = occt.ReadStepFile(fileBuffer, null);

        console.log('STEP Result:', result);

        currentModel = new THREE.Group();

        // 1つのメッシュの中に、複数の「面（サブ形状）」の情報が格納されているか確認
        // occt-import-jsのデータ構造によっては、result.meshes[0]の中にfaces配列などが入っている場合があります。
        // ここでは一般的な構造に対応するため、メッシュ内の全インデックスを解析します。
        
        const meshData = result.meshes[0];
        if (!meshData) return;

        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(meshData.attributes.position.array, 3)
        );

        if (meshData.attributes.normal) {
            geometry.setAttribute(
                'normal',
                new THREE.Float32BufferAttribute(meshData.attributes.normal.array, 3)
            );
        }

        geometry.setIndex(meshData.index.array);

        //////////////////////////////////////////////////////
        // マルチマテリアルとジオメトリ・グループの設定
        //////////////////////////////////////////////////////
        
        const materials = [];
        
        // もしライブラリの出力に「内部的な面（サブメッシュ）」のセグメント情報（例: meshData.faces など）があればそれを使います。
        // 無い場合は、ひとまずインデックス全体をカバーするデフォルトグループ、または一定数で分割します。
        // ここでは、occt-import-jsが提供する「インデックスデータ」の範囲に基づいてグループを自動生成します。
        
        if (meshData.faces && meshData.faces.length > 0) {
            // 面の分割データが存在する場合
            for (let f = 0; f < meshData.faces.length; f++) {
                const faceData = meshData.faces[f];
                
                // ジオメトリにグループ（マテリアルの適用範囲）を追加
                geometry.addGroup(faceData.start, faceData.count, f);
                
                // 各面ごとの個別マテリアルを作成
                materials.push(new THREE.MeshStandardMaterial({
                    color: 0xb0b0b0,
                    metalness: 0.0,
                    roughness: 0.7
                }));
            }
        } else {
            // 分割データが平坦な場合（暫定的にインデックス全体を1つとして扱う、または三角形ごとにグループ化できるようにする）
            // 多くの場合は meshData.index.array.length 全体が対象
            geometry.addGroup(0, meshData.index.array.length, 0);
            materials.push(new THREE.MeshStandardMaterial({
                color: 0xb0b0b0,
                metalness: 0.0,
                roughness: 0.7
            }));
        }

        // メッシュにマテリアル配列を適用
        const mesh = new THREE.Mesh(geometry, materials);

        mesh.userData = {
            name: meshData.name || "STEP_Model",
            isSingleMeshStructure: true
        };

        mesh.castShadow = true;
        mesh.receiveShadow = true;
        currentModel.add(mesh);

        scene.add(currentModel);

        fitCameraToObject(currentModel);

        loading.style.display = 'none';
        console.log('STEP Loaded (Single Mesh Mode)');

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
// Face Select
////////////////////////////////////////////////////////////

canvas.addEventListener(
    'pointerdown',
    (event) => {

        const rect = canvas.getBoundingClientRect();

        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);

        if (!currentModel) return;

        const intersects = raycaster.intersectObjects(currentModel.children, true);

        if (intersects.length === 0) return;

        const intersect = intersects[0];
        const targetMesh = intersect.object;
        
        // クリックされたポリゴン（三角形）のインデックスを取得
        const clickedFaceIndex = intersect.faceIndex; 
        if (clickedFaceIndex === undefined) return;

        // クリックされた三角形が、ジオメトリのどの「グループ（面）」に属しているかを探す
        const geometry = targetMesh.geometry;
        let groupIndex = 0;
        
        // Three.js の faceIndex は「頂点3つで1つのFace」なので、インデックス単位に直すため3倍する
        const vertexIndex = clickedFaceIndex * 3;

        for (let i = 0; i < geometry.groups.length; i++) {
            const group = geometry.groups[i];
            if (vertexIndex >= group.start && vertexIndex < (group.start + group.count)) {
                groupIndex = i;
                break;
            }
        }

        //////////////////////////////////////////////////////
        // Reset previous highlight
        //////////////////////////////////////////////////////
        if (selectedGroupIndex !== null && Array.isArray(targetMesh.material)) {
            const prevMat = targetMesh.material[selectedGroupIndex];
            if (prevMat && prevMat.emissive) prevMat.emissive.set(0x000000);
        }

        //////////////////////////////////////////////////////
        // Select & Highlight
        //////////////////////////////////////////////////////
        selectedGroupIndex = groupIndex;

        if (Array.isArray(targetMesh.material)) {
            const currentMat = targetMesh.material[selectedGroupIndex];
            if (currentMat && currentMat.emissive) {
                currentMat.emissive.set(0x333333); // 選択された面をハイライト
                
                // カラーピッカーの色を同期
                const hexColor = "#" + currentMat.color.getHexString();
                colorPicker.value = hexColor;
            }
        }

        //////////////////////////////////////////////////////
        // UI Update
        //////////////////////////////////////////////////////
        faceIdLabel.innerText = selectedGroupIndex;
        meshNameLabel.innerText = `SubFace_${selectedGroupIndex}`;
    }
);

////////////////////////////////////////////////////////////
// Color Change
////////////////////////////////////////////////////////////

colorPicker.addEventListener(
    'input',
    (event) => {
        if (selectedGroupIndex === null || !currentModel) return;

        // currentModelの中にある唯一のメッシュを取得
        const targetMesh = currentModel.children[0];
        if (targetMesh && Array.isArray(targetMesh.material)) {
            const targetMat = targetMesh.material[selectedGroupIndex];
            if (targetMat) {
                targetMat.color.set(event.target.value);
            }
        }
    }
);

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
