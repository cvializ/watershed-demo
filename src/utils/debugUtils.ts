/**
 * Console Image Renderer Utility
 * 
 * Helper function that renders a ThreeJS material or shader into the browser console.
 * Uses HTML5 Canvas to render the image and logs it using console.log with
 * CSS styling for proper display.
 */
import * as THREE from 'three';

const isSafari = navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome');

/**
 * Configuration options for rendering to console
 */
export interface ConsoleRenderOptions {
  width?: number;
  height?: number;
  format?: string;
  quality?: number;
  showSize?: boolean;
}

/**
 * Renders a ThreeJS material into the browser console
 * @param material - Three.js Material object to render
 * @param options - Configuration options for the render
 * @returns Promise that resolves when rendering is complete
 */
export async function renderToConsole(
  material: THREE.Material,
  options: ConsoleRenderOptions = {}
): Promise<void> {
  const {
    width = 256,
    height = 256,
    format = 'image/png',
    quality = 0.9,
  } = options;

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
    const dataURL = renderer.domElement.toDataURL(format, quality);
    
    // Clean up
    renderer.dispose();
    scene.remove(mesh);

    // Create image element from the data URL
    const img = new Image();
    img.onload = () => {
      // Log the image to console with styling
      const fontSize = height;
      
      // Create CSS for console image display
      const styles = [
        `padding: 4px 8px`,
        `border-radius: 4px`,
        `background-image: url(${dataURL})`,
        `background-size: contain`,
        `background-repeat: no-repeat`,
        `background-position: center`,
        `color: transparent`,
        `min-width: ${width}px`,
        `min-height: ${height}px`,
        `font-size: ${fontSize}px`,
        `display: inline-block`,
        `line-height: ${height}px`
      ].join('; ');
      
      if (isSafari) {
        console.log(img);
      } else {
        console.log(`%cxxx`, styles);
      }
    };

    img.onerror = (error) => {
      console.error('Failed to render image to console:', error);
    };

    img.src = dataURL;

  } catch (error) {
    console.error('Error rendering to console:', error);
    throw error;
  }
}

/**
 * Alternative function that returns the rendered data URL
 * @param material - Three.js Material object to render
 * @param options - Configuration options for the render
 * @returns Promise that resolves with the data URL
 */
export async function getRenderedDataURL(
  material: THREE.Material,
  options: ConsoleRenderOptions = {}
): Promise<string> {
  const { width = 256, height = 256, format = 'image/png', quality = 0.9 } = options;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const renderer = new THREE.WebGLRenderer({ 
    preserveDrawingBuffer: true,
    alpha: true
  });

  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const quadGeometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(quadGeometry, material);

  scene.add(mesh);
  renderer.render(scene, camera);

  const dataURL = renderer.domElement.toDataURL(format, quality);
  
  renderer.dispose();
  scene.remove(mesh);

  return dataURL;
}

/**
 * Logs multiple materials to console in a grid
 * @param items - Array of Three.js Materials with names
 * @param options - Configuration options for the render
 */
export async function renderMultipleToConsole(
  items: Array<{ name: string; material: THREE.Material }>,
  options: ConsoleRenderOptions = {}
): Promise<void> {
  const { width = 128, height = 128 } = options;

  console.log('%c--- Multiple Material Preview ---', 'color: #00ff88; font-weight: bold; font-size: 14px;');

  for (const item of items) {
    console.log(`%c${item.name}`, 'font-weight: bold; font-size: 12px; color: #666;');
    try {
      await renderToConsole(item.material, { width, height, ...options });
    } catch (error) {
      console.error(`Failed to render ${item.name}:`, error);
    }
  }

  console.log('%c---------------------------------', 'color: #00ff88; font-weight: bold; font-size: 14px;');
}

/**
 * Example usage with an inline static shader
 * 
 * This function demonstrates how to use the console image renderer
 * with an inline shader that generates a colorful gradient pattern.
 */
export async function exampleWithInlineShader(): Promise<void> {
  // Define vertex shader (simple pass-through)
  const vertexShader = `
    void main() {
      gl_Position = vec4(position, 1.0);
    }
  `;

  // Define fragment shader (generates a colorful radial gradient)
  const fragmentShader = `
    uniform float uTime;
    uniform vec2 uResolution;

    void main() {
      // Normalize pixel coordinates (from 0 to 1)
      vec2 uv = gl_FragCoord.xy / uResolution.xy;
      
      // Center coordinates
      vec2 center = uv - 0.5;
      float dist = length(center);
      
      // Create colorful radial pattern
      float color = sin(dist * 10.0 + uTime) * 0.5 + 0.5;
      float color2 = cos(dist * 8.0 + uTime * 0.8) * 0.5 + 0.5;
      float color3 = sin((uv.x + uv.y) * 5.0 + uTime * 0.5) * 0.5 + 0.5;
      
      gl_FragColor = vec4(color, color2, color3, 1.0);
    }
  `;

  // Create the shader material
  const shaderMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 },
      uResolution: { value: new THREE.Vector2(256, 256) }
    },
    vertexShader,
    fragmentShader
  });

  // Render to console (note: need to set uniforms before rendering)
  shaderMaterial.uniforms.uTime.value = 1.0;
  
  console.log('%c--- Inline Shader Example ---', 'color: #00ff88; font-weight: bold; font-size: 14px;');
  await renderToConsole(shaderMaterial, {
    width: 256,
    height: 256,
    showSize: true
  });
}

/**
 * Quick example: Render a simple colorful shader to console
 * 
 * Usage:
 * ```typescript
 * import { exampleInlineShader } from './utils/console-image-renderer';
 * 
 * // Just call it to see the result in console
 * exampleInlineShader();
 * ```
 */
export async function exampleInlineShader(): Promise<void> {
  const vertexShader = `
    void main() {
      gl_Position = vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform vec2 uResolution;

    void main() {
      vec2 uv = gl_FragCoord.xy / uResolution.xy;
      
      // Create a checkerboard-like pattern with colors
      float x = floor(uv.x * 4.0);
      float y = floor(uv.y * 4.0);
      float checker = mod(x + y, 2.0);
      
      // Add some color variation
      float r = sin(uv.x * 10.0) * 0.5 + 0.5;
      float g = sin(uv.y * 10.0) * 0.5 + 0.5;
      float b = cos((uv.x + uv.y) * 5.0) * 0.5 + 0.5;
      
      vec3 color = mix(vec3(r, 0.2, 0.8), vec3(0.2, g, b), checker);
      
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const shaderMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uResolution: { value: new THREE.Vector2(256, 256) }
    },
    vertexShader,
    fragmentShader
  });

  console.log('%c==============================', 'color: #00ff88; font-weight: bold;');
  console.log('%cThree.js Shader in Console', 'color: #00ff88; font-weight: bold; font-size: 16px;');
  console.log('%c------------------------------', 'color: #00ff88; font-weight: bold;');
  
  await renderToConsole(shaderMaterial, {
    width: 256,
    height: 256,
    showSize: true
  });
  
  console.log('%c==============================', 'color: #00ff88; font-weight: bold;');
}

/**
 * Example: Render all debug materials to console
 * 
 * Usage:
 * ```typescript
 * import { exampleDebugMaterials } from './utils/console-image-renderer';
 * 
 * // Just call it to see the results in console
 * exampleDebugMaterials();
 * ```
 */
export async function exampleDebugMaterials(): Promise<void> {
  console.log('%c--- Debug Materials Preview ---', 'color: #00ff88; font-weight: bold; font-size: 14px;');
  console.log('%c(Debug materials not yet implemented)', 'color: #666; font-style: italic;');
}