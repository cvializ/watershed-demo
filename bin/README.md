# Call Hierarchy Generator

A TypeScript utility that analyzes source files and generates a call hierarchy tree showing which functions call which other functions.

## Usage

```bash
# Install dependencies (if not already done)
npm install

# Generate call hierarchy for one or more files
npx tsx bin/call-hierarchy <file1.ts> [file2.ts ...]

# Examples
npx tsx bin/call-hierarchy src/utils/helpers.ts
npx tsx bin/call-hierarchy src/foo.ts src/bar.ts
```

## Output Format

The output shows a tree-like hierarchy with indentation representing the depth of each function call:

```
main
  init
    setup
      log
    loadConfig
      fetchConfig
  processData
    parseData
      tokenize
```

## How It Works

1. Uses the TypeScript compiler API to parse source files and build an AST
2. Identifies function declarations (both named functions and arrow functions assigned to variables)
3. For each function, analyzes its body to find all function calls
4. Builds a call graph and traverses it from root functions (functions not called by any other function)
5. Outputs the hierarchy with proper indentation

## Features

- **TypeScript Support**: Analyzes `.ts` and `.tsx` files using the TypeScript compiler
- **Multiple Files**: Can process multiple files at once and merge their call hierarchies
- **Indentation**: Clear visual representation of call depth using 2-space indentation
- **Cross-referencing**: Builds a complete call graph across multiple files

## API

The module exports the following functions for programmatic use:

- `parseFile(filePath: string): FunctionInfo[]` - Parse a file and extract function information
- `buildCallHierarchy(functions: FunctionInfo[]): Map<string, string[]>` - Build a call map from functions
- `getTopLevelFunctions(functions: FunctionInfo[], callMap: Map<string, string[]>): string[]` - Find root functions
- `formatCallHierarchy(callMap: Map<string, string[]>, rootFunctions: string[], indentChar?: string): string` - Format the hierarchy as a string
- `generateCallHierarchy(filePaths: string[]): string` - Main entry point to generate the full hierarchy
