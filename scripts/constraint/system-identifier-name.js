#!/usr/bin/env -S npx tsx

import fs from "fs";
import path from "path";

/**
 * Check if a filename ends with "System" but not "InitSystem"
 * or SyncSystem that matches its enclosing folder
 */
const isInvalidSystemName = (filename, dirPath) => {
  // Remove extension for checking
  const nameWithoutExt = filename.replace(/\.[^.]+$/, "");

  const endsWithSystem = nameWithoutExt.toLowerCase().endsWith("system");
  const endsWithInitSystem = nameWithoutExt.toLowerCase().endsWith("initsystem");

  // Allow SyncSystem if it matches the enclosing folder name (parent of dirPath)
  const endsWithSyncSystem = nameWithoutExt.toLowerCase().endsWith("syncsystem");
  if (endsWithSyncSystem && dirPath) {
    const parentDir = path.dirname(dirPath);
    const folderName = path.basename(parentDir);
    const syncSystemBase = nameWithoutExt.replace(/syncsystem$/i, "");
    if (syncSystemBase.toLowerCase() === folderName.toLowerCase()) {
      return false;
    }
  }

  // Invalid if ends with System but not an allowed exception (InitSystem or matching SyncSystem)
  return endsWithSystem && !endsWithInitSystem;
};

/**
 * Recursively find all files in a directory
 */
const findAllFiles = (directory, files = []) => {
  const entries = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      findAllFiles(fullPath, files);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
};

/**
 * Main validation function
 */
const validateSystemNames = () => {
  // Define system directories to check
  const systemDirectories = ["src", "tests", ".pi"];

  const invalidFiles = [];

  for (const directory of systemDirectories) {
    if (!fs.existsSync(directory)) {
      continue;
    }

    const files = findAllFiles(directory);

    for (const filePath of files) {
      const filename = path.basename(filePath);
      const dirPath = path.dirname(filePath);

      if (isInvalidSystemName(filename, dirPath)) {
        invalidFiles.push(filePath);
      }
    }
  }

  if (invalidFiles.length > 0) {
    console.error('❌ Validation failed: Found files with invalid "System" naming:');
    console.error("");

    for (const filePath of invalidFiles) {
      console.error(`  - ${filePath}`);
    }

    console.error("");
    console.error(
      'Unnecessary "System" suffix in file name. Only init system files and sync systems matching their folder (e.g., "rendererSyncSystem.ts" in "renderer/") can end in "System".',
    );
    process.exit(1);
  }

  console.log('✅ Validation passed: No invalid "System" filenames found');
  process.exit(0);
};

// Run validation
validateSystemNames();

console.log('ok');