import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

/**
 * Represents a function declaration with its name, position, and called functions
 */
interface FunctionInfo {
  name: string;
  start: number;
  end: number;
  calls: string[];
}

/**
 * Parse a TypeScript file and extract all function declarations
 */
function parseFile(filePath: string): FunctionInfo[] {
  const sourceCode = fs.readFileSync(filePath, "utf-8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
  );

  const functions: FunctionInfo[] = [];

  /**
   * Visit nodes in the AST
   */
  function visitNode(node: ts.Node) {
    // Handle function declarations
    if (ts.isFunctionDeclaration(node)) {
      const name = node.name ? node.name.text : "<anonymous>";
      functions.push({
        name,
        start: node.getStart(),
        end: node.getEnd(),
        calls: [],
      });
    }
    // Handle arrow functions assigned to variables
    else if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (
          declaration.name &&
          ts.isIdentifier(declaration.name) &&
          declaration.initializer
        ) {
          if (ts.isArrowFunction(declaration.initializer)) {
            functions.push({
              name: declaration.name.text,
              start: node.getStart(),
              end: node.getEnd(),
              calls: [],
            });
          }
        }
      }
    }

    // Recursively visit children
    ts.forEachChild(node, visitNode);
  }

  /**
   * Find all function calls within a specific range
   */
  function findCallsInRange(start: number, end: number): string[] {
    const calls: string[] = [];

    /**
     * Visit nodes to find function calls
     */
    function visitForCalls(node: ts.Node) {
      // Check if node is within our range
      const nodeStart = node.getStart();
      const nodeEnd = node.getEnd();

      if (nodeStart >= start && nodeEnd <= end) {
        // Find function call expressions
        if (ts.isCallExpression(node)) {
          const expression = node.expression;
          if (ts.isIdentifier(expression)) {
            calls.push(expression.text);
          } else if (ts.isPropertyAccessExpression(expression)) {
            // Handle method calls like obj.method()
            const name = expression.name.text;
            if (!calls.includes(name)) {
              calls.push(name);
            }
          }
        }
      }

      // Continue searching within children
      if (nodeStart < end && nodeEnd > start) {
        ts.forEachChild(node, visitForCalls);
      }
    }

    // Start searching from the function's start position
    ts.forEachChild(sourceFile, visitForCalls);

    return calls;
  }

  // First pass: collect all functions
  ts.forEachChild(sourceFile, visitNode);

  // Second pass: find calls within each function
  for (const func of functions) {
    func.calls = findCallsInRange(func.start, func.end);
  }

  // Remove duplicates and clean up
  for (const func of functions) {
    func.calls = [...new Set(func.calls)].filter((call) => call !== func.name);
  }

  return functions;
}

/**
 * Build a call hierarchy tree from function information
 */
function buildCallHierarchy(functions: FunctionInfo[]): Map<string, string[]> {
  const callMap = new Map<string, string[]>();

  for (const func of functions) {
    callMap.set(func.name, func.calls);
  }

  return callMap;
}

/**
 * Get all top-level functions (those not called by any other function)
 */
function getTopLevelFunctions(
  functions: FunctionInfo[],
  callMap: Map<string, string[]>,
): string[] {
  const calledFunctions = new Set<string>();
  for (const calls of callMap.values()) {
    for (const call of calls) {
      calledFunctions.add(call);
    }
  }

  return functions
    .filter((func) => !calledFunctions.has(func.name))
    .map((func) => func.name);
}

/**
 * Format the call hierarchy with indentation
 */
function formatCallHierarchy(
  callMap: Map<string, string[]>,
  rootFunctions: string[],
  indentChar: string = "  ",
): string {
  const lines: string[] = [];
  const visited = new Set<string>();

  function recurse(functionName: string, depth: number) {
    if (visited.has(functionName)) {
      return;
    }
    visited.add(functionName);

    const indent = indentChar.repeat(depth);
    lines.push(`${indent}${functionName}`);

    const calls = callMap.get(functionName) || [];
    for (const call of calls) {
      recurse(call, depth + 1);
    }
  }

  for (const rootFunc of rootFunctions) {
    recurse(rootFunc, 0);
  }

  return lines.join("\n");
}

/**
 * Main function to process TypeScript files and generate call hierarchy
 */
function generateCallHierarchy(filePaths: string[]): string {
  const allFunctions: FunctionInfo[] = [];
  const callMaps: Map<string, string[]>[] = [];

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) {
      console.warn(`Warning: File not found: ${filePath}`);
      continue;
    }

    if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) {
      console.warn(`Warning: Skipping non-TypeScript file: ${filePath}`);
      continue;
    }

    const functions = parseFile(filePath);
    allFunctions.push(...functions);

    const callMap = buildCallHierarchy(functions);
    callMaps.push(callMap);
  }

  // Merge all call maps
  const mergedCallMap = new Map<string, string[]>();
  for (const callMap of callMaps) {
    for (const [key, value] of callMap.entries()) {
      const existing = mergedCallMap.get(key) || [];
      mergedCallMap.set(key, [...existing, ...value]);
    }
  }

  // Remove duplicates from merged calls
  for (const [key, value] of mergedCallMap.entries()) {
    mergedCallMap.set(key, [...new Set(value)]);
  }

  const topFunctions = getTopLevelFunctions(allFunctions, mergedCallMap);

  if (topFunctions.length === 0) {
    return "No functions found in the provided files.";
  }

  return formatCallHierarchy(mergedCallMap, topFunctions);
}

/**
 * Process command line arguments and generate call hierarchy
 */
function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: node call-hierarchy.ts <file1.ts> [file2.ts ...]");
    console.error("Example: node call-hierarchy.ts src/foo.ts src/bar.ts");
    process.exit(1);
  }

  const filePaths = args.map((arg) => path.resolve(arg));
  const result = generateCallHierarchy(filePaths);
  console.log(result);
}

// Export for testing
export {
  main,
  parseFile,
  buildCallHierarchy,
  getTopLevelFunctions,
  formatCallHierarchy,
  generateCallHierarchy,
};

// Run if executed directly (works with both node and tsx)
const isMainModule =
  process.argv.length > 1 && process.argv[1].endsWith("call-hierarchy.ts");
if (isMainModule) {
  main();
}
