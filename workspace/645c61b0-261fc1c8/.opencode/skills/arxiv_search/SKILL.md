---
name: arxiv_search
description: arXiv paper retrieval and summarization. Fetches metadata, abstract, and full-text from arXiv, with embedded LLM prompts for paper analysis.
type: skill
version: 1.0.0
author: deep-research
tags: [arxiv, paper, research, summarization, literature-review]
---

# arxiv_search

通过 arXiv API 获取论文元数据与摘要，可选获取全文（HTML 正文），内嵌提炼 prompt 供下游 LLM 使用。

## 快速开始

```bash
# 通过 arXiv ID 获取摘要 + 简洁提炼 prompt
python scripts/arxiv_paper.py "2401.12345"

# 通过 arXiv URL 获取
python scripts/arxiv_paper.py "https://arxiv.org/abs/2401.12345"

# 获取全文 + 深度分析 prompt
python scripts/arxiv_paper.py --full-text --summary deep "2401.12345"

# 管道输入
echo "https://arxiv.org/html/2401.12345v1" | python scripts/arxiv_paper.py -f
```

## 参数

| 参数 | 简写 | 默认值 | 说明 |
|------|------|--------|------|
| `input` | — | — | arXiv URL 或论文 ID（位置参数或 stdin） |
| `--full-text` | `-f` | `false` | 获取 HTML 全文正文（默认仅摘要） |
| `--summary` | `-s` | `concise` | 提炼类型：`concise` / `deep` / `compare` / `none` |
| `--pretty` | `-p` | `false` | 美化 JSON 输出 |

## 支持的输入格式

| 格式 | 示例 |
|------|------|
| 原始 ID | `2401.12345` |
| 带版本号 | `2401.12345v2` |
| abs 页面 | `https://arxiv.org/abs/2401.12345` |
| html 页面 | `https://arxiv.org/html/2401.12345v1` |
| pdf 链接 | `https://arxiv.org/pdf/2401.12345.pdf` |
| 旧式 ID | `quant-ph/0412100` |

## 输出格式

```json
{
  "status": "success",
  "paper_id": "2401.12345",
  "title": "Paper Title Here",
  "authors": ["Author One", "Author Two"],
  "categories": ["cs.AI", "cs.LG"],
  "published": "2024-01-15T00:00:00Z",
  "abstract": "This paper proposes a novel approach...",
  "urls": {
    "abs": "https://arxiv.org/abs/2401.12345",
    "html": "https://arxiv.org/html/2401.12345",
    "pdf": "https://arxiv.org/pdf/2401.12345"
  },
  "content": "Full text or abstract content...",
  "content_source": "full_text",
  "prompt": {
    "type": "summarize_paper",
    "instruction": "Produce a concise, technically accurate summary..."
  }
}
```

出错时返回 `{"error": "..."}` 并以非零退出码退出。

## 三种提炼 Prompt

### `concise`（默认）—— 适用于下游快速摘要

1. 问题与动机（2-3 句）
2. 核心方法（3-5 条要点）
3. 主要结果（指标、数据集、关键证据）
4. 优点与局限
5. 研究者的实用结论

### `deep` —— 适用于深入分析

- 执行摘要（贡献、问题、方法、结果、结论）
- 研究背景与相关工作
- 方法论分析（逐步拆解、创新点、理论基础、实现细节）
- 结果评估（实验设置、显著性、与 SOTA 对比）
- 实践影响与理论影响
- 未来方向与更广泛影响

### `compare` —— 适用于多篇论文横向对比

- 共享问题定义
- 方法对比表
- 结果对比
- 优缺点与失效模式
- 选型建议

## 工作流

```
上游传入 arXiv URL/ID
      │
      ▼
解析 arXiv ID
      │
      ├──→ arXiv API ──→ 获取标题/作者/摘要/分类
      │
      ├──→ (可选) arXiv HTML ──→ 提取全文正文
      │
      ▼
构建结构化输出
      │
      ├── 论文元数据
      ├── 摘要/正文内容
      └── 提炼 prompt（供下游 LLM 使用）
      │
      ▼
下游 LLM 按 prompt 指令提炼 → 进入下一步
```

## 在代码中调用

```python
from scripts.arxiv_paper import extract_arxiv_id, fetch_abstract, fetch_full_text, build_output

paper_id = extract_arxiv_id("https://arxiv.org/abs/2401.12345")
metadata = fetch_abstract(paper_id)
full_text = fetch_full_text(paper_id)  # optional
output = build_output(metadata, full_text, "deep")
print(output["prompt"]["instruction"])  # LLM 提炼指令
```

## 依赖

仅使用 Python 标准库（`urllib`、`json`、`argparse`、`os`、`sys`、`xml.etree.ElementTree`、`html.parser`、`re`），无需额外安装。
