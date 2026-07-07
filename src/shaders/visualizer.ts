
import * as THREE from 'three';

// Shader configuration - loads from the shaders directory
const shaderConfig = {
    'height-visualization': {
        vertexUrl: new URL('./height-visualization.vert', import.meta.url),
        fragmentUrl: new URL('./height-visualization.frag', import.meta.url),
        uniforms: {
            uMinHeight: { value: -1.5, min: -5, max: 5, step: 0.1 },
            uMaxHeight: { value: 2.0, min: -5, max: 5, step: 0.1 }
        },
        createGeometry: () => {
            const geometry = new THREE.PlaneGeometry(10, 10, 64, 64);
            geometry.rotateX(-Math.PI / 2);

            // Create a simple gradient texture for height visualization
            const size = 512;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');

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
        createGeometry: () => {
            const geometry = new THREE.PlaneGeometry(10, 10, 64, 64);
            geometry.rotateX(-Math.PI / 2);

            const size = 64;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');

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
        createGeometry: () => {
            const geometry = new THREE.PlaneGeometry(10, 10, 64, 64);
            geometry.rotateX(-Math.PI / 2);

            const size = 512;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#0a3d8c';
            ctx.fillRect(0, 0, size, size);

            for (let y = 0; y < size; y++) {
                const noise = Math.sin(y * 0.05) * 20;
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
        createGeometry: () => {
            const geometry = new THREE.PlaneGeometry(10, 10, 64, 64);
            geometry.rotateX(-Math.PI / 2);

            // Create a simple noise texture as base
            const size = 256;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const noise = Math.random();
                    const value = Math.floor(noise * 255);
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
let currentShaderKey = 'height-visualization';
let scene, camera, renderer, controls;
let mesh;
let texture;
let shaderMaterial;
const uniformsControls = [];

// DOM elements
const shaderSelect = document.getElementById('shader-select');
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
    canvasContainer.appendChild(renderer.domElement);

    await loadShaders();
    loader.style.display = 'none';
    await selectShader('height-visualization');

    animate();

    window.addEventListener('resize', onWindowResize);
}

async function loadShaders() {
    shaderSelect.innerHTML = '';

    const keys = Object.keys(shaderConfig);
    for (const key of keys) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = key.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        shaderSelect.appendChild(option);
    }
}

async function selectShader(key) {
    currentShaderKey = key;
    const config = shaderConfig[key];

    shaderInfo.vertex.textContent = `Vertex: ${config.vertexUrl.pathname.split('/').pop()}`;
    shaderInfo.fragment.textContent = `Fragment: ${config.fragmentUrl.pathname.split('/').pop()}`;

    const { geometry, texture: newTexture } = config.createGeometry();

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

    const uniforms = { ...config.uniforms };

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
    const inputs = controlsPanel.querySelectorAll('input[type="range"]');
    inputs.forEach(input => {
        input.addEventListener('input', onUniformChange);
        uniformsControls.push({ name: input.dataset.uniform, input });
    });
}

function createControlsPanel(key) {
    const config = shaderConfig[key];

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
        input.min = uniform.min;
        input.max = uniform.max;
        input.step = uniform.step;
        input.value = uniform.value;
        input.dataset.uniform = name;

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

function onUniformChange(event) {
    const uniformName = event.target.dataset.uniform;
    const value = parseFloat(event.target.value);

    if (shaderMaterial && shaderMaterial.uniforms[uniformName]) {
        shaderMaterial.uniforms[uniformName].value = value;
    }
}

function onWindowResize() {
    // Canvas has fixed 512x512 size, so no resize handling needed
    // The renderer just renders to the fixed canvas size
}

function animate() {
    requestAnimationFrame(animate);

    // Update time for shaders that support animation
    if (shaderMaterial && shaderMaterial.uniforms.uTime) {
        const time = performance.now() * 0.001;
        shaderMaterial.uniforms.uTime.value = time;
    }

    renderer.render(scene, camera);
}

init().catch(error => {
    loader.style.display = 'none';
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.innerHTML = `<strong>Error loading shaders:</strong><br>${error.message}`;
    document.body.appendChild(errorDiv);
    console.error('Init error:', error);
});

shaderSelect.addEventListener('change', (e) => {
    selectShader(e.target.value);
});