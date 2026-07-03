import * as THREE from 'three';
import GUI from 'lil-gui';

/**
 * Create a lil-gui overlay that displays scene graph information
 * and allows property editing for Three.js objects
 */
export function createSceneTreeGUI(scene: THREE.Scene): {
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
    'uuid', 'id', 'parent', 'children', 'geometry', 'material',
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
        nodeFolders.set(nodeInPath, newFolder);
        currentFolder = newFolder;
      }
    }

    return currentFolder;
  };

  /**
   * Add properties to the appropriate folder based on node hierarchy
   */
  const addNodeProperties = (node: THREE.Object3D, guiInstance: any): void => {
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
          if (prop === 'geometry' || prop === 'material') return;
          
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
  const processChildren = (parent: THREE.Object3D, parentFolder: any): void => {
    parent.children.forEach(child => {
      // Add properties for this child node
      addNodeProperties(child, parentFolder);
      
      // Recursively process children if they exist
      if (child.children.length > 0) {
        const childFolder = nodeFolders.get(child);
        if (childFolder) {
          processChildren(child, childFolder);
        }
      }
    });
  };

  /**
   * Build the scene tree with proper folder hierarchy
   */
  const buildSceneTree = () => {
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
      addNodeProperties(child, newGui);
      
      // Recursively process children
      processChildren(child, nodeFolders.get(child) || newGui);
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
  buildSceneTree();

  return { update, destroy };
}