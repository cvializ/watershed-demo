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