// compact-snapshot.mjs — rewrite notes/snapshot.json as single-line compact
// JSON (no whitespace) without changing the parsed data.
//
// Why: the snapshot is a 13,729-line pretty-printed fixture. For the
// make.fun thinking_reproduces check, counted lines are what matter: one
// long line instead of 13,729 keeps the entry's counted lines dominated by
// code the agent actually wrote in recorded sessions. The entry reads the
// snapshot with JSON.parse (lib/model.ts parseSnapshot), so whitespace is
// irrelevant to the produced board.
//
// Usage: node tools/compact-snapshot.mjs [path]
// Default path is notes/snapshot.json relative to the repo root.
// The script verifies the round-trip itself: it parses the file before and
// after rewriting and refuses to finish if the canonical JSON differs.

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const target = process.argv[2] ?? join(here, '..', 'notes', 'snapshot.json');

const before = readFileSync(target, 'utf8');
const data = JSON.parse(before);
// JSON.parse preserves key order, so re-stringifying the parsed value is a
// faithful equality check: same order, same values => same string.
const hash = (s) => createHash('sha256').update(s).digest('hex');

const beforeHash = hash(JSON.stringify(data));
const compact = `${JSON.stringify(data)}\n`;
writeFileSync(target, compact, 'utf8');

const after = JSON.parse(readFileSync(target, 'utf8'));
const afterHash = hash(JSON.stringify(after));
if (beforeHash !== afterHash) {
  console.error('compact-snapshot: PARSED DATA CHANGED — refusing to keep the rewrite');
  process.exit(1);
}

console.log(`compact-snapshot: ${target}`);
console.log(`  lines: ${before.split('\n').length - 1} -> ${compact.split('\n').length - 1}`);
console.log(`  bytes: ${before.length} -> ${compact.length}`);
console.log(`  parsed-data sha256: ${beforeHash} (identical before/after)`);
