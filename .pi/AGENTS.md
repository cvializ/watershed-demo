# Project Conventions

## Development Approach
- **Plan in incrementally verifiable chunks**: Break down all plans into small, testable increments that can be implemented and verified sequentially
- Each chunk should produce observable progress - a passing test, working feature, or verifiable output
- Implement in a TDD style: define the expected behavior first, then implement to pass tests

## TypeScript Import Conventions
- **Use absolute imports from `src/`**: Import modules using absolute paths starting with `src/`, e.g., `import { function } from 'src/utils/helpers'` instead of relative paths like `../../../utils/helpers`
- This improves code readability and makes refactoring easier
- Configure your editor/IDE to resolve absolute imports correctly

### Build System Configuration for Absolute Imports
Ensure your build system supports absolute imports from the `src/` directory:

**TypeScript (`tsconfig.json`)**:
```json
{
  "compilerOptions": {
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

**Webpack**:
```js
module.exports = {
  resolve: {
    alias: {
      'src': path.resolve(__dirname, './src'),
    },
  },
}
```

**Jest (`jest.config.js`)**:
```js
module.exports = {
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
}
```

### Functional Programming First
Prefer a functional programming approach over class-based mutable state for the following reasons:
- **Predictability**: Pure functions always produce the same output for the same input, eliminating unpredictable state transitions
- **Testability**: Pure functions are easier to test in isolation without mocking complex object graphs or managing state setup
- **Concurrency safety**: Immutability eliminates race conditions and thread-safety issues
- **Composability**: Functions that return new values instead of mutating state compose more naturally
- **Debugging simplicity**: Stack traces and call chains are clearer when objects aren't unexpectedly mutated

**When to use classes**: Only use class-based design when there's a clear need for polymorphism, complex inheritance hierarchies, or when integrating with class-based APIs. Even then, prefer immutability for data within the class.

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

## Preferences
- **Prefer functional programming**: Favor pure functions, immutability, and composition over class-based mutable state
- Use functional programming patterns (e.g., map/filter/reduce, monads) where appropriate - avoid side effects and unnecessary mutation
- Avoid mutable state unless absolutely necessary (e.g., performance-critical inner loops)
- When mutation is needed, encapsulate it clearly and document why immutability wouldn't work
- Prefer composition over inheritance
- Write clear commit messages with conventional commits
- Prefer small, focused change sets that implement one verifiable chunk