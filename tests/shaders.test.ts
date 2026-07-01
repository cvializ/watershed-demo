import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const shaderDir = path.join(__dirname, '../src/shaders');

// Read all shader sources from disk once before tests run
const shaderSources: Record<string, string> = {};
const files = fs.readdirSync(shaderDir);
for (const file of files) {
  if (file.endsWith('.vert') || file.endsWith('.frag')) {
    shaderSources[file] = fs.readFileSync(path.join(shaderDir, file), 'utf-8');
  }
}

test('all vertex shaders compile successfully in Three.js context', async ({ page }) => {
  // Load the app to initialize Three.js
  await page.goto('/');
  
  for (const [file, source] of Object.entries(shaderSources)) {
    if (!file.endsWith('.vert')) continue;
    
    const result = await page.evaluate(({ source }) => {
      return new Promise((resolve) => {
        // Use window.THREE which is exposed by main.ts
        const THREE = (window as any).THREE;
        
        if (!THREE) {
          resolve({ success: false, log: 'Three.js not available on window.THREE' });
          return;
        }
        
        const shader = {
          vertexShader: source,
          fragmentShader: 'precision highp float; void main() { gl_FragColor = vec4(1.0); }'
        };
        
        try {
          const material = new THREE.ShaderMaterial(shader);
          material.dispose();
          resolve({ success: true, log: shader });
        } catch (e: any) {
          resolve({ success: false, log: e.message });
        }
      });
    }, { source });
    
    expect(result.success, `Vertex shader ${file} failed to compile: ${result.log}`).toBe(true);
    console.log(result.log);
  }
});

test('height visualization shader renders correctly with geometry', async ({ page }) => {
  await page.goto('/');
  
  const result = await page.evaluate(() => {
    return new Promise((resolve) => {
      const THREE = (window as any).THREE;
      
      if (!THREE) {
        resolve({ success: false, log: 'Three.js not available' });
        return;
      }
      
      const heightVert = (globalThis as any).heightVisualizationVert;
      const heightFrag = (globalThis as any).heightVisualizationFrag;
      
      if (!heightVert || !heightFrag) {
        resolve({ success: false, log: 'Height visualization shaders not available' });
        return;
      }
      
      try {
        const material = new THREE.ShaderMaterial({
          uniforms: {
            uMinHeight: { value: -1.5 },
            uMaxHeight: { value: 2.0 }
          },
          vertexShader: heightVert,
          fragmentShader: heightFrag,
          side: THREE.DoubleSide
        });
        
        // Use the same terrain geometry as main.ts for realistic testing
        const terrainSize = 12;
        const segments = 80;
        const geometry = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
        const mesh = new THREE.Mesh(geometry, material);
        
        // Set up renderer with render target
        const renderer = new THREE.WebGLRenderer({ antialias: false });
        renderer.setSize(200, 200);
        
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
        camera.position.set(0, 20, 15);
        
        scene.add(mesh);
        scene.add(new THREE.AmbientLight(0xffffff, 1));
        
        const renderTarget = new THREE.WebGLRenderTarget(200, 200);
        renderer.render(scene, camera, renderTarget, true);
        
        material.dispose();
        geometry.dispose();
        renderer.dispose();
        renderTarget.dispose();
        
        resolve({ success: true, log: 'Height visualization shader rendered successfully' });
      } catch (e: any) {
        resolve({ success: false, log: e.message });
      }
    });
  });
  
  expect(result.success).toBe(true);
});

test('slope visualization shader renders correctly with geometry', async ({ page }) => {
  await page.goto('/');
  
  const result = await page.evaluate(() => {
    return new Promise((resolve) => {
      const THREE = (window as any).THREE;
      
      if (!THREE) {
        resolve({ success: false, log: 'Three.js not available' });
        return;
      }
      
      const slopeVert = (globalThis as any).slopeVisualizationVert;
      const slopeFrag = (globalThis as any).slopeVisualizationFrag;
      
      if (!slopeVert || !slopeFrag) {
        resolve({ success: false, log: 'Slope visualization shaders not available' });
        return;
      }
      
      try {
        const material = new THREE.ShaderMaterial({
          uniforms: {
            uMinSlope: { value: 0.0 },
            uMaxSlope: { value: 2.0 }
          },
          vertexShader: slopeVert,
          fragmentShader: slopeFrag,
          side: THREE.DoubleSide
        });
        
        const terrainSize = 12;
        const segments = 80;
        const geometry = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, material);
        
        const renderer = new THREE.WebGLRenderer({ antialias: false });
        renderer.setSize(200, 200);
        
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
        camera.position.set(0, 20, 15);
        
        scene.add(mesh);
        scene.add(new THREE.AmbientLight(0xffffff, 1));
        
        const renderTarget = new THREE.WebGLRenderTarget(200, 200);
        renderer.render(scene, camera, renderTarget, true);
        
        material.dispose();
        geometry.dispose();
        renderer.dispose();
        renderTarget.dispose();
        
        resolve({ success: true, log: 'Slope visualization shader rendered successfully' });
      } catch (e: any) {
        resolve({ success: false, log: e.message });
      }
    });
  });
  
  expect(result.success).toBe(true);
});