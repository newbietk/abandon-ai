/**
 * Session Diff Tracker — OpenCode Plugin Entry Point
 *
 * Auto-loaded by OC via .opencode/package.json dependency.
 * Hooks into native OC events to capture git diff history transparently.
 *
 * Events handled:
 *   session.created  → init new tracking session
 *   tool.execute.after (edit/write/multiedit/apply_patch) → capture file diffs
 *   session.diff      → supplement OC native diff with git repo metadata
 *   session.idle      → debounce and write checkpoint
 */

import path from 'node:path';
import { onSessionStart, onFileChanged, onSessionDiff, onSessionIdle, doCheckpoint } from './checkpoint.mjs';

const TRACKED_TOOLS = new Set(['edit', 'write', 'multiedit', 'apply_patch', 'bash']);

/**
 * Extract file paths from shell command strings (rm, mv, cp, touch, mkdir, etc.)
 */
function extractPathsFromCommand(cmd, cwd) {
  const paths = [];
  if (!cmd) return paths;

  // Match file arguments for common file-modifying commands
  const fileOps = /^(rm|mv|cp|touch|mkdir|rmdir|cat\s+>|echo\s+.*>)\s+(.+)$/m;
  for (const line of cmd.split('\n').concat(cmd.split(';')).concat(cmd.split('&&'))) {
    const trimmed = line.trim();
    const m = trimmed.match(fileOps);
    if (!m) continue;

    // Extract paths from the arguments (after the command)
    const args = m[2];
    // Split on spaces, but respect quotes
    const tokens = args.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    for (const tok of tokens) {
      const clean = tok.replace(/^["']|["']$/g, '');
      // Only treat as file path if it looks like one (not a flag)
      if (!clean.startsWith('-') && !clean.startsWith('>')) {
        const abs = path.isAbsolute(clean) ? clean : path.resolve(cwd, clean);
        paths.push(abs);
        // For mv/cp, the last token is the destination
      }
    }
  }
  return [...new Set(paths)];
}

/**
 * Extract absolute file paths from tool execution arguments.
 */
function extractFilePaths(tool, args, cwd) {
  const paths = [];
  if (!args) return paths;

  if (args.filePath) paths.push(args.filePath);

  if (Array.isArray(args.edits)) {
    for (const edit of args.edits) {
      if (edit.filePath) paths.push(edit.filePath);
    }
  }

  // apply_patch: try to extract from patch header
  if (tool === 'apply_patch' && !args.filePath && args.patch) {
    const m = args.patch.match(/^diff --git a\/(\S+) b\/(\S+)/m);
    if (m) paths.push(m[1]);
  }

  // bash: parse shell command for file operations
  if (tool === 'bash' && args.command) {
    paths.push(...extractPathsFromCommand(args.command, cwd));
  }

  return [...new Set(paths)];
}

export default async function SessionDiffPlugin({ client, directory }) {
  try {
    client?.app?.log?.({ body: { service: 'session-diff-tracker', level: 'info', message: 'Session Diff Tracker loaded' } });
  } catch { /* ignore */ }

  // ── Exit safety net: flush checkpoint on process exit ──────────────────
  // OC calls dispose() on clean shutdown. Process signals catch SIGTERM/SIGINT
  // (e.g. opencode run exiting, Ctrl+C). beforeExit covers natural exit.
  let checkpointed = false;
  function safeCheckpoint(reason) {
    if (checkpointed) return;
    checkpointed = true;
    try { doCheckpoint(directory, reason); } catch { /* best-effort */ }
  }

  process.on('SIGTERM', () => safeCheckpoint('process.SIGTERM'));
  process.on('SIGINT', () => safeCheckpoint('process.SIGINT'));
  process.on('beforeExit', () => safeCheckpoint('process.beforeExit'));

  return {
    dispose: async () => {
      safeCheckpoint('session.dispose');
    },

    "tool.execute.after": async (input, _output) => {
      const tool = (input.tool || '').toLowerCase();
      if (!TRACKED_TOOLS.has(tool)) return;

      const filePaths = extractFilePaths(tool, input.args, directory);
      if (filePaths.length === 0) return;

      // Resolve relative paths against project directory
      const resolved = filePaths.map(p => {
        if (path.isAbsolute(p)) return p;
        return path.resolve(directory, p);
      });

      onFileChanged(directory, resolved, tool);
    },

    event: async ({ event }) => {
      const type = event?.type;
      const props = event?.properties || {};

      if (type === 'session.created') {
        const sessionId = props.sessionID || props.id;
        if (sessionId) onSessionStart(directory, sessionId);
      } else if (type === 'session.diff') {
        const diffData = props.diff || props.files || [];
        if (Array.isArray(diffData) && diffData.length > 0) {
          onSessionDiff(directory, diffData);
        }
      } else if (type === 'session.idle') {
        onSessionIdle(directory);
      } else if (type === 'file.edited') {
        // Capture all file changes (including deletions) via file watcher
        const filePath = props.file || props.path || props.filePath;
        if (filePath) {
          const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(directory, filePath);
          onFileChanged(directory, [absPath], 'file.edited');
        }
      }
    },
  };
}
