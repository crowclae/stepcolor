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

let selectedMesh = null;

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

window.addEventListener(
    'pointerdown',
    (event) => {

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
        // Reset previous
        //////////////////////////////////////////////////////

        if (selectedMesh) {

            if (
                selectedMesh &&
                selectedMesh.material &&
                selectedMesh.material.emissive
            ) {
                selectedMesh.material.emissive.set(0x000000);
            }
        }

        //////////////////////////////////////////////////////
        // Select
        //////////////////////////////////////////////////////

        selectedMesh =
            intersects[0].object;

        //////////////////////////////////////////////////////
        // Highlight
        //////////////////////////////////////////////////////

        if (
            selectedMesh.material &&
            selectedMesh.material.emissive
        ) {
            selectedMesh.material.emissive.set(0x333333);
        }

        //////////////////////////////////////////////////////
        // UI Update
        //////////////////////////////////////////////////////

        faceIdLabel.innerText =
            selectedMesh.userData.faceId;

        meshNameLabel.innerText =
            selectedMesh.userData.name;

        console.log(
            'Selected:',
            selectedMesh.userData
        );
    }
);

////////////////////////////////////////////////////////////
// Color Change
////////////////////////////////////////////////////////////

colorPicker.addEventListener(
    'input',
    (event) => {

        if (!selectedMesh) return;

        selectedMesh.material.color.set(
            event.target.value
        );
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
