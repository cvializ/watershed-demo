#!/usr/bin/env -S ts-node

/**
 * Script to check that all exported components from the components module
 * are actually imported by at least one other module.
 *
 * This ensures that no component is exported but never used anywhere in the codebase.
 */

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

interface ComponentExport {
  name: string;
  filePath: string;
}

interface ComponentImport {
  name: string;
  filePath: string;
  lineNumber: number;
}

/**
 * Extract component exports from a source file
 */
function extractExports(filePath: string): ComponentExport[] {
  const exports: ComponentExport[] = [];

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
    );

    function visitNode(node: ts.Node) {
      if (ts.isExportDeclaration(node)) {
        // export { x, y } from './module'
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const specifier of node.exportClause.elements) {
            exports.push({
              name: specifier.name.text,
              filePath,
            });
          }
        }
      } else if (ts.isExportAssignment(node)) {
        // export default ...
        exports.push({
          name: "default",
          filePath,
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
              });
            }
          }
        }
      } else if (ts.isClassDeclaration(node) && node.name) {
        // class Foo {} - check if exported
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
          });
        }
      }

      ts.forEachChild(node, visitNode);
    }

    if (ts.isExportAssignment(sourceFile)) {
      exports.push({
        name: "default",
        filePath,
      });
    }

    ts.forEachChild(sourceFile, visitNode);
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }

  return exports;
}

/**
 * Extract component imports from a source file
 */
function extractImports(filePath: string): ComponentImport[] {
  const imports: ComponentImport[] = [];

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
    );

    function visitNode(node: ts.Node) {
      if (ts.isImportDeclaration(node)) {
        // import { x, y } from './module'
        if (node.importClause && node.importClause.namedBindings) {
          if (ts.isNamedImports(node.importClause.namedBindings)) {
            for (const element of node.importClause.namedBindings.elements) {
              const line =
                sourceFile.getLineAndCharacterOfPosition(element.pos).line + 1;
              imports.push({
                name: element.name.text,
                filePath,
                lineNumber: line,
              });
            }
          } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
            // import * as Components from './module'
            const line =
              sourceFile.getLineAndCharacterOfPosition(
                node.importClause.namedBindings.pos,
              ).line + 1;
            imports.push({
              name: node.importClause.namedBindings.name.text,
              filePath,
              lineNumber: line,
            });
          }
        }
      }

      ts.forEachChild(node, visitNode);
    }

    ts.forEachChild(sourceFile, visitNode);
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }

  return imports;
}

/**
 * Find all TypeScript/TSX files in a directory
 */
function findSourceFiles(
  dir: string,
  extensions: string[] = [".ts", ".tsx"],
): string[] {
  const files: string[] = [];

  function scan(currentDir: string) {
    try {
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
    } catch (error) {
      console.error(`Error reading directory ${currentDir}:`, error);
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
  const componentsFilePath = path.join(srcDir, "components", "components.ts");

  console.log("Checking component exports are imported...\n");

  // Check if components file exists
  if (!fs.existsSync(componentsFilePath)) {
    console.error(`❌ Components file not found: ${componentsFilePath}`);
    process.exit(1);
  }

  // Get the components module path
  const componentsModulePath = path.resolve(componentsFilePath);

  // Extract all exports from the components module
  const componentExports = extractExports(componentsModulePath);

  // Filter to only include component exports (not 'default' or type-related)
  const componentNames = componentExports
    .filter((exp) => exp.name !== "default")
    .map((exp) => exp.name);

  console.log(`Found ${componentNames.length} component exports:`);
  for (const name of componentNames) {
    console.log(`  - ${name}`);
  }
  console.log();

  // Find all source files
  const allSourceFiles = findSourceFiles(srcDir);

  console.log(
    `Scanning ${allSourceFiles.length} source files for imports...\n`,
  );

  // Extract all imports from all source files
  const allImports: ComponentImport[] = [];
  for (const filePath of allSourceFiles) {
    const imports = extractImports(filePath);
    allImports.push(...imports);
  }

  // Track which components are imported
  const importedComponents = new Map<string, ComponentImport[]>();

  for (const component of componentNames) {
    importedComponents.set(component, []);
  }

  // Check which components are imported
  for (const imp of allImports) {
    if (importedComponents.has(imp.name)) {
      const imports = importedComponents.get(imp.name)!;
      // Avoid duplicates
      if (!imports.some((i) => i.filePath === imp.filePath)) {
        imports.push(imp);
      }
    }
  }

  // Check if components are imported from the correct module
  const unusedComponents: string[] = [];

  for (const component of componentNames) {
    const imports = importedComponents.get(component)!;

    // Check if any import is from the components module
    const hasImportFromComponents = imports.some((imp) => {
      try {
        // Get the absolute path of the importing file's directory
        const _importDir = path.dirname(imp.filePath);

        // Check if the import statement references the components module
        const content = fs.readFileSync(imp.filePath, "utf-8");
        const sourceFile = ts.createSourceFile(
          imp.filePath,
          content,
          ts.ScriptTarget.Latest,
          true,
        );

        // Check import declarations for this component
        let found = false;

        function checkImports(node: ts.Node) {
          if (ts.isImportDeclaration(node)) {
            const modulePath = node.moduleSpecifier.text;

            // Check if this import is from the components module
            if (
              modulePath === "@/components/components" ||
              modulePath === "../components/components" ||
              modulePath === "../../components/components" ||
              modulePath.includes("/components/components") ||
              modulePath.includes("\\components\\components")
            ) {
              // Check if this specific component is imported
              if (node.importClause) {
                if (
                  node.importClause.namedBindings &&
                  ts.isNamedImports(node.importClause.namedBindings)
                ) {
                  for (const element of node.importClause.namedBindings
                    .elements) {
                    if (element.name.text === component) {
                      found = true;
                      break;
                    }
                  }
                } else if (
                  node.importClause.namedBindings &&
                  ts.isNamespaceImport(node.importClause.namedBindings)
                ) {
                  // Namespace import like "import * as Components"
                  // The component could be accessed as Components.component
                  // For simplicity, we consider this as potentially using the component
                  found = true;
                }
              }
            }
          }

          ts.forEachChild(node, checkImports);
        }

        checkImports(sourceFile);
        return found;
      } catch {
        return false;
      }
    });

    if (!hasImportFromComponents) {
      unusedComponents.push(component);
    }
  }

  // Output results
  if (unusedComponents.length > 0) {
    console.error(
      "❌ FAILED: The following components are exported but not imported:",
    );
    console.error();

    for (const component of unusedComponents) {
      console.error(`  - ${component}`);
    }
    console.error();

    // Show where components are exported
    console.error("Export location:");
    console.error(`  ${path.relative(cwd, componentsModulePath)}`);
    console.error();

    // Show which components ARE imported
    const usedComponents = componentNames.filter(
      (c) => !unusedComponents.includes(c),
    );

    if (usedComponents.length > 0) {
      console.log("✅ Components that are properly imported:");
      for (const component of usedComponents) {
        const imports = importedComponents.get(component)!;
        console.log(
          `  - ${component} (${imports.length} import${imports.length !== 1 ? "s" : ""})`,
        );
      }
    }

    console.error();
    console.error(
      `Summary: ${usedComponents.length}/${componentNames.length} components are imported, ${unusedComponents.length} are unused`,
    );
    process.exit(1);
  } else {
    console.log("✅ All exported components are imported by other modules!");
    console.log();

    // Summary
    for (const component of componentNames) {
      const imports = importedComponents.get(component)!;
      console.log(
        `  ${component}: ${imports.length} import${imports.length !== 1 ? "s" : ""}`,
      );
    }

    console.log();
    console.log(
      `✅ All ${componentNames.length} components are properly used.`,
    );
  }
}

main();
