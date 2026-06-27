#!/usr/bin/env node
/**
 * Generate an interactive HTML viewer for session_diffs.jsonl.
 *
 * Usage:
 *   node generate-viewer.mjs [path/to/session_diffs.jsonl]
 *
 * Output: session_diffs_viewer.html (in same directory as JSONL)
 */
import fs from 'node:fs';
import path from 'node:path';
import { jsonlPath } from './jsonl-writer.mjs';

const defaultJsonl = jsonlPath(process.cwd());
const absJsonl = path.resolve(process.argv[2] || defaultJsonl);

if (!fs.existsSync(absJsonl)) {
  console.error(`File not found: ${absJsonl}`);
  process.exit(1);
}

// Read and parse JSONL
const lines = fs.readFileSync(absJsonl, 'utf-8').trim().split('\n').filter(Boolean);
const records = lines.map(l => JSON.parse(l));

// Group records by session
const sessions = new Map();
for (const r of records) {
  const sid = r.session_id;
  if (!sessions.has(sid)) sessions.set(sid, { init: null, diffs: [], checkpoint: null });
  const s = sessions.get(sid);
  if (r.type === 'session.init') s.init = r;
  else if (r.type === 'session.diff') s.diffs.push(r);
  else if (r.type === 'session.checkpoint') s.checkpoint = r;
}

// Build data for embedding
const sessionList = [];
const sessionMap = new Map();
for (const [sid, s] of sessions) {
  const totalAdded = s.diffs.reduce((sum, d) => sum + d.files.reduce((s2, f) => s2 + (f.lines_added || 0), 0), 0);
  const totalRemoved = s.diffs.reduce((sum, d) => sum + d.files.reduce((s2, f) => s2 + (f.lines_removed || 0), 0), 0);
  const allFiles = new Set();
  for (const d of s.diffs) {
    for (const f of d.files) allFiles.add(f.relative_path);
  }

  // Effective time: latest of checkpoint, last diff, or init
  let latestTs = s.init?.timestamp || '';
  if (s.checkpoint?.timestamp && s.checkpoint.timestamp > latestTs) latestTs = s.checkpoint.timestamp;
  const lastDiff = s.diffs[s.diffs.length - 1];
  if (lastDiff?.timestamp && lastDiff.timestamp > latestTs) latestTs = lastDiff.timestamp;

  const entry = {
    id: sid,
    init: s.init,
    diffs: s.diffs,
    checkpoint: s.checkpoint,
    fileCount: allFiles.size,
    totalAdded,
    totalRemoved,
    latestTs,
  };
  sessionList.push(entry);
  sessionMap.set(sid, entry);
}

// Propagate reopen timestamps: if B reopens A, A's time extends to B's time
for (const entry of sessionList) {
  const reopenOf = entry.init?.reopen_of;
  if (reopenOf && sessionMap.has(reopenOf)) {
    const parent = sessionMap.get(reopenOf);
    if (entry.latestTs > parent.latestTs) {
      parent.latestTs = entry.latestTs;
      parent._reopenedBy = entry.id;
    }
  }
}

// Sort descending by effective time (newest first)
sessionList.sort((a, b) => b.latestTs.localeCompare(a.latestTs));

// Update display timestamp to effective time for the HTML template
for (const entry of sessionList) {
  if (entry.init) entry.init.timestamp = entry.latestTs;
}

const outPath = path.join(path.dirname(absJsonl), 'session_diffs_viewer.html');
const html = renderHTML(sessionList, absJsonl);
fs.writeFileSync(outPath, html, 'utf-8');
console.log(`Viewer generated: ${outPath} (${sessionList.length} sessions, ${records.length} records)`);

// ── HTML template ──────────────────────────────────────────────────────────

function renderHTML(sessions, sourcePath) {
  const dataJSON = JSON.stringify(sessions).replace(/<\//g, '<\\/');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Session Diff Viewer — ${path.basename(path.dirname(sourcePath))}</title>
<style>
  :root {
    --bg: #1a1a2e; --card-bg: #16213e; --border: #0f3460;
    --text: #e0e0e0; --text-dim: #8892b0; --accent: #e94560;
    --green: #00c853; --red: #ff5252; --blue: #448aff;
    --diff-add-bg: #1b3a2a; --diff-del-bg: #3a1b1b;
    --diff-add-line: #2d5a3a; --diff-del-line: #5a2d2d;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); line-height:1.6; }
  .header { background: var(--card-bg); border-bottom:2px solid var(--accent); padding:24px 32px; position:sticky; top:0; z-index:10; }
  .header h1 { font-size:1.6rem; color:var(--accent); }
  .header .meta { color:var(--text-dim); font-size:0.85rem; margin-top:4px; }
  .stats { display:flex; gap:24px; margin-top:12px; flex-wrap:wrap; }
  .stat { background:var(--bg); border-radius:8px; padding:8px 16px; }
  .stat .num { font-size:1.4rem; font-weight:700; color:var(--blue); }
  .stat .label { font-size:0.75rem; color:var(--text-dim); }
  .container { max-width:1200px; margin:0 auto; padding:24px; }
  .session { background:var(--card-bg); border:1px solid var(--border); border-radius:12px; margin-bottom:24px; overflow:hidden; }
  .session-header { padding:16px 24px; cursor:pointer; display:flex; align-items:center; justify-content:space-between; user-select:none; }
  .session-header:hover { background:rgba(233,69,96,0.05); }
  .session-id { font-family:monospace; font-size:0.85rem; color:var(--blue); }
  .session-time { font-size:0.8rem; color:var(--text-dim); }
  .session-badge { display:inline-block; padding:2px 8px; border-radius:12px; font-size:0.7rem; font-weight:600; }
  .badge-reopen { background:rgba(68,138,255,0.2); color:var(--blue); }
  .badge-new { background:rgba(0,200,83,0.2); color:var(--green); }
  .session-stats { display:flex; gap:16px; align-items:center; }
  .session-stat { font-size:0.8rem; }
  .session-stat .val { font-weight:700; }
  .session-body { display:none; padding:0 24px 16px; border-top:1px solid var(--border); }
  .session.open .session-body { display:block; }
  .repo-card { background:var(--bg); border-radius:8px; padding:12px 16px; margin:12px 0; }
  .repo-info { font-size:0.8rem; color:var(--text-dim); margin-bottom:8px; }
  .repo-info span { margin-right:16px; }
  .repo-info .label { color:var(--text-dim); }
  .file-entry { margin:8px 0; }
  .file-header { display:flex; align-items:center; gap:8px; padding:6px 8px; cursor:pointer; border-radius:4px; }
  .file-header:hover { background:rgba(255,255,255,0.03); }
  .file-path { font-family:monospace; font-size:0.85rem; }
  .file-stat { font-size:0.75rem; }
  .file-stat.add { color:var(--green); }
  .file-stat.del { color:var(--red); }
  .diff-block { display:none; margin:4px 0 8px 16px; font-family:'Cascadia Code','Fira Code',monospace; font-size:0.8rem; overflow-x:auto; }
  .file-entry.open .diff-block { display:block; }
  .diff-line { padding:0 8px; white-space:pre; line-height:1.5; }
  .diff-line.add { background:var(--diff-add-line); color:#a5d6a7; }
  .diff-line.del { background:var(--diff-del-line); color:#ef9a9a; }
  .diff-line.hdr { color:var(--blue); font-weight:600; }
  .diff-line.ctx { color:var(--text-dim); }
  .content-block { display:none; margin:4px 0 8px 16px; }
  .file-entry.open .content-block { display:block; }
  .content-block summary { cursor:pointer; font-size:0.75rem; color:var(--blue); padding:4px 0; }
  .content-block pre { background:var(--bg); border:1px solid var(--border); border-radius:4px; padding:8px 12px; font-family:'Cascadia Code','Fira Code',monospace; font-size:0.78rem; overflow-x:auto; max-height:400px; white-space:pre; color:var(--text); margin:0; }
  .content-truncated { font-size:0.7rem; color:var(--accent); margin-top:2px; }
  .no-diff { color:var(--text-dim); font-style:italic; font-size:0.8rem; padding:4px 8px; }
  .checkpoint { background:var(--bg); border-radius:8px; padding:12px 16px; margin:12px 0; border-left:3px solid var(--blue); }
  .checkpoint-title { font-size:0.8rem; color:var(--blue); font-weight:600; margin-bottom:8px; }
  .checkpoint-files { font-size:0.8rem; color:var(--text-dim); }
  .checkpoint-files code { color:var(--text); }
  .timeline-dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:8px; }
  .timeline-dot.init { background:var(--blue); }
  .timeline-dot.diff { background:var(--accent); }
  .timeline-dot.checkpoint { background:var(--green); }
  .empty-state { text-align:center; padding:48px; color:var(--text-dim); }
  .non-git-badge { background:rgba(255,82,82,0.15); color:var(--red); font-size:0.7rem; padding:1px 6px; border-radius:8px; }
  @media (max-width:768px) {
    .container { padding:12px; }
    .session-header { flex-direction:column; align-items:flex-start; gap:8px; }
    .stats { gap:12px; }
  }
</style>
</head>
<body>

<div class="header">
  <h1>&#128736; Session Diff Viewer</h1>
  <div class="meta">Source: ${path.basename(sourcePath)} &mdash; ${path.dirname(path.resolve(sourcePath))}</div>
  <div class="stats" id="summary-stats"></div>
</div>

<div class="container" id="sessions-container"></div>

<script type="application/json" id="sessions-data">${dataJSON}</script>
<script>
const SESSIONS = JSON.parse(document.getElementById('sessions-data').textContent);

// ── Render ──────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtTime(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('zh-CN', { hour12:false });
}

function fmtShort(sid) {
  return sid ? sid.slice(0,16) + '...' : '-';
}

function renderDiff(diffText) {
  if (!diffText || diffText === '(no diff)' || diffText.startsWith('(not in a git') || diffText.startsWith('(no diff')) {
    return '<div class="no-diff">' + escapeHtml(diffText || '') + '</div>';
  }
  const lines = diffText.split('\\n');
  return lines.map(line => {
    let cls = 'ctx';
    if (line.startsWith('@@')) cls = 'hdr';
    else if (line.startsWith('+')) cls = 'add';
    else if (line.startsWith('-')) cls = 'del';
    else if (line.startsWith('diff --git') || line.startsWith('---') || line.startsWith('+++')) cls = 'hdr';
    return '<div class="diff-line ' + cls + '">' + escapeHtml(line) + '</div>';
  }).join('');
}

function renderSession(s, idx) {
  const isReopen = s.init?.reopen_of;
  const fileCount = s.fileCount;
  const added = s.totalAdded;
  const removed = s.totalRemoved;

  return '<div class="session" id="session-' + idx + '">' +
    '<div class="session-header" onclick="this.parentElement.classList.toggle(\\'open\\')">' +
      '<div>' +
        '<span class="timeline-dot init"></span>' +
        '<span class="session-id">' + escapeHtml(fmtShort(s.id)) + '</span>' +
        (isReopen ? ' <span class="session-badge badge-reopen">续接</span>' : ' <span class="session-badge badge-new">新建</span>') +
        '<div class="session-time">' + fmtTime(s.init?.timestamp) + '</div>' +
      '</div>' +
      '<div class="session-stats">' +
        '<span class="session-stat"><span class="val">' + fileCount + '</span> 文件</span>' +
        '<span class="session-stat" style="color:var(--green)">+<span class="val">' + added + '</span></span>' +
        '<span class="session-stat" style="color:var(--red)">-<span class="val">' + removed + '</span></span>' +
        '<span class="session-stat" style="color:var(--text-dim)">' + s.diffs.length + ' 快照</span>' +
      '</div>' +
    '</div>' +
    '<div class="session-body">' +
      (isReopen ? '<div style="font-size:0.8rem;color:var(--text-dim);margin-bottom:8px">续接自: <code>' + escapeHtml(fmtShort(isReopen)) + '</code></div>' : '') +
      renderDiffs(s) +
      renderCheckpoint(s) +
    '</div>' +
  '</div>';
}

function renderDiffs(s) {
  if (s.diffs.length === 0) return '<div class="no-diff">无文件变更记录</div>';
  return s.diffs.map((d, di) => {
    const repo = d.repo;
    const isNonGit = !repo;
    return '<div class="repo-card">' +
      (isNonGit
        ? '<div class="repo-info"><span class="non-git-badge">非 git 仓库</span></div>'
        : '<div class="repo-info">' +
            '<span><span class="label">remote:</span> ' + escapeHtml(repo.remote_url || '(none)') + '</span>' +
            '<span><span class="label">branch:</span> ' + escapeHtml(repo.branch || '?') + '</span>' +
            '<span><span class="label">commit:</span> <code>' + escapeHtml((repo.latest_commit||'').slice(0,8)) + '</code></span>' +
            '<span><span class="label">msg:</span> ' + escapeHtml(repo.latest_commit_msg || '') + '</span>' +
          '</div>') +
      '<div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:4px">快照 #' + (di+1) + ' &middot; ' + fmtTime(d.timestamp) + ' &middot; 工具: ' + escapeHtml(d.tool?.name || '') + '</div>' +
      d.files.map((f, fi) =>
        '<div class="file-entry" id="file-' + d.sequence + '-' + fi + '">' +
          '<div class="file-header" onclick="this.parentElement.classList.toggle(\\'open\\')">' +
            '<span style="font-size:0.8rem;">&#9654;</span>' +
            '<span class="file-path">' + escapeHtml(f.relative_path) + '</span>' +
            (f.lines_added > 0 ? '<span class="file-stat add">+' + f.lines_added + '</span>' : '') +
            (f.lines_removed > 0 ? '<span class="file-stat del">-' + f.lines_removed + '</span>' : '') +
            (f.deleted ? '<span style="font-size:0.7rem;color:var(--red);margin-left:4px">已删除</span>' : '') +
            (f.hash_after && !f.deleted ? '<span style="font-size:0.65rem;color:var(--text-dim);margin-left:auto">' + escapeHtml(f.hash_after.slice(0,12)) + '</span>' : '') +
          '</div>' +
          '<div class="diff-block">' + renderDiff(f.diff) + '</div>' +
          (f.deleted ? '<div class="no-diff">文件已删除</div>' : '') +
          (f.content_after && !f.deleted ? '<div class="content-block"><details><summary>文件内容 (' + f.content_after.length + ' 字符' + (f.content_truncated ? ', 已截断' : '') + ')</summary><pre>' + escapeHtml(f.content_after) + '</pre>' + (f.content_truncated ? '<div class="content-truncated">内容超过 50KB，已截断</div>' : '') + '</details></div>' : '') +
        '</div>'
      ).join('') +
    '</div>';
  }).join('');
}

function renderCheckpoint(s) {
  if (!s.checkpoint) return '';
  const c = s.checkpoint;
  const files = c.summary?.files_final_state || {};
  const repos = c.summary?.repos_involved || [];
  return '<div class="checkpoint">' +
    '<div class="checkpoint-title">&#9872; 会话结束 &middot; ' + fmtTime(c.timestamp) + ' &middot; ' + escapeHtml(c.reason || '') + '</div>' +
    '<div class="checkpoint-files">' +
      '共 <strong>' + (c.summary?.total_files_touched || 0) + '</strong> 个文件，' +
      '<strong>' + repos.length + '</strong> 个仓库' +
    '</div>' +
    (Object.keys(files).length > 0
      ? '<div class="checkpoint-files" style="margin-top:8px">' +
          Object.entries(files).map(([fp, info]) =>
            '<div><code>' + escapeHtml(fp) + '</code> <span style="color:var(--text-dim)">sha256:' + escapeHtml((info.hash||'').slice(0,16)) + '...</span></div>'
          ).join('') +
        '</div>'
      : '') +
  '</div>';
}

// ── Summary stats ───────────────────────────────────────────────────────
function renderStats() {
  const totalFiles = new Set();
  let totalAdd = 0, totalDel = 0, totalDiffs = 0;
  const allRepos = new Set();
  for (const s of SESSIONS) {
    totalAdd += s.totalAdded;
    totalDel += s.totalRemoved;
    totalDiffs += s.diffs.length;
    for (const d of s.diffs) {
      for (const f of d.files) totalFiles.add(f.relative_path);
      if (d.repo?.remote_url) allRepos.add(d.repo.remote_url);
    }
  }
  document.getElementById('summary-stats').innerHTML =
    '<div class="stat"><div class="num">' + SESSIONS.length + '</div><div class="label">会话</div></div>' +
    '<div class="stat"><div class="num">' + totalDiffs + '</div><div class="label">diff 快照</div></div>' +
    '<div class="stat"><div class="num">' + totalFiles.size + '</div><div class="label">涉及文件</div></div>' +
    '<div class="stat"><div class="num" style="color:var(--green)">+' + totalAdd + '</div><div class="label">行新增</div></div>' +
    '<div class="stat"><div class="num" style="color:var(--red)">-' + totalDel + '</div><div class="label">行删除</div></div>' +
    '<div class="stat"><div class="num">' + allRepos.size + '</div><div class="label">仓库</div></div>';
}

// ── Init ────────────────────────────────────────────────────────────────
if (SESSIONS.length === 0) {
  document.getElementById('sessions-container').innerHTML = '<div class="empty-state">暂无会话记录</div>';
} else {
  document.getElementById('sessions-container').innerHTML = SESSIONS.map((s, i) => renderSession(s, i)).join('');
  // Auto-open the latest session
  const last = document.getElementById('session-' + (SESSIONS.length - 1));
  if (last) last.classList.add('open');
}
renderStats();
</script>
</body>
</html>`;
}
