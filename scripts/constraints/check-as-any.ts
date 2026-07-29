#!/usr/bin/env tsx

/**
 * Check for TypeScript type assertions using `as any`.
 *
 * Per the project's strict typing policy, `as any` should not be used
 * as it bypasses TypeScript's type checking.
 */

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

/**
 * Check if a node is a type assertion with 'any' type
 */
function findAsAnyAssertions(node: ts.Node, sourceFile: ts.SourceFile): number[] {
  const lines: number[] = [];

  function visit(currentNode: ts.Node) {
    // AsExpression is the AST node for "as any" syntax in TypeScript
    if (currentNode.kind === ts.SyntaxKind.AsExpression) {
      const asExpr = currentNode as ts.AsExpression;

      // Check if the type is 'any'
      if (asExpr.type.kind === ts.SyntaxKind.AnyKeyword) {
        const pos = asExpr.getFullStart();
        const line =
          sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
        lines.push(line);
      }
    }

    ts.forEachChild(currentNode, visit);
  }

  visit(node);
  return lines;
}

/**
 * Analyze a source file for type assertions
 */
function analyzeFile(filePath: string): {
  hasTypeAssertions: boolean;
  lines: number[];
} {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
    );

    const lines = findAsAnyAssertions(sourceFile, sourceFile);

    return {
      hasTypeAssertions: lines.length > 0,
      lines,
    };
  } catch (error) {
    console.error(`Error analyzing ${filePath}:`, error);
    return { hasTypeAssertions: false, lines: [] };
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
        // Skip node_modules and other common directories
        if (
          entry.name === "node_modules" ||
          entry.name === ".git" ||
          entry.name === "dist" ||
          entry.name === "build"
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
  const testsDir = path.join(cwd, "tests");

  console.log("Checking for type assertions ('as any')...\n");

  const filesToCheck: string[] = [];

  if (fs.existsSync(srcDir)) {
    filesToCheck.push(...findSourceFiles(srcDir));
  }

  if (fs.existsSync(testsDir)) {
    filesToCheck.push(...findSourceFiles(testsDir));
  }

  let totalFiles = 0;
  let filesWithIssues = 0;
  const issues: { file: string; lines: number[] }[] = [];

  for (const filePath of filesToCheck) {
    totalFiles++;
    const result = analyzeFile(filePath);

    if (result.hasTypeAssertions) {
      filesWithIssues++;
      issues.push({ file: filePath, lines: result.lines });
    }
  }

  // Output results
  if (issues.length > 0) {
    console.error("❌ FAILED: Type assertions ('as any') found!\n");
    console.error(
      "Type assertions are forbidden per AGENTS.md. Use proper types instead.\n",
    );

    for (const issue of issues) {
      console.error(`File: ${issue.file}`);
      if (issue.lines.length > 0) {
        console.error(`  Lines: ${issue.lines.join(", ")}`);
      }
      console.error();
    }

    console.error(
      `Summary: ${filesWithIssues}/${totalFiles} files have issues`,
    );
    process.exit(1);
  } else {
    console.log("✅ PASSED: No type assertions found");
    process.exit(0);
  }
}

main();