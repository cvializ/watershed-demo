import * as THREE from "three";

const vertexShaderModules = import.meta.glob("../src/shaders/*.vert", {
  query: "?raw",
  import: "default",
});
const fragmentShaderModules = import.meta.glob("../src/shaders/*.frag", {
  query: "?raw",
  import: "default",
});

const getBasename = (path: string): string => {
  const pathWithoutExtensionMatches = /(?<basename>.+)\..+$/.exec(path);
  if (!pathWithoutExtensionMatches) {
    throw new Error(`could not find basename for ${path}`);
  }
  const { basename } = pathWithoutExtensionMatches.groups!;

  return basename;
};

const promisesObjectToArray = async <T>(
  obj: Record<string, () => Promise<T>>,
): Promise<Array<[string, T]>> => {
  const entries = Object.entries(obj);
  const resolvedValues = await Promise.all(Object.values(obj).map((fn) => fn()));
  return entries.map(([modulePath], index) => [modulePath, resolvedValues[index]]);
};

const vertexShaders = await promisesObjectToArray<string>(vertexShaderModules);
const fragmentShaders = await promisesObjectToArray<string>(fragmentShaderModules);

const createVertexShaderTestGeometry = () => {
  const group = new THREE.Group();

  vertexShaders.forEach(([_path, shader]) => {
    const material = new THREE.ShaderMaterial({
      vertexShader: shader,
    });

    const geometry = new THREE.PlaneGeometry(1, 1);
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
  });

  return group;
};

const scene = new THREE.Scene();

const createFragmentShaderTestGeometry = () => {
  const group = new THREE.Group();

  fragmentShaders.forEach(([modulePath, shader]) => {
    const vertexShaderEntry = vertexShaders.find((p) => p[0].startsWith(getBasename(modulePath)));
    if (!vertexShaderEntry) {
      throw new Error(`Could not find vertex shader for ${modulePath}`);
    }
    const material = new THREE.ShaderMaterial({
      vertexShader: vertexShaderEntry[1],
      fragmentShader: shader,
    });

    const geometry = new THREE.PlaneGeometry(1, 1);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
  });

  return group;
};

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const vertexShaderTestGeometry = createVertexShaderTestGeometry();
scene.add(vertexShaderTestGeometry);

const fragmentShaderTestGeometry = createFragmentShaderTestGeometry();
scene.add(fragmentShaderTestGeometry);

const camera = new THREE.OrthographicCamera();
renderer.render(scene, camera);
