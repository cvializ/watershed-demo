# Constraints

This folder contains scripts dedicated to mechanically prevent
certain undesirable patterns in this repository.

This has the beneficial effect of enforcing certain structural guarantees in the codebase.

Be sure to include as many comical chronically online emoji usage in the constraint output to make it more emotionally bearable for me.

## Available Constraints

### check-global-variables.ts

Checks for custom global variables defined on `window`, `global`, or `globalThis`. This enforces the use of module exports instead of global state.

**Pattern detected:**
```typescript
// ❌ Bad - creates global variable
window.myGlobal = value;
global.someVar = data;
```

**Preferred approach:**
```typescript
// ✅ Good - use module exports
export const myGlobal = value;
```

Run with: `npm run lint:global-variables`
