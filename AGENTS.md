# Project Conventions

## Critical: No Class Generation Policy
**IMPORTANT**: You must NOT generate class syntax (`class { ... }`) under any circumstances unless explicitly requested by the user. This project follows a strict functional programming paradigm.

**What to do instead**:
- Use arrow functions and plain objects instead of class instances
- Use factory functions to create objects with the desired shape
- Use closures for encapsulation instead of private class fields
- Prefer immutable data structures

**Example - DON'T do this**:
```ts
class Counter {
  private count = 0;
  
  increment() {
    this.count++;
  }
  
  getCount() {
    return this.count;
  }
}
```

**Example - DO this instead**:
```ts
type Counter = { count: number };

const createCounter = (): Counter => ({ count: 0 });

const increment = (counter: Counter): Counter => ({ ...counter, count: counter.count + 1 });

const getCount = (counter: Counter): number => counter.count;
```

---

## Development Approach
- **Plan in incrementally verifiable chunks**: Break down all plans into small, testable increments that can be implemented and verified sequentially
- Each chunk should produce observable progress - a passing test, working feature, or verifiable output
- Implement in a TDD style: define the expected behavior first, then implement to pass tests

## TypeScript Import Conventions
- **Use ES Module syntax**: When writing TypeScript code in a `src/` directory, use ES Module syntax (`import`/`export`) by default. Only use CommonJS (`require`/`module.exports`) when absolutely necessary (e.g., for runtime dynamic imports or Node.js APIs that require it). Node.js has solid ES Module support, and modern tooling handles ESM well.
- **Use absolute imports from `src/`**: Import modules using absolute paths starting with `src/`, e.g., `import { function } from 'src/utils/helpers'` instead of relative paths like `../../../utils/helpers`
- This improves code readability and makes refactoring easier
- Configure your editor/IDE to resolve absolute imports correctly

### TypeScript Type Safety Policy
**Avoid `any` and `unknown`**: Both types bypass or delay type checking. Use proper types instead:

**Don't use `any`**: The `any` type completely bypasses TypeScript's type checking.

**Don't use `unknown`**: The `unknown` type defers type checking and often leads to unsafe assertions later.

**Use existing or define proper types instead**:
- **First, check for existing types**: Look in the codebase and library types for suitable types to use
- **Import existing types** from modules rather than redefining them
- **Use library-provided types** (e.g., `HTMLElement` from DOM libs, React's `FC`, etc.)
- **Define types only when needed**: Create interfaces/types for domain concepts not covered by existing types
- **Use generics** for reusable functions that handle multiple types
- **Use type unions** for values that can be one of several known types
- **Use type guards** to narrow union types safely
- **For generic object mappings**: Use `Record<string, never>` or specific key types instead of `{ [key: string]: any }`
- **For external data**: Parse and validate with libraries like `zod` or custom validators, then convert to typed objects
- **For existing code with `any`**: Incrementally replace with proper types during refactoring

**Examples**:
```ts
// DON'T do this
const data = fetchSomeData() as any;
data.someProperty; // No type checking!

// DON'T do this either
const processData = (data: unknown): void => {
  const obj = data as { id: number; name: string };
  obj.id; // Unsafe assertion!
};

// DO this - use existing types when available
import { HTMLElement } from 'node';
const element: HTMLElement = document.getElementById('my-app');
element.classList.add('active'); // Type checked!

// DO this - use library types from npm packages
import { User } from 'some-auth-library';
const user: User = await fetchUser();
console.log(user.id, user.email); // Type checked!

// DO this - define types only for domain-specific concepts
type TaskStatus = 'pending' | 'in-progress' | 'completed';
interface Task {
  id: string;
  title: string;
  status: TaskStatus;
}
const completeTask = (task: Task): void => {
  task.status = 'completed'; // Type checked!
};

// For uncertain types, use unions and guards
type ResponseData = Task | { error: string };

const handleResponse = (data: ResponseData): void => {
  if ('error' in data) {
    console.error(data.error);
  } else {
    console.log(task.id, task.title); // Type narrowed!
  }
};

// For generic object mappings with known keys
type StatusMap = Record<'pending' | 'in-progress' | 'completed', number>;
const statusCounts: StatusMap = { pending: 0, 'in-progress': 0, completed: 0 };
```

**Examples**:
```ts
// DON'T do this
const data = fetchSomeData() as any;
data.someProperty; // No type checking!

// DO this - define proper types
interface UserData {
  id: number;
  name: string;
  email?: string;
}

const data = fetchSomeData() as UserData;
data.id; // Type checked!

// Or use unknown and type guard
const processData = (data: unknown): void => {
  if (typeof data === 'object' && data !== null) {
    // Safe to work with known structure
  }
};
```

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

### Strict Functional Programming Policy
**DO NOT GENERATE CLASSES unless explicitly requested.** This project follows a strict functional programming approach and you must adhere to it:

- **Never use class syntax** - do not generate `class { ... }` blocks
- **Use pure functions and immutability** - always prefer functions that return new values over methods that mutate state
- **Only exceptions**: When the user explicitly asks for a class, or when integrating with external APIs that strictly require class-based types

**Reasons for this policy**:
- **Predictability**: Pure functions always produce the same output for the same input, eliminating unpredictable state transitions
- **Testability**: Pure functions are easier to test in isolation without mocking complex object graphs or managing state setup
- **Concurrency safety**: Immutability eliminates race conditions and thread-safety issues
- **Composability**: Functions that return new values compose more naturally
- **Debugging simplicity**: Stack traces and call chains are clearer when objects aren't unexpectedly mutated

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

## Barrel File Convention
**Never create export barrel files**: Do not create index.ts or barrel files that re-export multiple modules. Each module should export its contents directly, and imports should use explicit paths to individual files rather than importing from a barrel file.

## Pre-Completion Checklist
**Mandatory**: Before marking any task that changes code as complete, you MUST run the validate script using a subagent:
```bash
npm run validate
# or
yarn validate
```
This is required for all code-changing tasks. The task is not complete until validation passes.

**Use subagents for validation**: Delegate validation tasks to a dedicated subagent to ensure isolation and proper execution context. Use the `pi-subagents` skill with a fresh-context fork for validation runs.

## Strict Coding Preferences
- **NO CLASSES**: Do not generate class syntax under any circumstances unless explicitly requested by the user
- **Functional programming only**: Favor pure functions, immutability, and composition over class-based mutable state
- **Arrow functions only**: Use arrow functions (`=>`) instead of function declarations or function expressions
- Use functional programming patterns (e.g., map/filter/reduce) - avoid side effects and unnecessary mutation
- Avoid mutable state entirely unless explicitly justified
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