#!/usr/bin/env tsx

/**
 * Check for custom global variables defined in the codebase.
 *
 * This script enforces the project's module-based architecture by detecting
 * assignments to global objects (window, global, globalThis) that would create
 * custom global variables. Module exports should be used instead.
 */

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

/**
 * Represents a global variable violation
 */
interface GlobalVariableViolation {
  file: string;
  line: number;
  variableName: string;
  context: string;
}

/**
 * Find custom global variable assignments in the AST
 */
function findGlobalVariables(
  node: ts.Node,
  sourceFile: ts.SourceFile,
): GlobalVariableViolation[] {
  const violations: GlobalVariableViolation[] = [];

  function visit(currentNode: ts.Node) {
    // Check for assignments to global objects
    if (currentNode.kind === ts.SyntaxKind.PropertyAssignment) {
      const propAssign = currentNode as ts.PropertyAssignment;

      // Get the parent object literal or expression
      const parent = currentNode.parent;

      if (parent) {
        // Check for window.xxx = ... or global.xxx = ... or globalThis.xxx = ...
        if (ts.isElementAccessExpression(parent) || ts.isPropertyAssignment(parent)) {
          const expr = parent as ts.ElementAccessExpression | ts.PropertyAssignment;

          // Check if accessing a global object
          const target = 'expression' in expr ? expr.expression : (expr as any).name;

          if (ts.isIdentifier(target)) {
            const globalNames = ['window', 'global', 'globalThis'];
            if (globalNames.includes(target.text)) {
              const propName = ts.isPropertyAssignment(expr)
                ? (expr.name as ts.Identifier).text
                : 'unknown';

              const line = sourceFile.getLineAndCharacterOfPosition(
                currentNode.getFullStart()
              ).line + 1;

              violations.push({
                file: path.relative(process.cwd(), sourceFile.fileName),
                line,
                variableName: propName,
                context: `${target.text}.${propName}`,
              });
            }
          }
        }
      }
    }

    // Check for direct assignments like window.myVar = ...
    if (currentNode.kind === ts.SyntaxKind.PropertyAccessExpression) {
      const propAccess = currentNode as ts.PropertyAccessExpression;

      if (ts.isIdentifier(propAccess.expression)) {
        const globalNames = ['window', 'global', 'globalThis'];
        if (globalNames.includes(propAccess.expression.text)) {
          // Check if this is part of an assignment
          const parent = currentNode.parent;
          if (parent && ts.isExpressionStatement(parent)) {
            const line = sourceFile.getLineAndCharacterOfPosition(
              currentNode.getFullStart()
            ).line + 1;

            violations.push({
              file: path.relative(process.cwd(), sourceFile.fileName),
              line,
              variableName: propAccess.name.text,
              context: `${propAccess.expression.text}.${propAccess.name.text}`,
            });
          } else if (parent && ts.isBinaryExpression(parent)) {
            const binaryExpr = parent as ts.BinaryExpression;
            // Check if this property access is on the left side of an assignment
            if (binaryExpr.left === currentNode && 
                binaryExpr.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
              const line = sourceFile.getLineAndCharacterOfPosition(
                currentNode.getFullStart()
              ).line + 1;

              violations.push({
                file: path.relative(process.cwd(), sourceFile.fileName),
                line,
                variableName: propAccess.name.text,
                context: `${propAccess.expression.text}.${propAccess.name.text}`,
              });
            }
          }
        }
      }
    }

    // Check for element access like window['myVar'] = ...
    if (currentNode.kind === ts.SyntaxKind.ElementAccessExpression) {
      const elemAccess = currentNode as ts.ElementAccessExpression;

      if (ts.isIdentifier(elemAccess.expression)) {
        const globalNames = ['window', 'global', 'globalThis'];
        if (globalNames.includes(elemAccess.expression.text)) {
          // Check if the argument is a string literal (property name)
          if (elemAccess.argumentExpression && 
              ts.isStringLiteral(elemAccess.argumentExpression)) {
            const propName = elemAccess.argumentExpression.text;

            // Check if this is part of an assignment
            const parent = currentNode.parent;
            if (parent && ts.isBinaryExpression(parent)) {
              const binaryExpr = parent as ts.BinaryExpression;
              if (binaryExpr.left === currentNode && 
                  binaryExpr.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
                const line = sourceFile.getLineAndCharacterOfPosition(
                  currentNode.getFullStart()
                ).line + 1;

                violations.push({
                  file: path.relative(process.cwd(), sourceFile.fileName),
                  line,
                  variableName: propName,
                  context: `${elemAccess.expression.text}['${propName}']`,
                });
              }
            }
          }
        }
      }
    }

    ts.forEachChild(currentNode, visit);
  }

  visit(node);
  return violations;
}

/**
 * Analyze a source file for global variable definitions
 */
function analyzeFile(filePath: string): GlobalVariableViolation[] {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
    );

    return findGlobalVariables(sourceFile, sourceFile);
  } catch (error) {
    console.error(`Error analyzing ${filePath}:`, error);
    return [];
  }
}

/**
 * Find all TypeScript/JavaScript files in a directory
 */
function findSourceFiles(
  dir: string,
  extensions: string[] = [".ts", ".tsx", ".js", ".jsx"],
): string[] {
  const files: string[] = [];

  function scan(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        // Skip common directories that shouldn't be scanned
        if (
          entry.name === "node_modules" ||
          entry.name === ".git" ||
          entry.name === "dist" ||
          entry.name === "build" ||
          entry.name === ".pi"
        ) {
          continue;
        }
        scan(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  scan(dir);
  return files;
}

/**
 * Main function
 */
function main() {
  const cwd = process.cwd();
  const srcDir = path.join(cwd, "src");

  console.log("Checking for custom global variables...\n");
  console.log(
    "This check ensures the codebase uses module exports instead of global variables.\n"
  );

  const filesToCheck: string[] = [];

  if (fs.existsSync(srcDir)) {
    filesToCheck.push(...findSourceFiles(srcDir));
  }

  let totalFiles = 0;
  const allViolations: GlobalVariableViolation[] = [];

  for (const filePath of filesToCheck) {
    totalFiles++;
    const violations = analyzeFile(filePath);
    allViolations.push(...violations);
  }

  // Output results
  if (allViolations.length > 0) {
    console.error(
      "❌ FAILED: Custom global variables found!\n"
    );
    console.error(
      "Global variables are forbidden. Use module exports instead.\n"
    );

    // Group violations by file for better readability
    const violationsByFile = new Map<string, GlobalVariableViolation[]>();
    for (const violation of allViolations) {
      const existing = violationsByFile.get(violation.file) || [];
      existing.push(violation);
      violationsByFile.set(violation.file, existing);
    }

    for (const [file, violations] of violationsByFile) {
      console.error(`File: ${file}`);
      for (const v of violations) {
        console.error(`  Line ${v.line}: Custom global '${v.context}'`);
      }
      console.error();
    }

    console.error(
      `Summary: ${allViolations.length} global variable(s) found in ${violationsByFile.size} file(s)`
    );
    process.exit(1);
  } else {
    console.log("✅ PASSED: No custom global variables found");
    console.log(`Scanned ${totalFiles} file(s)`);
    process.exit(0);
  }
}

main();