#!/usr/bin/env node
/**
 * CLI generator script: reads openapi/sisu-v1.yaml and prints
 * a summary of operations to regenerate.
 *
 * Full automated codegen is left for a future iteration (e.g. using
 * @openapitools/openapi-generator-cli or a custom mustache template).
 * For now this script validates the spec and lists all operationIds
 * so a developer knows what to implement or update in src/.
 *
 * Usage: node scripts/generate.js
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(__dirname, '../../../openapi/sisu-v1.yaml');

// Minimal YAML parser for the paths block (avoids a dependency on js-yaml)
// For full generation, install js-yaml: npm i -D js-yaml
let specText;
try {
  specText = readFileSync(specPath, 'utf8');
} catch {
  console.error(`Cannot read OpenAPI spec at: ${specPath}`);
  process.exit(1);
}

// Extract operationIds via regex — good enough for reporting
const ops = [];
const opRe = /operationId:\s*(\S+)/g;
const methodRe = /^\s+(get|post|put|delete|patch):/gm;

let match;
while ((match = opRe.exec(specText)) !== null) {
  ops.push(match[1]);
}

console.log(`SISU API CLI generator`);
console.log(`Spec: ${specPath}`);
console.log(`Found ${ops.length} operations:\n`);
ops.forEach((op) => console.log(`  - ${op}`));

console.log(`
To fully regenerate src/client.ts and src/index.ts:
  1. Install @openapitools/openapi-generator-cli
  2. Run: openapi-generator-cli generate \\
       -i openapi/sisu-v1.yaml \\
       -g typescript-fetch \\
       -o apps/cli-generated/src/generated/

  Or update src/client.ts and src/index.ts manually to match
  the ${ops.length} operations listed above.
`);
