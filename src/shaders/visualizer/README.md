# Shader Visualizer

This directory contains a standalone shader visualizer that allows you to test and experiment with shaders independently from the main application.

## Usage

### Starting the Visualizer

1. Start a local web server from this directory:
   ```bash
   npx serve .
   ```
   
   Or use any static file server. The visualizer is at `index.html`.

2. Open the provided URL (typically http://localhost:3000 or http://127.0.0.1:3000)

### Features

- **Shader Selection**: Use the dropdown to switch between available shaders:
  - Height Visualization
  - Slope Visualization  
  - Water Visualization
  - Animated Noise (NEW!)

- **Uniform Controls**: Adjust shader uniforms in real-time:
  - Sliders for min/max height, slope values
  - Time-based animation speed, scale, and amplitude controls
  - Immediate feedback as you adjust

- **Orbit Controls**: Click and drag to rotate the view, scroll to zoom

### How It Works

The visualizer:
1. Loads shader files from the current directory
2. Creates a test geometry (plane with rotation)
3. Generates procedural textures for testing
4. Applies the selected shader material to the geometry
5. Allows interactive control of uniforms

### Adding New Shaders

To add a new shader for visualization:

1. Add the vertex and fragment shader files to this directory
2. Update `shaderConfig` in `index.html`:

```javascript
'your-shader-name': {
    vertexUrl: new URL('./your-shader.vert', import.meta.url),
    fragmentUrl: new URL('./your-shader.frag', import.meta.url),
    uniforms: {
        uYourUniform: { value: defaultValue, min: min, max: max, step: step }
    },
    createGeometry: () => {
        const geometry = new THREE.PlaneGeometry(10, 10, 64, 64);
        geometry.rotateX(-Math.PI / 2);
        
        // Create test texture here
        const texture = new THREE.CanvasTexture(canvas);
        return { geometry, texture };
    }
}
```

### Limitations

- Uses procedural test textures (not real heightmaps)
- No animation/time-based effects
- Limited to shaders that work with the test geometry

## Shader Files

| Shader | Description |
|--------|-------------|
| `height-visualization.*` | Visualizes terrain height using color palette |
| `slope-visualization.*` | Visualizes slope angles with gradient colors |
| `water-visualization.*` | Visualizes water flow on terrain |
| `animated-noise.*` | Animates procedural noise over time with controls for speed, scale, and amplitude |