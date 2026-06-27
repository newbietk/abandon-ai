# Session Diff Tracker

OpenCode 原生插件，自动追踪会话级别的 git diff 变更历史，生成可视化 HTML 报告。用户无感知，OC 启动即生效。

## 工作原理

```
OC 启动 → 自动加载插件 → 监听以下事件：
  session.created    → 初始化追踪会话（写 session.init）
  tool.execute.after → 截获 edit/write/multiedit/apply_patch（写 session.diff）
  session.diff       → 补采 git 仓库元信息（remote、branch、commit）
  session.idle       → 30s 防抖后收尾（写 session.checkpoint + 更新 HTML）
```

## 安装

将 `session-diff-tracker/` 放到项目根目录，然后执行：

```bash
node session-diff-tracker/install.mjs
```

这一条命令自动完成：
- 创建/更新 `.opencode/package.json`
- 注册 `session-diff-tracker` 为本地依赖
- 执行 `npm install` 建立符号链接
- 创建 `.opencode/plugins/session-diff-tracker.js` 入口文件

安装完成后重启 OpenCode 即生效，日志可见：

安装完成后重启 OpenCode 即生效，日志可见：

```
Session Diff Tracker loaded
```

## 输出文件

| 文件 | 路径 | 说明 |
|------|------|------|
| JSONL 数据 | `.project/memory/trace/session_diffs.jsonl` | 所有会话的 diff 记录，按行追加 |
| HTML 可视化 | `.project/memory/trace/session_diffs_viewer.html` | 每次 checkpoint 自动更新，浏览器直接打开 |
| 运行时状态 | `session-diff-tracker/tracker-state.json` | 插件内部状态，自动维护，勿手动编辑 |

> 输出目录可通过 `.kirinharness/config/layout.json` 中的 `paths.memory_root` 自定义，默认 `.project/memory/trace`。

## JSONL 记录格式

三种记录类型，每行一条 JSON：

```jsonc
// session.init — 会话开始
{ "type": "session.init", "session_id": "oc-xxx", "timestamp": "...", "operator": "opencode-agent", "cwd": "...", "reopen_of": null, "sequence": 0, "ext": {} }

// session.diff — 文件变更（每次工具操作产生一条，含完整 diff）
{ "type": "session.diff", "session_id": "oc-xxx", "timestamp": "...", "sequence": 1,
  "repo": { "root": "/path/to/repo", "remote_url": "git@...", "branch": "main", "latest_commit": "abc123", "latest_commit_msg": "fix: ..." },
  "tool": { "name": "edit" },
  "files": [{ "relative_path": "src/foo.py", "absolute_path": "/abs/path", "status": "M", "diff": "diff --git ...", "lines_added": 5, "lines_removed": 2, "hash_before": null, "hash_after": "sha256..." }],
  "ext": {}
}

// session.checkpoint — 会话收尾
{ "type": "session.checkpoint", "session_id": "oc-xxx", "timestamp": "...", "sequence": 3, "reason": "session.idle",
  "summary": { "total_files_touched": 3, "total_diff_entries": 2,
    "repos_involved": [{ "root": "/path/to/repo", "files": ["src/foo.py"] }],
    "files_final_state": { "/abs/path/src/foo.py": { "hash": "sha256...", "last_modified": "..." } } },
  "ext": {} }
```

## 手动操作

### 生成/更新 HTML 可视化

```bash
node session-diff-tracker/generate-viewer.mjs
```

可指定 JSONL 路径：

```bash
node session-diff-tracker/generate-viewer.mjs path/to/session_diffs.jsonl
```

### 生成测试数据

```bash
node .kirinharness/scripts/gen-test-data.mjs          # 生成 JSONL
node session-diff-tracker/generate-viewer.mjs          # 生成 HTML
```

## 常见问题

**插件没有自动加载？**
检查 `.opencode/node_modules/session-diff-tracker` 是否为指向本目录的符号链接，确保 `.opencode/package.json` 中已添加依赖并执行过 `npm install`。

**JSONL 文件没有生成？**
确认项目根目录存在 git 仓库，插件依赖 git 命令采集 diff。非 git 文件也会记录，但 diff 字段为 `(not in a git repository)`。

**Idle 防抖机制说明？**
每次 `session.idle` 事件触发后等待 30 秒，期间如果有新的工具调用则重置计时器，无活动则执行 checkpoint。超过 5 分钟无活动会强制写 checkpoint 兜底。
