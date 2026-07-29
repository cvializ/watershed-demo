#!/usr/bin/env tsx
/**
 * Checks that all exports in the project have globally unique identifiers.
 *
 * This script parses all TypeScript/TSX files, extracts export declarations,
 * and checks for duplicate export names across the entire project.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

interface ExportInfo {
  name: string;
  filePath: string;
  line: number;
  column: number;
}

/**
 * Get all TypeScript/TSX files in the project
 */
function getSourceFiles(sourceDir: string): string[] {
  const extensions = [".ts", ".tsx"];
  const files: string[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and other common directories
        if (
          entry.name === "node_modules" ||
          entry.name === ".git" ||
          entry.name === "dist"
        ) {
          continue;
        }
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(sourceDir);
  return files;
}

/**
 * Extract export information from TypeScript source file
 * Only includes runtime exports (not types, interfaces, enums)
 */
function extractExports(filePath: string): ExportInfo[] {
  const exports: ExportInfo[] = [];
  let content: string;

  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    console.warn(`Warning: Failed to read ${filePath}`);
    return exports;
  }

  // Skip type declaration files (.d.ts) as they don't generate runtime exports
  if (filePath.endsWith(".d.ts")) {
    return exports;
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
  );

  function visitNode(node: ts.Node) {
    // Skip type-related nodes entirely
    if (
      ts.isTypeAliasDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isEnumDeclaration(node)
    ) {
      return;
    }

    if (ts.isExportDeclaration(node)) {
      // export { x, y } from './module'
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const specifier of node.exportClause.elements) {
          exports.push({
            name: specifier.name.text,
            filePath,
            line: specifier.name.pos,
            column: 0,
          });
        }
      }
    } else if (ts.isExportAssignment(node)) {
      // export default ...
      exports.push({
        name: "default",
        filePath,
        line: node.expression.pos,
        column: 0,
      });
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      // function foo() {} - check if it's exported
      let isExported = false;
      if (node.modifiers) {
        for (const m of node.modifiers) {
          if (m.kind === ts.SyntaxKind.ExportKeyword) {
            isExported = true;
            break;
          }
        }
      }
      if (isExported) {
        exports.push({
          name: node.name.text,
          filePath,
          line: node.getStart(),
          column: 0,
        });
      }
    } else if (ts.isVariableStatement(node)) {
      // Check if it's exported: export const x = ...
      let isExported = false;
      if (node.modifiers) {
        for (const m of node.modifiers) {
          if (m.kind === ts.SyntaxKind.ExportKeyword) {
            isExported = true;
            break;
          }
        }
      }
      if (isExported) {
        for (const declaration of node.declarationList.declarations) {
          if (declaration.name && ts.isIdentifier(declaration.name)) {
            exports.push({
              name: declaration.name.text,
              filePath,
              line: declaration.getStart(),
              column: 0,
            });
          }
        }
      }
    } else if (ts.isClassDeclaration(node) && node.name) {
      // class Foo {} - check if exported (though project doesn't use classes)
      let isExported = false;
      if (node.modifiers) {
        for (const m of node.modifiers) {
          if (m.kind === ts.SyntaxKind.ExportKeyword) {
            isExported = true;
            break;
          }
        }
      }
      if (isExported) {
        exports.push({
          name: node.name.text,
          filePath,
          line: node.getStart(),
          column: 0,
        });
      }
    }

    ts.forEachChild(node, visitNode);
  }

  // Check for export= statement
  if (ts.isExportAssignment(sourceFile)) {
    exports.push({
      name: "default",
      filePath,
      line: sourceFile.pos,
      column: 0,
    });
  }

  ts.forEachChild(sourceFile, visitNode);

  return exports;
}

/**
 * Main function to check for duplicate exports
 */
async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(__dirname, "../..");
  const sourceDir = path.join(projectRoot, "src");

  console.log(`Scanning for TypeScript/TSX files in ${sourceDir}...`);

  const sourceFiles = getSourceFiles(sourceDir);
  console.log(`Found ${sourceFiles.length} files\n`);

  const allExports: ExportInfo[] = [];

  for (const filePath of sourceFiles) {
    try {
      const exports = extractExports(filePath);
      allExports.push(...exports);
    } catch (error) {
      console.warn(`Warning: Failed to process ${filePath}`);
      console.warn((error as Error).message);
    }
  }

  // Group exports by name to find duplicates
  const exportMap = new Map<string, ExportInfo[]>();

  for (const exp of allExports) {
    // Use name + filePath as unique key
    const key = `${exp.filePath}#${exp.name}`;

    if (!exportMap.has(key)) {
      exportMap.set(key, []);
    }
    exportMap.get(key)!.push(exp);
  }

  // Find intra-file duplicates (same name exported multiple times in one file)
  const intraFileDuplicates = new Map<string, ExportInfo[]>();

  for (const [key, exports] of exportMap) {
    const name = key.split("#")[1];
    // Skip default exports from this check
    if (name === "default") continue;
    if (exports.length > 1) {
      intraFileDuplicates.set(name, exports);
    }
  }

  // Find inter-file duplicates (same name in different files)
  const nameToFiles = new Map<string, Set<string>>();
  const nameToExports = new Map<string, ExportInfo[]>();

  for (const exp of allExports) {
    if (exp.exportType === "default") continue;

    let files = nameToFiles.get(exp.name);
    if (!files) {
      files = new Set();
      nameToFiles.set(exp.name, files);
    }
    files.add(exp.filePath);

    let exportsWithName = nameToExports.get(exp.name);
    if (!exportsWithName) {
      exportsWithName = [];
      nameToExports.set(exp.name, exportsWithName);
    }
    exportsWithName.push(exp);
  }

  const duplicateMap = new Map<string, ExportInfo[]>();
  for (const [name, files] of nameToFiles) {
    if (files.size > 1) {
      duplicateMap.set(name, nameToExports.get(name)!);
    }
  }

  let hasErrors = false;

  // Report intra-file duplicates
  if (intraFileDuplicates.size > 0) {
    console.log("❌ Intra-file duplicate exports (same name, same file):");
    console.log();

    for (const [name, exports] of intraFileDuplicates) {
      console.log(`  ${name}:`);
      for (const exp of exports) {
        const relPath = path.relative(projectRoot, exp.filePath);
        console.log(`    - ${relPath}`);
      }
      console.log();
    }

    hasErrors = true;
  }

  // Report inter-file duplicates
  if (duplicateMap.size > 0) {
    console.log(
      "❌ Inter-file duplicate exports (same name, different files):",
    );
    console.log();

    for (const [name, exports] of duplicateMap) {
      const files = new Set(exports.map((e) => e.filePath));
      console.log(`  ${name} (in ${files.size} files):`);

      for (const exp of exports) {
        const relPath = path.relative(projectRoot, exp.filePath);
        console.log(`    - ${relPath}`);
      }
      console.log();
    }

    hasErrors = true;
  }

  // Summary
  const totalExports = allExports.filter((e) => e.name !== "default").length;
  console.log("Summary:");
  console.log(`  Total exports checked: ${totalExports}`);
  console.log(`  Intra-file duplicates: ${intraFileDuplicates.size}`);
  console.log(`  Inter-file duplicates: ${duplicateMap.size}`);

  if (hasErrors) {
    console.log();
    console.error("❌ Found duplicate export identifiers!");
    console.error("   All exports must have globally unique identifiers.");
    process.exit(1);
  } else {
    console.log();
    console.log("✅ All exports have globally unique identifiers!");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
