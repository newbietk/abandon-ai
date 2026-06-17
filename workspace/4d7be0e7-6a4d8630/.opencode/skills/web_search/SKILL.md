---
name: web_search
description: Web search via Tavily API with SearXNG fallback. Returns structured results as JSON.
type: skill
version: 1.0.0
author: deep-research
tags: [search, tavily, searxng, web, serp]
---

# web_search

通过 Tavily Search API 进行网页搜索，支持 SearXNG 自托管回退。

## 快速开始

```bash
# 设置 API Key
export TAVILY_API_KEY="tvly-xxxxxxxxxxxxx"

# 命令行搜索
python scripts/search.py "2025 AI 芯片市场趋势"

# 管道输入
echo "NVIDIA 2025 GPU 市场份额" | python scripts/search.py

# 调整参数
python scripts/search.py -n 10 -d basic "最新 AI 新闻"
```

## 参数

| 参数 | 简写 | 默认值 | 说明 |
|------|------|--------|------|
| `query` | — | — | 搜索关键词（位置参数或 stdin） |
| `--max-results` | `-n` | `5` | 最大返回结果数 |
| `--depth` | `-d` | `advanced` | 搜索深度：`basic`（快速）或 `advanced`（深度） |
| `--pretty` | `-p` | `false` | 美化 JSON 输出 |

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `TAVILY_API_KEY` | 是 | Tavily API 密钥 |
| `SEARXNG_BASE_URL` | 否 | 自托管 SearXNG 地址（Tavily 失败时回退） |

## 输出格式

每条结果为包含 `title`、`url`、`content`、`score` 的 JSON 对象：

```json
[
  {
    "title": "NVIDIA AI芯片市场份额分析 2025",
    "url": "https://example.com/article",
    "content": "NVIDIA 在 2025 年占据约 80% 的 AI 训练芯片市场...",
    "score": 0.95
  }
]
```

出错时返回 `{"error": "..."}` 并以非零退出码退出。

## 搜索流程

```
用户查询
  │
  ▼
Tavily API ──成功──→ 返回结果
  │
  │ 失败
  ▼
SEARXNG_BASE_URL 是否配置？
  │
  ├── 否 ──→ 抛出 Tavily 原始错误
  │
  └── 是 ──→ 调用 SearXNG ──成功──→ 返回结果
                    │
                    └── 失败 ──→ 抛出 SearXNG 错误
```

## 在代码中调用

```python
from scripts.search import search

results = search("AI 芯片趋势", max_results=10, depth="advanced")
for r in results:
    print(f"{r['title']}: {r['url']}")
```

## 作为 cc-workflow Script 节点

```json
{
  "id": "web_search",
  "type": "script",
  "command": "python .wflow/web_search/scripts/search.py",
  "timeout_seconds": 60,
  "output": {
    "type": "array",
    "items": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "url": { "type": "string" },
        "content": { "type": "string" },
        "score": { "type": "number" }
      }
    }
  }
}
```

## 获取 Tavily API Key

1. 访问 [tavily.com](https://tavily.com)
2. 注册账号（免费每月 1000 次查询）
3. 在 Dashboard 复制 API Key
4. 设置为环境变量 `TAVILY_API_KEY`

## 依赖

仅使用 Python 标准库（`urllib`、`json`、`argparse`、`os`、`sys`），无需额外安装。
