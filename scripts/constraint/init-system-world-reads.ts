#!/usr/bin/env -S npx tsx
/**
 * Lint script to detect reads from GameWorld in init systems.
 *
 * This script:
 * 1. Finds all files that export init system functions
 * 2. Parses them using TypeScript AST
 * 3. Detects any read operations on the `world` parameter
 */

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

// Files to check (relative to project root)
const FILES_TO_CHECK = ["src/scene/systems", "src/world/systems"];

/**
 * Check if a node represents a read from `world`
 * This catches:
 * - world.property
 * - world['property']
 * - world[someVariable]
 * - world() (call)
 */
function isWorldRead(node: ts.Node): boolean {
  if (!ts.isIdentifier(node)) {
    return false;
  }

  // Check if identifier is 'world'
  if (node.text !== "world") {
    return false;
  }

  // Check parent to see if this is a read operation
  const parent = node.parent;

  if (!parent) {
    return false;
  }

  // Type of read operation
  switch (parent.kind) {
    case ts.SyntaxKind.PropertyAccessExpression:
      // world.property
      const propAccess = parent as ts.PropertyAccessExpression;
      if (ts.isIdentifier(propAccess.expression) && propAccess.expression.text === "world") {
        return true;
      }
      break;

    case ts.SyntaxKind.ElementAccessExpression:
      // world['property'] or world[someVar]
      const elemAccess = parent as ts.ElementAccessExpression;
      if (ts.isIdentifier(elemAccess.expression) && elemAccess.expression.text === "world") {
        return true;
      }
      break;

    case ts.SyntaxKind.CallExpression:
      // world()
      const callExpr = parent as ts.CallExpression;
      if (ts.isIdentifier(callExpr.expression) && callExpr.expression.text === "world") {
        return true;
      }
      break;

    case ts.SyntaxKind.TaggedTemplateExpression:
      // world`template`
      const taggedTpl = parent as ts.TaggedTemplateExpression;
      if (ts.isIdentifier(taggedTpl.tag) && taggedTpl.tag.text === "world") {
        return true;
      }
      break;

    case ts.SyntaxKind.PrefixUnaryExpression:
      // ++world, --world (though unusual for an object)
      const prefixUni = parent as ts.PrefixUnaryExpression;
      if (ts.isIdentifier(prefixUni.operand) && prefixUni.operand.text === "world") {
        return true;
      }
      break;

    case ts.SyntaxKind.PostfixUnaryExpression:
      // world++, world-- (though unusual for an object)
      const postfixUni = parent as ts.PostfixUnaryExpression;
      if (ts.isIdentifier(postfixUni.operand) && postfixUni.operand.text === "world") {
        return true;
      }
      break;
  }

  return false;
}

/**
 * Find all identifier nodes that refer to 'world' and check if they're reads
 */
function findWorldReadsInNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
): Array<{
  line: number;
  column: number;
  text: string;
}> {
  const issues: Array<{ line: number; column: number; text: string }> = [];

  // Only check identifiers - non-identifier nodes can't be 'world' references
  if (ts.isIdentifier(node)) {
    // Check if this node is a read from world
    if (isWorldRead(node)) {
      const position = node.pos;
      const lineNumber = sourceFile.getLineAndCharacterOfPosition(position).line + 1;
      const column = sourceFile.getLineAndCharacterOfPosition(position).character + 1;

      issues.push({
        line: lineNumber,
        column: column,
        text: node.text,
      });
    }

    // Don't traverse children of identifiers
    return issues;
  }

  // Recursively check children
  ts.forEachChild(node, (child) => {
    issues.push(...findWorldReadsInNode(child, sourceFile));
  });

  return issues;
}

/**
 * Check if a node represents an init system function
 */
function isInitSystemFunction(node: ts.Node): boolean {
  // Check for arrow function with 'world' parameter
  if (ts.isArrowFunction(node)) {
    const params = node.parameters;
    for (const param of params) {
      if (ts.isIdentifier(param.name) && param.name.text === "world") {
        return true;
      }
    }
  }

  // Check for function declaration with 'world' parameter
  if (ts.isFunctionDeclaration(node)) {
    const params = node.parameters;
    for (const param of params) {
      if (ts.isIdentifier(param.name) && param.name.text === "world") {
        return true;
      }
    }
  }

  // Check variable declaration with InitSystem type or 'Init' in name
  if (ts.isVariableStatement(node)) {
    for (const declaration of node.declarationList.declarations) {
      const name = declaration.name.getText();

      // Has 'Init' in the name and ends with 'System'
      if (name.includes("Init") && name.endsWith("System")) {
        return true;
      }

      // Has InitSystem type annotation
      if (declaration.type && ts.isTypeReferenceNode(declaration.type)) {
        const typeName = declaration.type.typeName.getText();
        if (typeName.includes("InitSystem")) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Check if a file exports an init system function
 */
function exportsInitSystem(sourceFile: ts.SourceFile): boolean {
  let foundInitSystem = false;

  // Check all nodes in the file
  ts.forEachChild(sourceFile, (node) => {
    if (isInitSystemFunction(node)) {
      foundInitSystem = true;
    }
  });

  return foundInitSystem;
}

/**
 * Check a single file for world reads in init systems
 */
function checkFile(filePath: string): Array<{
  line: number;
  column: number;
  text: string;
}> {
  const content = fs.readFileSync(filePath, "utf-8");

  // Create source file
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

  // Check if this file exports an init system
  if (!exportsInitSystem(sourceFile)) {
    return [];
  }

  // Find all world reads
  const issues = findWorldReadsInNode(sourceFile, sourceFile);

  return issues;
}

/**
 * Collect all TypeScript files to check
 */
function collectFiles(): string[] {
  const files: string[] = [];

  for (const dir of FILES_TO_CHECK) {
    const fullPath = path.join(process.cwd(), dir);

    if (!fs.existsSync(fullPath)) {
      console.error(`Directory not found: ${fullPath}`);
      continue;
    }

    const dirFiles = fs
      .readdirSync(fullPath, { recursive: true })
      .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
      .map((file) => path.join(fullPath, file));

    files.push(...dirFiles);
  }

  return files;
}

/**
 * Main function
 */
function main(): void {
  console.log("Checking init systems for GameWorld reads...\n");

  const files = collectFiles();
  let totalIssues = 0;
  let filesWithIssues = 0;

  for (const filePath of files) {
    const issues = checkFile(filePath);

    if (issues.length > 0) {
      filesWithIssues++;
      totalIssues += issues.length;

      console.log(`❌ ${filePath}`);
      for (const issue of issues) {
        console.log(
          `  Line ${issue.line}, Column ${issue.column}: Read from 'world' - "${issue.text}"`,
        );
      }
      console.log();
    }
  }

  if (filesWithIssues > 0) {
    console.error(`\n❌ Lint failed: Found ${totalIssues} issue(s) in ${filesWithIssues} file(s)`);
    console.error("\nInit systems must not read from the GameWorld parameter.");
    console.error("They should only write to it (add components, create entities, etc.).");
    process.exit(1);
  } else {
    console.log("✅ All init systems passed the check!");
  }
}

main();
