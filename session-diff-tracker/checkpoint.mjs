/**
 * Session lifecycle management + idle debounce.
 *
 * Core principle:
 *   Each session records the net diff of modified files against the REMOTE
 *   tracking branch (not local HEAD). Intermediate edits are NOT recorded —
 *   only the final snapshot at checkpoint time. If the user commits (clean
 *   working tree), the next session picks up the new remote baseline.
 *
 * Tracker state (tracker-state.json):
 *   current_session_id   — active session ID
 *   previous_session_id  — for reopen detection
 *   baseline_ref         — remote tracking ref (e.g. "origin/main")
 *   baseline_commit      — remote commit SHA at session start
 *   pending_files        — { "/abs/path": "sha256" } touched files
 *   pending_tools        — ["edit", "write", ...] tool names used
 *   repos_seen           — ["/repo/root"]
 *   sequence             — monotonically increasing
 *   last_checkpoint_ts   — ISO timestamp
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  findRepoRoot, collectRepoInfo,
  getRemoteTrackingRef, getRefCommit, hasUncommittedChanges,
  getDiffAgainst, getStatusAgainst,
  fileHash,
} from './git-collector.mjs';
import { appendRecord } from './jsonl-writer.mjs';

const IDLE_DEBOUNCE_MS = 30_000;
const FORCE_CHECKPOINT_MS = 5 * 60_000;
const TRACKER_STATE_FILE = 'tracker-state.json';
const CONTENT_MAX_CHARS = 51200;

// ── Module-level timers ────────────────────────────────────────────────────────
let idleTimer = null;
let forceTimer = null;

// ── Tracker state ──────────────────────────────────────────────────────────────
function statePath(cwd) {
  return path.join(cwd, 'session-diff-tracker', TRACKER_STATE_FILE);
}

function defaultState() {
  return {
    current_session_id: null,
    previous_session_id: null,
    baseline_ref: null,
    baseline_commit: null,
    pending_files: {},
    pending_tools: [],
    repos_seen: [],
    sequence: 0,
    last_checkpoint_ts: null,
  };
}

function loadState(cwd) {
  try {
    return { ...defaultState(), ...JSON.parse(fs.readFileSync(statePath(cwd), 'utf-8')) };
  } catch {
    return defaultState();
  }
}

function saveState(cwd, state) {
  const p = statePath(cwd);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2));
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function nowIso() { return new Date().toISOString(); }

function readFileContent(absPath) {
  try {
    if (!fs.existsSync(absPath)) return { text: null, truncated: false, deleted: true };
    const content = fs.readFileSync(absPath, 'utf-8');
    if (content.length <= CONTENT_MAX_CHARS) return { text: content, truncated: false, deleted: false };
    return { text: content.slice(0, CONTENT_MAX_CHARS), truncated: true, deleted: false };
  } catch {
    return { text: null, truncated: false, deleted: true };
  }
}

function clearTimers() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (forceTimer) { clearTimeout(forceTimer); forceTimer = null; }
}

// ── Session start ──────────────────────────────────────────────────────────────

export function onSessionStart(cwd, sessionId) {
  clearTimers();

  let tracker = loadState(cwd);

  // Flush previous session if it has pending files
  if (Object.keys(tracker.pending_files).length > 0 && tracker.current_session_id) {
    doCheckpoint(cwd, 'session.end');
    tracker = loadState(cwd);
  }

  // Determine remote baseline for the primary repo (cwd or first seen repo)
  const primaryRepo = findRepoRoot(cwd) || (tracker.repos_seen[0] || cwd);
  const remoteRef = getRemoteTrackingRef(primaryRepo);
  const remoteCommit = remoteRef ? getRefCommit(primaryRepo, remoteRef) : null;
  const isClean = remoteRef ? !hasUncommittedChanges(primaryRepo) : false;

  // Detect continuation: same baseline_commit as previous session
  const isReopen = tracker.baseline_commit && remoteCommit &&
    tracker.baseline_commit === remoteCommit &&
    tracker.current_session_id;

  const previousId = isReopen ? tracker.current_session_id : (tracker.current_session_id || null);

  tracker.current_session_id = sessionId;
  tracker.previous_session_id = previousId;
  tracker.baseline_ref = remoteRef;
  tracker.baseline_commit = remoteCommit;
  tracker.pending_files = {};
  tracker.pending_tools = [];
  tracker.sequence = 0;
  tracker.last_checkpoint_ts = null;
  saveState(cwd, tracker);

  appendRecord(cwd, {
    type: 'session.init',
    session_id: sessionId,
    window_id: null,
    timestamp: nowIso(),
    operator: 'opencode-agent',
    cwd,
    reopen_of: isReopen ? previousId : null,
    baseline: {
      ref: remoteRef,
      commit: remoteCommit,
      clean_working_tree: isClean,
    },
    sequence: 0,
    ext: {},
  });

  // Install force timer
  forceTimer = setTimeout(() => {
    doCheckpoint(cwd, 'session.idle');
  }, FORCE_CHECKPOINT_MS);
}

// ── File changed ───────────────────────────────────────────────────────────────

/**
 * Record that a file was touched. Does NOT compute diffs immediately —
 * intermediate states within a session are not recorded. Diffs are computed
 * once at checkpoint time against the remote baseline.
 */
export function onFileChanged(cwd, filePaths, toolName) {
  const tracker = loadState(cwd);

  // Auto-recover if no active session
  if (!tracker.current_session_id) {
    const recoveryId = `oc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const primaryRepo = findRepoRoot(cwd) || cwd;
    const remoteRef = getRemoteTrackingRef(primaryRepo);
    tracker.current_session_id = recoveryId;
    tracker.previous_session_id = tracker.previous_session_id || null;
    tracker.baseline_ref = remoteRef;
    tracker.baseline_commit = remoteRef ? getRefCommit(primaryRepo, remoteRef) : null;
    tracker.pending_files = {};
    tracker.pending_tools = [];
    tracker.sequence = 0;
    saveState(cwd, tracker);
    appendRecord(cwd, {
      type: 'session.init',
      session_id: recoveryId,
      window_id: null,
      timestamp: nowIso(),
      operator: 'opencode-agent',
      cwd,
      reopen_of: tracker.previous_session_id,
      baseline: {
        ref: remoteRef,
        commit: tracker.baseline_commit,
        clean_working_tree: null,
      },
      sequence: 0,
      ext: { _recovered: true },
    });
  }

  // Reset idle timer
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }

  // Only track file paths + hashes — no diff computation yet
  for (const absPath of filePaths) {
    const h = fileHash(absPath);
    if (h) tracker.pending_files[absPath] = h;
  }
  if (toolName && !tracker.pending_tools.includes(toolName)) {
    tracker.pending_tools.push(toolName);
  }

  // Track repos
  for (const absPath of filePaths) {
    const repoRoot = findRepoRoot(absPath);
    if (repoRoot && !tracker.repos_seen.includes(repoRoot)) {
      tracker.repos_seen.push(repoRoot);
    }
  }

  saveState(cwd, tracker);
}

/**
 * OC native session.diff — same treatment: just track files.
 */
export function onSessionDiff(cwd, ocDiffData) {
  const tracker = loadState(cwd);
  if (!tracker.current_session_id || !Array.isArray(ocDiffData)) return;

  for (const entry of ocDiffData) {
    const filePath = entry.file;
    if (!filePath) continue;
    const absPath = path.resolve(cwd, filePath);
    const h = fileHash(absPath);
    if (h) tracker.pending_files[absPath] = h;
    const repoRoot = findRepoRoot(absPath);
    if (repoRoot && !tracker.repos_seen.includes(repoRoot)) {
      tracker.repos_seen.push(repoRoot);
    }
  }

  saveState(cwd, tracker);
}

// ── Idle debounce ──────────────────────────────────────────────────────────────

export function onSessionIdle(cwd) {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    doCheckpoint(cwd, 'session.idle');
  }, IDLE_DEBOUNCE_MS);
}

// ── Checkpoint: compute net diffs against remote baseline ──────────────────────

export function doCheckpoint(cwd, reason) {
  clearTimers();

  const tracker = loadState(cwd);
  if (!tracker.current_session_id) return;

  const sessionId = tracker.current_session_id;
  const timestamp = nowIso();
  const baselineRef = tracker.baseline_ref;
  const pendingPaths = Object.keys(tracker.pending_files);

  if (pendingPaths.length === 0) {
    // No files changed — still write checkpoint marker
    appendRecord(cwd, {
      type: 'session.checkpoint',
      session_id: sessionId,
      timestamp,
      sequence: tracker.sequence + 1,
      reason: reason || 'session.idle',
      summary: { total_files_touched: 0, total_diff_entries: 0, repos_involved: [], files_final_state: {} },
      ext: {},
    });
    tracker.last_checkpoint_ts = timestamp;
    saveState(cwd, tracker);
    return;
  }

  // Group files by repo root
  const filesByRepo = {};
  const nonGitFiles = [];

  for (const absPath of pendingPaths) {
    const repoRoot = findRepoRoot(absPath);
    if (!repoRoot) {
      nonGitFiles.push(absPath);
      continue;
    }
    if (!filesByRepo[repoRoot]) filesByRepo[repoRoot] = [];
    filesByRepo[repoRoot].push(absPath);
  }

  const reposInvolved = [];
  let totalDiffEntries = 0;

  // Emit ONE session.diff per repo — net change against remote baseline
  for (const [repoRoot, filePathsOfRepo] of Object.entries(filesByRepo)) {
    const repo = collectRepoInfo(repoRoot);
    // Use remote baseline commit if available, otherwise fall back to HEAD
    const diffBase = baselineRef || 'HEAD';

    const files = [];
    for (const absPath of filePathsOfRepo) {
      const relPath = path.relative(repoRoot, absPath).replace(/\\/g, '/');
      const diff = getDiffAgainst(diffBase, repoRoot, relPath);
      const status = getStatusAgainst(diffBase, repoRoot, relPath);
      const hash = fileHash(absPath);
      const content = readFileContent(absPath);

      files.push({
        relative_path: relPath,
        absolute_path: absPath,
        status: status.status,
        diff: diff || '(no diff)',
        lines_added: status.lines_added,
        lines_removed: status.lines_removed,
        hash_before: null,
        hash_after: hash,
        content_after: content.text,
        content_truncated: content.truncated,
        deleted: content.deleted || false,
      });
    }

    tracker.sequence += 1;
    totalDiffEntries += 1;
    appendRecord(cwd, {
      type: 'session.diff',
      session_id: sessionId,
      timestamp,
      sequence: tracker.sequence,
      repo,
      baseline_ref: diffBase,
      tool: { name: tracker.pending_tools.join(',') || 'snapshot' },
      files,
      ext: {},
    });

    reposInvolved.push({
      root: repoRoot,
      files: filePathsOfRepo.map(p => path.relative(repoRoot, p).replace(/\\/g, '/')),
    });
  }

  // Non-git files
  if (nonGitFiles.length > 0) {
    tracker.sequence += 1;
    totalDiffEntries += 1;
    appendRecord(cwd, {
      type: 'session.diff',
      session_id: sessionId,
      timestamp,
      sequence: tracker.sequence,
      repo: null,
      baseline_ref: null,
      tool: { name: tracker.pending_tools.join(',') || 'snapshot' },
      files: nonGitFiles.map(f => {
        const h = fileHash(f);
        const content = readFileContent(f);
        return {
          relative_path: f,
          absolute_path: f,
          status: '?',
          diff: '(not in a git repository)',
          lines_added: 0,
          lines_removed: 0,
          hash_before: null,
          hash_after: h,
          content_after: content.text,
          content_truncated: content.truncated,
          deleted: content.deleted || false,
        };
      }),
      ext: {},
    });

    reposInvolved.push({
      root: null,
      note: 'not in a git repository',
      files: nonGitFiles,
    });
  }

  // Build files_final_state
  const filesFinalState = {};
  for (const absPath of pendingPaths) {
    filesFinalState[absPath] = {
      hash: tracker.pending_files[absPath],
      last_modified: timestamp,
    };
  }

  appendRecord(cwd, {
    type: 'session.checkpoint',
    session_id: sessionId,
    timestamp,
    sequence: tracker.sequence + 1,
    reason: reason || 'session.idle',
    summary: {
      total_files_touched: pendingPaths.length,
      total_diff_entries: totalDiffEntries,
      repos_involved: reposInvolved,
      files_final_state: filesFinalState,
      baseline_ref: baselineRef,
      baseline_commit: tracker.baseline_commit,
    },
    ext: {},
  });

  // Reset pending but keep session + baseline alive for continuation
  tracker.pending_files = {};
  tracker.pending_tools = [];
  tracker.last_checkpoint_ts = timestamp;
  saveState(cwd, tracker);

  // Re-install force timer
  if (forceTimer) clearTimeout(forceTimer);
  forceTimer = setTimeout(() => {
    doCheckpoint(cwd, 'session.idle');
  }, FORCE_CHECKPOINT_MS);

  // Regenerate HTML viewer
  try {
    const viewerScript = path.join(cwd, 'session-diff-tracker', 'generate-viewer.mjs');
    if (fs.existsSync(viewerScript)) {
      execSync(`node "${viewerScript}"`, { cwd, timeout: 10000, stdio: 'pipe' });
    }
  } catch { /* best-effort */ }
}
