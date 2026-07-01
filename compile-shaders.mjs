import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { WebGLRenderingContext } from '@typescript-webgl/gl-mocks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const shaderDir = path.join(__dirname, 'src', 'shaders');

function getShaderFiles(dir) {
  const files = fs.readdirSync(dir);
  return {
    vert: files.filter(f => f.endsWith('.vert')).map(f => path.join(dir, f)),
    frag: files.filter(f => f.endsWith('.frag')).map(f => path.join(dir, f)),
  };
}

function compileShader(gl, source, type) {
  const shader = gl.createShader(type);
  if (!shader) {
    return { success: false, log: 'Failed to create shader' };
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  const log = gl.getShaderInfoLog(shader) || '';

  gl.deleteShader(shader);

  return { success, log };
}

async function testShaders() {
  
  if (!WebGLRenderingContext) {
    console.log('WebGL not available - skipping shader compilation test');
    return;
  }

  const gl = new WebGLRenderingContext();
  const shaders = getShaderFiles(shaderDir);
  
  let passed = 0;
  let failed = 0;

  console.log('\nCompiling vertex shaders...');
  for (const vertPath of shaders.vert) {
    const source = fs.readFileSync(vertPath, 'utf-8');
    const result = compileShader(gl, source, gl.VERTEX_SHADER);
    
    if (result.success) {
      console.log(`  ✓ ${path.basename(vertPath)}`);
      passed++;
    } else {
      console.log(`  ✗ ${path.basename(vertPath)}`);
      console.log(`    Log: ${result.log}`);
      failed++;
    }
  }

  console.log('\nCompiling fragment shaders...');
  for (const fragPath of shaders.frag) {
    const source = fs.readFileSync(fragPath, 'utf-8');
    const result = compileShader(gl, source, gl.FRAGMENT_SHADER);
    
    if (result.success) {
      console.log(`  ✓ ${path.basename(fragPath)}`);
      passed++;
    } else {
      console.log(`  ✗ ${path.basename(fragPath)}`);
      console.log(`    Log: ${result.log}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

testShaders();