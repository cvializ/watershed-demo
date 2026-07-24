#!/usr/bin/env tsx
/**
 * Check for underscore-prefixed variables that are actually used.
 *
 * This is the opposite of the typical convention. Usually `_prefix` means
 * "this variable is intentionally unused". Here, we want to fail if such
 * a variable is actually referenced.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

// Configuration
const SOURCE_DIRS = ["src"];
const IGNORE_PATTERNS = [/node_modules/, /dist/, /build/, /\.git/];

// Regex patterns
const VAR_DECL_PATTERN = /\b(?:const|let|var)\s+_(\w+)\s*=/gm;
const IDENTIFIER_PATTERN = /\b_(\w+)\b/g;

function shouldIgnoreFile(filePath: string): boolean {
  return IGNORE_PATTERNS.some((pattern) => pattern.test(filePath));
}

function findSourceFiles(dir: string): string[] {
  const files: string[] = [];

  function scan(directory: string) {
    try {
      const entries = readdirSync(directory);

      for (const entry of entries) {
        const fullPath = join(directory, entry);

        if (shouldIgnoreFile(fullPath)) continue;

        const stats = statSync(fullPath);

        if (stats.isDirectory()) {
          scan(fullPath);
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
          files.push(fullPath);
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  scan(dir);
  return files;
}

function checkFile(filePath: string): {
  warnings: Array<{ filePath: string; varName: string; line: number }>;
} {
  const warnings: Array<{ filePath: string; varName: string; line: number }> =
    [];

  try {
    const content = readFileSync(filePath, "utf-8");

    // Find all variable declarations with underscore prefix
    VAR_DECL_PATTERN.lastIndex = 0;
    const matches = [...content.matchAll(VAR_DECL_PATTERN)];

    for (const match of matches) {
      const varName = match[1];
      const declarationPos = match.index ?? 0;

      // Count lines to get declaration line number
      const declarationLines = content
        .substring(0, declarationPos)
        .split("\n").length;

      // Look for usage of this specific variable AFTER its declaration
      // by scanning the content after the declaration line
      const contentAfterDecl = content.substring(declarationPos);

      // Find all occurrences of _varName after declaration
      IDENTIFIER_PATTERN.lastIndex = 0;
      const allIdentifiers = [...contentAfterDecl.matchAll(IDENTIFIER_PATTERN)];

      // Count occurrences of this specific variable (excluding the declaration itself)
      let usageCount = 0;
      for (const identMatch of allIdentifiers) {
        if (identMatch[1] === varName) {
          // Check if this is the declaration or a usage
          const pos = identMatch.index ?? 0;
          if (pos > match[0].length) {
            // This is after the declaration, so it's a usage
            usageCount++;
          }
        }
      }

      if (usageCount > 0) {
        warnings.push({
          filePath: relative(process.cwd(), filePath),
          varName,
          line: declarationLines,
        });
      }
    }
  } catch (error) {
    // Silently skip files that can't be read
    console.error(`Error reading ${filePath}:`, error);
  }

  return { warnings };
}

function main() {
  let totalWarnings = 0;
  const allWarnings: Array<{
    filePath: string;
    varName: string;
    line: number;
  }> = [];

  console.log(
    "Checking for underscore-prefixed variables that are actually used...\n",
  );

  // Check all source directories
  for (const dir of SOURCE_DIRS) {
    if (!statSync(dir).isDirectory()) continue;

    const files = findSourceFiles(dir);

    for (const file of files) {
      const { warnings } = checkFile(file);
      allWarnings.push(...warnings);
    }
  }

  // Report results
  if (allWarnings.length > 0) {
    console.error(
      "❌ Found underscore-prefixed variables that are actually used:\n",
    );

    for (const warning of allWarnings) {
      console.error(
        `  ${warning.filePath}:${warning.line} - Variable '_${warning.varName}' is declared with underscore prefix but is actually used`,
      );
    }

    console.error(`\nTotal: ${allWarnings.length} warning(s)\n`);
    totalWarnings = allWarnings.length;
  } else {
    console.log(
      "✅ No issues found. All underscore-prefixed variables are properly unused.\n",
    );
  }

  process.exit(totalWarnings > 0 ? 1 : 0);
}

main();
