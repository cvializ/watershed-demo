# Project Conventions

## Development Approach
- **Plan in incrementally verifiable chunks**: Break down all plans into small, testable increments that can be implemented and verified sequentially
- Each chunk should produce observable progress - a passing test, working feature, or verifiable output
- Implement in a TDD style: define the expected behavior first, then implement to pass tests

## TypeScript Import Conventions
- **Use ES Module syntax**: When writing TypeScript code in a `src/` directory, use ES Module syntax (`import`/`export`) by default. Only use CommonJS (`require`/`module.exports`) when absolutely necessary (e.g., for runtime dynamic imports or Node.js APIs that require it). Node.js has solid ES Module support, and modern tooling handles ESM well.
- **Use absolute imports from `src/`**: Import modules using absolute paths starting with `src/`, e.g., `import { function } from 'src/utils/helpers'` instead of relative paths like `../../../utils/helpers`
- This improves code readability and makes refactoring easier
- Configure your editor/IDE to resolve absolute imports correctly

### Build System Configuration for Absolute Imports
Ensure your build system supports ES Module imports and absolute imports from the `src/` directory:

**TypeScript (`tsconfig.json`)**:
```json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "baseUrl": ".",
    "paths": {
      "src/*": ["./src/*"]
    }
  }
}
```

**Vite (`vite.config.ts`)**:
```ts
import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      'src': path.resolve(__dirname, './src'),
    },
  },
})
```

### Functional Programming First
Prefer a functional programming approach over class-based mutable state for the following reasons:
- **Predictability**: Pure functions always produce the same output for the same input, eliminating unpredictable state transitions
- **Testability**: Pure functions are easier to test in isolation without mocking complex object graphs or managing state setup
- **Concurrency safety**: Immutability eliminates race conditions and thread-safety issues
- **Composability**: Functions that return new values instead of mutating state compose more naturally
- **Debugging simplicity**: Stack traces and call chains are clearer when objects aren't unexpectedly mutated

**When to use classes**: Only use class-based design when there's a clear need for polymorphism, complex inheritance hierarchies, or when integrating with class-based APIs. Even then, prefer immutability for data within the class.

### Function Syntax Preferences
**Prefer arrow functions over function declarations and function expressions**: Arrow functions provide several advantages for functional programming:
- **Lexical `this` binding**: No need to worry about `this` context changing, avoiding common bugs
- **Concise syntax**: Shorter, more readable code especially for callbacks and short functions
- **No own `this`/`arguments`**: Prevents accidental shadowing of outer scope values
- **Better for functional patterns**: Aligns naturally with map/filter/reduce and other FP techniques

**Examples**:
```ts
// Prefer (arrow function)
const processItems = (items: Item[]): Item[] => {
  return items.map(item => item.toUpperCase());
};

const handleClick = (event: MouseEvent): void => {
  console.log('Clicked:', event.target);
};

// Instead of (function expression)
const processItems = function(items: Item[]): Item[] {
  return items.map(function(item) { return item.toUpperCase(); });
};

// Instead of (function declaration)
function processItems(items: Item[]): Item[] {
  return items.map(function(item) { return item.toUpperCase(); });
}
```

**Note**: The only exception is when you need a function with its own `this` binding (e.g., certain class methods or constructor patterns).

- Use TypeScript with strict mode enabled for all new code

## Code Style & Testing
- **Unit testing is mandatory**: Every public function or module must have corresponding unit tests
- Tests should cover happy paths, edge cases, and error conditions
- Aim for meaningful test coverage, not just line count
- Use a testing framework appropriate to the language (Jest, Vitest, pytest, etc.)
- Run tests locally before committing or pushing changes

## Directory Structure
- `/src` - Application code
- `/tests` - Test files
- `/docs` - Documentation

## Build Commands
```bash
npm install      # Install dependencies
npm test         # Run tests and linting
npm run build    # Build for production
```

**Note**: When running tests, ensure your test runner is configured to resolve absolute imports from `src/`. See the Build System Configuration section above for details.

## Safety Rules
- Always run tests before committing
- Run tests locally before completing work
- Update documentation when adding features
- Never commit credentials or API keys

## Pre-Completion Checklist
Before marking any task as complete, please run the validate script if present:
```bash
npm run validate
# or
yarn validate
```
This ensures all validations pass before finalizing work.

## Preferences
- **Prefer functional programming**: Favor pure functions, immutability, and composition over class-based mutable state
- **Prefer arrow functions**: Use arrow functions (`=>`) instead of function declarations or function expressions for concise syntax and lexical `this` binding
- Use functional programming patterns (e.g., map/filter/reduce, monads) where appropriate - avoid side effects and unnecessary mutation
- Avoid mutable state unless absolutely necessary (e.g., performance-critical inner loops)
- When mutation is needed, encapsulate it clearly and document why immutability wouldn't work
- Prefer composition over inheritance
- Write clear commit messages with conventional commits
- Prefer small, focused change sets that implement one verifiable chunk

## Three.js Geometry and Shader Integration Warnings

### Rotated PlaneGeometry and Normal Calculation
When working with PlaneGeometry in this project, be aware of the following:

**Issue**: The terrain is created as a PlaneGeometry rotated by -π/2 around the X-axis. Three.js computes normals based on the final transformed geometry (after rotation).

**Implications**:
1. A PlaneGeometry's default normal (0, 0, 1) becomes approximately (0, -1, 0) after rotation
2. For a heightfield z = f(x,y), the pre-rotation normal is (fx, fy, -1) normalized
3. After X-rotation of -π/2, this becomes approximately (fx, 1, fy) normalized

**Correct downslope calculation for shaders**:
For a heightfield z = f(x,y), the downslope direction (direction of steepest descent) is given by the gradient (fx, fy). When normals are computed on rotated geometry:
```glsl
float eps = 0.001;
vec2 downDirection = vec2(0.0);
if (abs(normal.z) > eps) {
    downDirection = vec2(normal.x / normal.z, normal.y / normal.z);
}
downDirection = normalize(downDirection);
```

The formula `nx/nz, ny/nz` extracts the gradient from the rotated normal to get the correct downslope direction.