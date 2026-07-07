import * as THREE from 'three';

// Geometry options configuration
const geometryOptions: Record<string, { name: string }> = {
    plane: { name: 'Plane' },
    cube: { name: 'Cube' }
};

type GeometryKey = keyof typeof geometryOptions;

interface ShaderConfig {
    vertexUrl: URL;
    fragmentUrl: URL;
    uniforms: Record<string, { value: number; min?: number; max?: number; step?: number }>;
    createGeometry: (geometryKey?: GeometryKey) => { geometry: THREE.BufferGeometry; texture: THREE.Texture };
}

// Shader configuration - loads from the shaders directory
const shaderConfig: Record<string, ShaderConfig> = {
    'height-visualization': {
        vertexUrl: new URL('./height-visualization.vert', import.meta.url),
        fragmentUrl: new URL('./height-visualization.frag', import.meta.url),
        uniforms: {
            uMinHeight: { value: -1.5, min: -5, max: 5, step: 0.1 },
            uMaxHeight: { value: 2.0, min: -5, max: 5, step: 0.1 }
        },
        createGeometry: (geometryKey: GeometryKey = 'plane') => {
            let geometry: THREE.BufferGeometry;
            if (geometryKey === 'cube') {
                geometry = new THREE.BoxGeometry(5, 5, 5);
            } else {
                geometry = new THREE.PlaneGeometry(10, 10, 64, 64);
                geometry.rotateX(-Math.PI / 2);
            }

            // Create a simple gradient texture for height visualization
            const size = 512;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                throw new Error('Failed to get 2d context');
            }

            const gradient = ctx.createLinearGradient(0, 0, size, size);
            gradient.addColorStop(0, 'rgba(10, 50, 100, 1)');
            gradient.addColorStop(0.5, 'rgba(100, 100, 100, 1)');
            gradient.addColorStop(1, 'rgba(200, 200, 200, 1)');

            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, size, size);

            for (let i = 0; i < 5000; i++) {
                const x = Math.random() * size;
                const y = Math.random() * size;
                const brightness = Math.random() * 50 - 25;
                ctx.fillStyle = `rgba(${128 + brightness}, ${128 + brightness}, ${128 + brightness}, 0.1)`;
                ctx.fillRect(x, y, 2, 2);
            }

            const texture = new THREE.CanvasTexture(canvas);
            return { geometry, texture };
        }
    },
    'slope-visualization': {
        vertexUrl: new URL('./slope-visualization.vert', import.meta.url),
        fragmentUrl: new URL('./slope-visualization.frag', import.meta.url),
        uniforms: {
            uMinSlope: { value: 0.0, min: 0, max: 2, step: 0.01 },
            uMaxSlope: { value: 2.0, min: 0, max: 4, step: 0.01 }
        },
        createGeometry: (geometryKey: GeometryKey = 'plane') => {
            let geometry: THREE.BufferGeometry;
            if (geometryKey === 'cube') {
                geometry = new THREE.BoxGeometry(5, 5, 5);
            } else {
                geometry = new THREE.PlaneGeometry(10, 10, 64, 64);
                geometry.rotateX(-Math.PI / 2);
            }

            const size = 64;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                throw new Error('Failed to get 2d context');
            }

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const dx = x - size / 2;
                    const dy = y - size / 2;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    const height = 1.5 - distance * 0.1;

                    const value = Math.floor(Math.max(0, Math.min(1, height)) * 255);
                    ctx.fillStyle = `rgb(${value}, ${value}, ${value})`;
                    ctx.fillRect(x, y, 1, 1);
                }
            }

            const texture = new THREE.CanvasTexture(canvas);
            return { geometry, texture };
        }
    },
    'water-visualization': {
        vertexUrl: new URL('./water-visualization.vert', import.meta.url),
        fragmentUrl: new URL('./water-visualization.frag', import.meta.url),
        uniforms: {
            uMinHeight: { value: -1.5, min: -5, max: 5, step: 0.1 },
            uMaxHeight: { value: 2.0, min: -5, max: 5, step: 0.1 }
        },
        createGeometry: (geometryKey: GeometryKey = 'plane') => {
            let geometry: THREE.BufferGeometry;
            if (geometryKey === 'cube') {
                geometry = new THREE.BoxGeometry(5, 5, 5);
            } else {
                geometry = new THREE.PlaneGeometry(10, 10, 64, 64);
                geometry.rotateX(-Math.PI / 2);
            }

            const size = 512;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                throw new Error('Failed to get 2d context');
            }

            ctx.fillStyle = '#0a3d8c';
            ctx.fillRect(0, 0, size, size);

            for (let y = 0; y < size; y++) {
                ctx.fillStyle = `rgba(10, 80, 150, ${0.3 + Math.random() * 0.2})`;
                ctx.fillRect(0, y, size, 1);
            }

            const texture = new THREE.CanvasTexture(canvas);
            return { geometry, texture };
        }
    },
    'animated-noise': {
        vertexUrl: new URL('./animated-noise.vert', import.meta.url),
        fragmentUrl: new URL('./animated-noise.frag', import.meta.url),
        uniforms: {
            uTime: { value: 0.0 }, // Will be updated in animate loop
            uSpeed: { value: 1.0, min: 0.1, max: 5, step: 0.1 },
            uScale: { value: 3.0, min: 0.5, max: 10, step: 0.1 },
            uAmplitude: { value: 1.0, min: 0.1, max: 2, step: 0.1 }
        },
        createGeometry: (geometryKey: GeometryKey = 'plane') => {
            let geometry: THREE.BufferGeometry;
            if (geometryKey === 'cube') {
                geometry = new THREE.BoxGeometry(5, 5, 5);
            } else {
                geometry = new THREE.PlaneGeometry(10, 10, 64, 64);
                geometry.rotateX(-Math.PI / 2);
            }

            // Create a simple noise texture as base
            const size = 256;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                throw new Error('Failed to get 2d context');
            }

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const value = Math.floor(Math.random() * 255);
                    ctx.fillStyle = `rgb(${value}, ${value}, ${value})`;
                    ctx.fillRect(x, y, 1, 1);
                }
            }

            const texture = new THREE.CanvasTexture(canvas);
            return { geometry, texture };
        }
    }
};

// State
let scene: THREE.Scene;
let camera: THREE.OrthographicCamera;
let renderer: THREE.WebGLRenderer;
let mesh: THREE.Mesh;
let texture: THREE.Texture;
let shaderMaterial: THREE.ShaderMaterial;
type UniformControl = { name: string | undefined; input: Element };
const uniformsControls: UniformControl[] = [];

// DOM elements
const shaderSelect = document.getElementById('shader-select');
const geometrySelect = document.getElementById('geometry-select');
const shaderInfo = {
    vertex: document.getElementById('vertex-shader'),
    fragment: document.getElementById('fragment-shader')
};
const controlsPanel = document.getElementById('controls-panel');
const canvasContainer = document.getElementById('canvas-container');
const loader = document.getElementById('loader');

// Initialize
async function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
    camera.position.set(0, 7, 0);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(256, 256);
    renderer.setPixelRatio(window.devicePixelRatio);
    if (canvasContainer) {
        canvasContainer.appendChild(renderer.domElement);
    }

    await loadShaders();
    if (loader) {
        loader.style.display = 'none';
    }
    await selectShader('height-visualization', 'plane');

    animate();

    window.addEventListener('resize', onWindowResize);
}

async function loadShaders() {
    if (!shaderSelect || !geometrySelect) {
        return;
    }

    shaderSelect.innerHTML = '';

    const keys = Object.keys(shaderConfig);
    for (const key of keys) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = key.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        shaderSelect.appendChild(option);
    }

    // Populate geometry options
    const geometryKeys = Object.keys(geometryOptions) as GeometryKey[];
    for (const key of geometryKeys) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = geometryOptions[key].name;
        geometrySelect.appendChild(option);
    }

    // Enable geometry select after shader is selected
    (geometrySelect as HTMLSelectElement).disabled = true;
}

async function selectShader(key: string, _geometryKey: GeometryKey = 'plane') {
    const config = shaderConfig[key as keyof typeof shaderConfig];

    // Enable geometry select when a shader is selected
    if (geometrySelect) {
        (geometrySelect as HTMLSelectElement).disabled = false;
    }

    if (shaderInfo.vertex) {
        shaderInfo.vertex.textContent = `Vertex: ${config.vertexUrl.pathname.split('/').pop()}`;
    }
    if (shaderInfo.fragment) {
        shaderInfo.fragment.textContent = `Fragment: ${config.vertexUrl.pathname.split('/').pop()}`;
    }

    const { geometry, texture: newTexture } = config.createGeometry(_geometryKey);

    if (mesh) {
        mesh.geometry.dispose();
        if (texture) texture.dispose();
        scene.remove(mesh);
    }

    mesh = new THREE.Mesh(geometry, shaderMaterial || new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
    scene.add(mesh);

    const [vertexShader, fragmentShader] = await Promise.all([
        fetch(config.vertexUrl).then(res => res.text()),
        fetch(config.fragmentUrl).then(res => res.text())
    ]);

    // Create uniforms with proper typing including optional uHeightMap
    const uniforms: Record<string, { value: any }> = { ...config.uniforms };

    if (newTexture) {
        uniforms.uHeightMap = { value: newTexture };
    }

    if (shaderMaterial) {
        shaderMaterial.dispose();
    }

    shaderMaterial = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        side: THREE.DoubleSide
    });

    mesh.material = shaderMaterial;
    texture = newTexture;

    createControlsPanel(key);

    uniformsControls.forEach(control => {
        control.input.removeEventListener('input', onUniformChange);
    });

    uniformsControls.length = 0;
    const inputs = controlsPanel?.querySelectorAll('input[type="range"]');
    if (inputs) {
        inputs.forEach(input => {
            input.addEventListener('input', onUniformChange);
            const control = { name: (input as HTMLElement).dataset.uniform, input };
            if (control.name) {
                uniformsControls.push(control);
            }
        });
    }
}

function createControlsPanel(key: string) {
    const config = shaderConfig[key as keyof typeof shaderConfig];

    if (!controlsPanel) {
        return;
    }

    controlsPanel.innerHTML = '';
    controlsPanel.style.display = 'block';

    for (const [name, uniform] of Object.entries(config.uniforms)) {
        const controlGroup = document.createElement('div');
        controlGroup.className = 'control-group';

        const label = document.createElement('label');
        label.textContent = name.replace('u', '').replace(/[A-Z]/g, l => ' ' + l.toLowerCase());
        controlGroup.appendChild(label);

        const input = document.createElement('input');
        input.type = 'range';
        if ('min' in uniform && uniform.min !== undefined) {
            input.min = uniform.min.toString();
        }
        if ('max' in uniform && uniform.max !== undefined) {
            input.max = uniform.max.toString();
        }
        if ('step' in uniform && uniform.step !== undefined) {
            input.step = uniform.step.toString();
        }
        input.value = uniform.value.toString();

        const valueDisplay = document.createElement('span');
        valueDisplay.textContent = uniform.value.toFixed(2);

        input.addEventListener('input', () => {
            valueDisplay.textContent = parseFloat(input.value).toFixed(2);
        });

        controlGroup.appendChild(input);
        controlGroup.appendChild(valueDisplay);
        controlsPanel.appendChild(controlGroup);
    }
}

function onUniformChange(event: Event) {
    const target = event.target as HTMLElement;
    const uniformName = (target as HTMLElement).dataset.uniform;
    if (!uniformName) {
        return;
    }
    const value = parseFloat((target as HTMLInputElement).value);

    if (shaderMaterial && shaderMaterial.uniforms[uniformName]) {
        shaderMaterial.uniforms[uniformName].value = value;
    }
}

function onWindowResize(): void {
    // Canvas has fixed 512x512 size, so no resize handling needed
    // The renderer just renders to the fixed canvas size
}

function animate(): void {
    requestAnimationFrame(animate);

    // Update time for shaders that support animation
    if (shaderMaterial && shaderMaterial.uniforms.uTime) {
        const time = performance.now() * 0.001;
        shaderMaterial.uniforms.uTime.value = time;
    }

    renderer.render(scene, camera);
}

init().catch(error => {
    if (loader) {
        loader.style.display = 'none';
    }
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.innerHTML = `<strong>Error loading shaders:</strong><br>${error.message}`;
    document.body.appendChild(errorDiv);
    console.error('Init error:', error);
});

if (shaderSelect && geometrySelect) {
    shaderSelect.addEventListener('change', (e: Event) => {
        const target = e.target as HTMLSelectElement;
        selectShader(target.value, 'plane' as GeometryKey);
    });

    geometrySelect.addEventListener('change', () => {
        if (shaderSelect && geometrySelect) {
            const geometryKey = (geometrySelect as HTMLSelectElement).value;
            selectShader((shaderSelect as HTMLSelectElement).value, geometryKey as GeometryKey);
        }
    });
}