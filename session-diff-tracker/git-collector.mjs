/**
 * Git operations — pure functions wrapping execSync for git commands.
 * All functions are sync and safe: errors are caught and return null/empty.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const GIT_TIMEOUT_MS = 5000;

const GIT_OPTS = {
  timeout: GIT_TIMEOUT_MS,
  encoding: 'utf-8',
  stdio: ['pipe', 'pipe', 'pipe'],
};

/**
 * Find the git repository root for a file path.
 * Returns the absolute repo root or null if not in a git repo.
 */
export function findRepoRoot(fileAbsPath) {
  let dir;
  try {
    dir = fs.statSync(fileAbsPath).isDirectory() ? fileAbsPath : path.dirname(fileAbsPath);
  } catch {
    // File may have been deleted — use parent directory
    dir = path.dirname(fileAbsPath);
  }
  try {
    return execSync('git rev-parse --show-toplevel', { ...GIT_OPTS, cwd: dir }).trim();
  } catch {
    return null;
  }
}

/**
 * Collect repository metadata: remote URL, branch, latest commit.
 */
export function collectRepoInfo(repoRoot) {
  const info = {
    root: repoRoot,
    remote_url: null,
    branch: null,
    latest_commit: null,
    latest_commit_msg: null,
  };
  try { info.remote_url = execSync('git remote get-url origin', { ...GIT_OPTS, cwd: repoRoot }).trim(); } catch { /* no remote */ }
  try { info.branch = execSync('git rev-parse --abbrev-ref HEAD', { ...GIT_OPTS, cwd: repoRoot }).trim(); } catch { /* no branch */ }
  try { info.latest_commit = execSync('git rev-parse HEAD', { ...GIT_OPTS, cwd: repoRoot }).trim(); } catch { /* no commit */ }
  try { info.latest_commit_msg = execSync('git log -1 --format=%s', { ...GIT_OPTS, cwd: repoRoot }).trim(); } catch { /* no msg */ }
  return info;
}

/**
 * Get unified diff for a file (working tree vs HEAD).
 */
export function getFileDiff(repoRoot, relPath) {
  try {
    return execSync(`git diff HEAD -- "${relPath}"`, { ...GIT_OPTS, cwd: repoRoot });
  } catch {
    return '';
  }
}

/**
 * Get file change statistics: status, lines added, lines removed.
 */
export function getFileStatus(repoRoot, relPath) {
  try {
    const stat = execSync(`git diff --numstat HEAD -- "${relPath}"`, { ...GIT_OPTS, cwd: repoRoot }).trim();
    if (!stat) return { status: '?', lines_added: 0, lines_removed: 0 };
    const [a, r] = stat.split('\t');
    return {
      status: 'M',
      lines_added: parseInt(a, 10) || 0,
      lines_removed: parseInt(r, 10) || 0,
    };
  } catch {
    return { status: '?', lines_added: 0, lines_removed: 0 };
  }
}

/**
 * Get SHA256 hash of file content.
 */
export function fileHash(absPath) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(absPath, 'utf-8')).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Get the remote tracking ref for the current branch (e.g. "origin/main").
 */
export function getRemoteTrackingRef(repoRoot) {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { ...GIT_OPTS, cwd: repoRoot }).trim();
    const upstream = execSync(`git rev-parse --abbrev-ref "${branch}@{upstream}"`, { ...GIT_OPTS, cwd: repoRoot }).trim();
    return upstream;
  } catch {
    return null;
  }
}

/**
 * Get the commit SHA for a ref (e.g. "origin/main").
 */
export function getRefCommit(repoRoot, ref) {
  try {
    return execSync(`git rev-parse "${ref}"`, { ...GIT_OPTS, cwd: repoRoot }).trim();
  } catch {
    return null;
  }
}

/**
 * Check if the working tree has uncommitted changes (staged or unstaged).
 */
export function hasUncommittedChanges(repoRoot) {
  try {
    const status = execSync('git status --porcelain', { ...GIT_OPTS, cwd: repoRoot }).trim();
    return status.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get diff for a file against a specific ref (not HEAD).
 */
export function getDiffAgainst(ref, repoRoot, relPath) {
  try {
    return execSync(`git diff "${ref}" -- "${relPath}"`, { ...GIT_OPTS, cwd: repoRoot });
  } catch {
    return '';
  }
}

/**
 * Get file change statistics against a specific ref.
 */
export function getStatusAgainst(ref, repoRoot, relPath) {
  try {
    const stat = execSync(`git diff --numstat "${ref}" -- "${relPath}"`, { ...GIT_OPTS, cwd: repoRoot }).trim();
    if (!stat) return { status: '?', lines_added: 0, lines_removed: 0 };
    const [a, r] = stat.split('\t');
    return {
      status: 'M',
      lines_added: parseInt(a, 10) || 0,
      lines_removed: parseInt(r, 10) || 0,
    };
  } catch {
    return { status: '?', lines_added: 0, lines_removed: 0 };
  }
}

/**
 * Get all locally modified files (unstaged + staged vs HEAD).
 */
export function allModifiedFiles(repoRoot) {
  try {
    const out = execSync('git diff HEAD --name-only', { ...GIT_OPTS, cwd: repoRoot }).trim();
    if (!out) return [];
    return out.split('\n').map(f => path.resolve(repoRoot, f));
  } catch {
    return [];
  }
}
