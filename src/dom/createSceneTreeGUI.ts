import * as THREE from 'three';
import GUI from 'lil-gui';
import { renderToConsole } from '../utils/debugUtils';

/**
 * Configuration for material preview rendering
 */
export interface MaterialPreviewOptions {
  width?: number;
  height?: number;
}

/**
 * Render a material to a data URL for display in lil-gui or elsewhere
 */
export function renderMaterialToDataURL(
  material: THREE.Material,
  options: MaterialPreviewOptions = {}
): string {
  const { width = 128, height = 128 } = options;

  try {
    // Create a scene and renderer for off-screen rendering
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const renderer = new THREE.WebGLRenderer({ 
      preserveDrawingBuffer: true,
      alpha: true
    });

    // Configure renderer
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    // Create a quad that covers the screen
    const quadGeometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(quadGeometry, material);

    scene.add(mesh);

    // Render the scene
    renderer.render(scene, camera);

    // Get the data URL from the renderer
    const dataURL = renderer.domElement.toDataURL('image/png', 0.9);
    
    // Clean up
    renderer.dispose();
    scene.remove(mesh);

    return dataURL;
  } catch (e) {
    console.warn('Failed to render material:', e);
    return '';
  }
}

/**
 * Check if an object is a Three.js Material
 */
function isMaterial(obj: any): obj is THREE.Material {
  return obj && obj.isMaterial;
}

/**
 * Add material preview image to GUI folder
 */
function addMaterialPreview(
  folder: any,
  material: THREE.Material,
  options: MaterialPreviewOptions = {}
): void {
    // Add to GUI using nativeElement (lil-gui API)
    folder.add({
      'Do Stuff': () => { 
        renderToConsole(material, options);
      }
    }, 'Do Stuff');
}

/**
 * Configuration for the Scene Graph GUI
 */
export interface SceneTreeGUIOptions {
  /** Material preview rendering options */
  materialPreview?: MaterialPreviewOptions;
}

/**
 * Create a lil-gui overlay that displays scene graph information
 * and allows property editing for Three.js objects
 */
export function createSceneTreeGUI(scene: THREE.Scene, options: SceneTreeGUIOptions = {}): {
  update: () => void;
  destroy: () => void;
} {
  const gui = new GUI({ title: 'Scene Graph Inspector' });
  
  // Store references to GUI folders by node
  const nodeFolders = new Map<THREE.Object3D, any>();
  
  // Store root folders (nodes without parents in the GUI)
  const rootFolders = new Map<string, any>();

  // Property types to exclude from display
  const excludedProperties = new Set([
    'uuid', 'id', 'parent', 'children', 'geometry',
    '_modelViewMatrix', '_normalMatrix', 'matrix', 'matrixWorld'
  ]);

  /**
   * Get the path of a node as a hierarchy array
   */
  const getNodePath = (node: THREE.Object3D): THREE.Object3D[] => {
    const path: THREE.Object3D[] = [];
    let current: THREE.Object3D | null = node;
    while (current && current.parent) {
      path.unshift(current);
      current = current.parent;
    }
    return path;
  };

  /**
   * Get or create a folder for a node based on its hierarchy path
   */
  const getNodeFolder = (node: THREE.Object3D, guiInstance: any): any => {
    // Check if we already created this folder
    if (nodeFolders.has(node)) {
      return nodeFolders.get(node)!;
    }

    // Get the full path from root to this node
    const path = getNodePath(node);
    
    // Traverse the path and create folders
    let currentFolder: any = guiInstance;
    
    for (const nodeInPath of path) {
      // Check if we already have a folder for this node
      if (nodeFolders.has(nodeInPath)) {
        currentFolder = nodeFolders.get(nodeInPath)!;
      } else {
        // Create a new folder for this node
        const folderName = `${nodeInPath.type} - ${nodeInPath.name || 'unnamed'}`;
        const newFolder = currentFolder.addFolder(folderName);
        newFolder.close(); // Start with folders collapsed
        nodeFolders.set(nodeInPath, newFolder);
        currentFolder = newFolder;
      }
    }

    return currentFolder;
  };

  /**
   * Add properties to the appropriate folder based on node hierarchy
   */
  const addNodeProperties = (node: THREE.Object3D, guiInstance: any, materialOptions?: MaterialPreviewOptions): void => {
    const folder = getNodeFolder(node, guiInstance);

    // Mark that we've visited this node's properties
    if (!nodeFolders.has(node)) {
      nodeFolders.set(node, folder);
    }

    const visited = new Set<string>();
    
    // Collect own properties
    Object.getOwnPropertyNames(node).forEach(prop => {
      if (!excludedProperties.has(prop) && !visited.has(prop)) {
        visited.add(prop);
        try {
          const value = (node as any)[prop];
          
          if (value === undefined || value === null) return;
          
          // Skip functions and special properties
          if (typeof value === 'function' || 
              prop.startsWith('_') || 
              prop.startsWith('on')) {
            return;
          }
          
          // Skip Three.js specific objects
          if (prop === 'geometry') return;
          
          // Add material preview if this is a material
          if (isMaterial(value)) {
            const matFolder = folder.addFolder(`${prop} (${value.type})`);
            addMaterialPreview(matFolder, value, materialOptions);
            return;
          }
          
          // Handle different types
          if (typeof value === 'number') {
            folder.add({ [prop]: value }, prop, -1000, 1000);
          } else if (typeof value === 'string') {
            folder.add({ [prop]: value }, prop);
          } else if (typeof value === 'boolean') {
            folder.add({ [prop]: value }, prop);
          } else if (value.isColor) {
            const color = value.clone();
            folder.add({ [prop]: `#${color.getHexString()}` }, prop);
          } else if (value.isVector3) {
            folder.add(value.clone(), 'x', -1000, 1000).name(`${prop}.x`);
            folder.add(value.clone(), 'y', -1000, 1000).name(`${prop}.y`);
            folder.add(value.clone(), 'z', -1000, 1000).name(`${prop}.z`);
          } else if (value.isVector2) {
            folder.add(value.clone(), 'x', -1000, 1000).name(`${prop}.x`);
            folder.add(value.clone(), 'y', -1000, 1000).name(`${prop}.y`);
          } else if (value.isVector4) {
            folder.add(value.clone(), 'x', -1000, 1000).name(`${prop}.x`);
            folder.add(value.clone(), 'y', -1000, 1000).name(`${prop}.y`);
            folder.add(value.clone(), 'z', -1000, 1000).name(`${prop}.z`);
            folder.add(value.clone(), 'w', -1000, 1000).name(`${prop}.w`);
          } else if (typeof value === 'object') {
            // Show object properties
            const subFolder = folder.addFolder(`${prop} (object)`);
            Object.keys(value).forEach(subProp => {
              const subValue = (value as any)[subProp];
                if (typeof subValue === 'number') {
                  subFolder.add({ [subProp]: subValue }, subProp);
                } else if (typeof subValue === 'string') {
                  subFolder.add({ [subProp]: subValue }, subProp);
                } else if (typeof subValue === 'boolean') {
                  subFolder.add({ [subProp]: subValue }, subProp);
                }
            });
          }
        } catch (e) {
          // Skip properties that can't be accessed
        }
      }
    });
  };

  /**
   * Recursively process children and create their folders
   */
  const processChildren = (parent: THREE.Object3D, parentFolder: any, materialOptions?: MaterialPreviewOptions): void => {
    parent.children.forEach(child => {
      // Add properties for this child node
      addNodeProperties(child, parentFolder, materialOptions);
      
      // Recursively process children if they exist
      if (child.children.length > 0) {
        const childFolder = nodeFolders.get(child);
        if (childFolder) {
          processChildren(child, childFolder, materialOptions);
        }
      }
    });
  };

  /**
   * Build the scene tree with proper folder hierarchy
   */
  const buildSceneTree = (materialOptions?: MaterialPreviewOptions): void => {
    // Remove all existing folders by destroying and recreating
    gui.destroy();
    
    const newGui = new GUI({ title: 'Scene Graph Inspector' });
    
    // Clear old folder references
    nodeFolders.clear();
    rootFolders.clear();
    
    // Collect all scene children (roots)
    const roots: THREE.Object3D[] = [];
    
    // First pass: identify root nodes (children of the main scene)
    scene.children.forEach(child => {
      roots.push(child);
      // Add properties for this root node
      addNodeProperties(child, newGui, materialOptions);
      
      // Recursively process children
      processChildren(child, nodeFolders.get(child) || newGui, materialOptions);
    });
  };

  /**
   * Update all GUI controllers with current property values
   */
  const update = () => {
    // No updates needed for static scene structure
  };

  /**
   * Destroy the GUI and clean up resources
   */
  const destroy = () => {
    if (gui) {
      gui.destroy();
    }
    nodeFolders.clear();
  };

  // Build initial scene tree
  buildSceneTree(options.materialPreview);

  return { update, destroy };
}