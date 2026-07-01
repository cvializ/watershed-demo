import * as THREE from 'three';

const vertexShaderModules = import.meta.glob('../src/shaders/*.vert', { as: 'raw' });
const fragmentShaderModules = import.meta.glob('../src/shaders/*.frag', { as: 'raw' });

const getBasename = (path) => {
    const pathWithoutExtensionMatches = /(?<basename>.+)\..+$/.exec(path);
    if (!pathWithoutExtensionMatches) {
        throw new Error(`could not find basename for ${path}`);
    }
    const { basename } = pathWithoutExtensionMatches.groups;
    
    return basename;
}

async function promisesObjectToArray<T>(
    obj: Record<string, Promise<T>>
): Promise<Array<[string, T]>> {
    const entries = Object.entries(obj);
    const resolvedValues = await Promise.all(Object.values(obj).map(value => value()));
    return entries.map(([key], index) => [key, resolvedValues[index]]);
}                   

const vertexShaders = await promisesObjectToArray(vertexShaderModules);
const fragmentShaders = await promisesObjectToArray(fragmentShaderModules);

function createVertexShaderTestGeometry() {
    const group = new THREE.Group();

    vertexShaders.forEach(([path, shader]) => {
        const material = new THREE.ShaderMaterial({
            vertexShader: shader,
        });

        const geometry = new THREE.PlaneGeometry(1, 1);
        const mesh = new THREE.Mesh(geometry, material);
        group.add(mesh);
    });

    return group;
}


function createFragmentShaderTestGeometry() {
    const group = new THREE.Group();

    fragmentShaders.forEach(([key, shader]) => {
        const vertexShaderEntry = vertexShaders.find(p => p[0].startsWith(getBasename(key)));
        console.log(vertexShaderEntry);
        const material = new THREE.ShaderMaterial({
            vertexShader: vertexShaderEntry[1],
            fragmentShader: shader,
        });

        const geometry = new THREE.PlaneGeometry(1, 1);
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
    });

    return group;
}

// Expose Three.js to window for external access (e.g., shader tests)
(window as any).THREE = THREE;

const scene = new THREE.Scene();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const vertexShaderTestGeometry = createVertexShaderTestGeometry();
scene.add(vertexShaderTestGeometry);

const fragmentShaderTestGeometry = createFragmentShaderTestGeometry();
scene.add(fragmentShaderTestGeometry);

const camera = new THREE.OrthographicCamera();
renderer.render(scene, camera);