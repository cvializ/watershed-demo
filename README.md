https://github.com/user-attachments/assets/3453afdb-5666-45df-8d59-3102492fdebc

# Project Setup

## Prerequisites

- Node.js
- npm or yarn

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Type-check without building
npm run typecheck
```

## Validation Pipeline

The project uses a validation script that runs multiple checks in sequence. Before committing:

```bash
npm run validate
```

This runs:

- `lint`: Code style checks (oxlint)
- `knip`: Dead code detection
- `typecheck`: TypeScript type checking
- `test`: Playwright browser tests
- `build`: TypeScript compilation and bundling

## Project Structure

- `src/` - Application code
- `tests/` - Playwright browser tests
- `dist/` - Build output (generated)
- `public/` - Static assets
- `demo.mp4` - Project demonstration video

## Testing Strategy

Tests use Playwright for browser-based testing. Write tests in the `tests/` directory with `.test.ts` extension.

## Code Style

- TypeScript strict mode enabled
- ES Module imports (`import`/`export`)
- Absolute imports from `src/` directory
- Functional programming (no classes unless explicitly requested)
- Arrow functions preferred

See `AGENTS.md` for detailed project conventions.
