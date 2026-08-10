#!/usr/bin/env node
/**
 * Validates that AGENTS.md exists, is non-empty, and documents the essential
 * commands an agent needs: install, dev, build, test, lint, typecheck.
 *
 * Run as a pre-commit hook (via lint-staged on *.md files) or standalone:
 *   pnpm run agents:check
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const agentsPath = resolve(root, 'AGENTS.md');

const errors = [];

let content;
try {
  content = readFileSync(agentsPath, 'utf8');
} catch {
  console.error(`FAIL: AGENTS.md not found at ${agentsPath}`);
  process.exit(1);
}

if (content.length < 100) {
  errors.push('AGENTS.md is too short (< 100 characters)');
}

const requiredCommands = [
  { pattern: /pnpm\s+install/i, label: 'install (pnpm install)' },
  { pattern: /pnpm\s+dev/i, label: 'dev server (pnpm dev)' },
  { pattern: /pnpm\s+build/i, label: 'build (pnpm build)' },
  { pattern: /pnpm\s+test/i, label: 'test (pnpm test)' },
  { pattern: /pnpm\s+lint/i, label: 'lint (pnpm lint)' },
  { pattern: /pnpm\s+typecheck/i, label: 'typecheck (pnpm typecheck)' },
];

for (const { pattern, label } of requiredCommands) {
  if (!pattern.test(content)) {
    errors.push(`Missing command: ${label}`);
  }
}

if (errors.length > 0) {
  console.error('AGENTS.md validation failed:');
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  process.exit(1);
}

console.log('AGENTS.md validation passed: all essential commands documented.');
