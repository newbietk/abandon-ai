/**
 * JSONL read/write layer for session diff records.
 * Handles path resolution and session ID security validation.
 */
import fs from 'node:fs';
import path from 'node:path';

const JSONL_FILENAME = 'session_diffs.jsonl';
const SESSION_ID_SHAPE = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Resolve the trace output directory.
 * Reads .kirinharness/config/layout.json for memory_root, falls back to .project/memory/trace.
 */
export function resolveTraceDir(cwd) {
  const layoutPath = path.join(cwd, '.kirinharness', 'config', 'layout.json');
  let memoryRoot = path.join('.project', 'memory');
  try {
    const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf-8'));
    if (layout.paths?.memory_root) memoryRoot = layout.paths.memory_root;
  } catch { /* default */ }
  return path.join(cwd, memoryRoot, 'trace');
}

/**
 * Validate session ID shape to prevent path traversal.
 * Returns the validated ID or null.
 */
export function validateSessionId(sid) {
  if (!sid || typeof sid !== 'string') return null;
  return SESSION_ID_SHAPE.test(sid) ? sid : null;
}

/**
 * Append a single JSONL record.
 */
export function appendRecord(cwd, entry) {
  const dir = resolveTraceDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, JSONL_FILENAME);
  fs.appendFileSync(file, JSON.stringify(entry) + '\n');
}

/**
 * Read all JSONL records from the trace file.
 * Returns an array of parsed objects. Empty array if file doesn't exist.
 */
export function readRecords(cwd) {
  const dir = resolveTraceDir(cwd);
  const file = path.join(dir, JSONL_FILENAME);
  if (!fs.existsSync(file)) return [];
  const content = fs.readFileSync(file, 'utf-8').trim();
  if (!content) return [];
  return content.split('\n').filter(Boolean).map(l => JSON.parse(l));
}

/**
 * Get the full path to the JSONL file.
 */
export function jsonlPath(cwd) {
  return path.join(resolveTraceDir(cwd), JSONL_FILENAME);
}
