#!/usr/bin/env -S ts-node

/**
 * Script to check for dynamic import() expressions in TypeScript/JavaScript files.
 * Dynamic imports are forbidden per AGENTS.md "Development Approach" section.
 */

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

/**
 * Check if a node is a dynamic import expression (CallExpression with 'import' callee)
 */
function hasDynamicImport(node: ts.Node): boolean {
  // Check for CallExpression with 'import' as callee (dynamic import())
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword
  ) {
    return true;
  }

  // Recursively check children
  let found = false;
  ts.forEachChild(node, (child) => {
    if (hasDynamicImport(child)) {
      found = true;
    }
  });
  return found;
}

/**
 * Analyze a source file for dynamic imports
 */
function analyzeFile(filePath: string): {
  hasDynamicImport: boolean;
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

    const lines: number[] = [];

    // Walk the AST to find dynamic import expressions (CallExpression with 'import' callee)
    function visit(node: ts.Node) {
      // Check for CallExpression with 'import' as callee
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        const line =
          sourceFile.getLineAndCharacterOfPosition(node.pos).line + 1;
        lines.push(line);
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    return {
      hasDynamicImport: lines.length > 0,
      lines,
    };
  } catch (error) {
    console.error(`Error analyzing ${filePath}:`, error);
    return { hasDynamicImport: false, lines: [] };
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

  console.log("Checking for dynamic import() expressions...\n");

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

    if (result.hasDynamicImport) {
      filesWithIssues++;
      issues.push({ file: filePath, lines: result.lines });
    }
  }

  // Output results
  if (issues.length > 0) {
    console.error("❌ FAILED: Dynamic import() expressions found!\n");
    console.error(
      "Dynamic imports are forbidden per AGENTS.md. Use static imports instead.\n",
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
    console.log("✅ PASSED: No dynamic import() expressions found");
    process.exit(0);
  }
}

main();
