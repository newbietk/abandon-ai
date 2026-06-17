---
name: academic_research
description: 学术论文检索与分析。多轮 Tavily 搜索 → 去重汇总 → 深度分析 → 撰写学术研究报告。侧重 arXiv、会议论文、文献综述等学术源，深入原理、方法论和底层分析。
type: skill
version: 3.0.0
author: deep-research
tags: [academic, paper, arxiv, research, literature, scholar, deep-analysis]
---

# academic_research

学术论文与研究文献的深度检索与分析。三阶段流水线：**Search Pipeline**（脚本驱动，5 轮递进检索）→ **Analysis**（AI 驱动深度分析）→ **Persist**（脚本驱动，不删除过程数据）。

## 完整工作流（8 步）

### Phase A — Search Pipeline（扩展至 5 轮）

#### Step 1: 构造查询

根据上游 keyword_splitter 输出的 academic 维度关键词构造 5 组递进式检索查询，**每组查询应覆盖不同的深度层次**：

- **第 1 轮（广度扫描 — surface 层）:** `"<topic> survey OR review OR taxonomy site:arxiv.org"` — 获取领域全景图、经典综述
- **第 2 轮（方法深挖 — principle 层）:** `"<specific_method> <topic> methodology OR algorithm 2024 2025 site:arxiv.org OR site:openreview.net"` — 深入具体方法的数学原理、算法细节
- **第 3 轮（评估验证 — implementation 层）:** `"<topic> benchmark OR empirical evaluation OR ablation study OR failure analysis"` — 获取实验数据、已知局限
- **第 4 轮（理论根基）:** `"<topic> theoretical foundation OR formal analysis OR proof 2023 2024 2025"` — 追溯理论基础、形式化分析
- **第 5 轮（前沿突破）：** `"<topic> novel approach OR breakthrough OR state-of-the-art 2025 site:arxiv.org"` — 获取最新突破性进展

> **域偏好:** `site:arxiv.org` | `site:openreview.net` | `site:aclanthology.org` | `site:semanticscholar.org` | `site:papers.nips.cc` | `site:proceedings.mlr.press`

> **重要:** 每轮查询必须有明确区分度，避免不同轮次检索相同类型内容。如果上游关键词不足 5 组，根据主题自行扩展。

#### Step 2: 执行多轮检索

```bash
python .wflow/scripts/tavily-search.py -n 10 -d advanced \
  "<query_round_1>" > academic_out/raw_r1.json

python .wflow/scripts/tavily-search.py -n 10 -d advanced \
  "<query_round_2>" > academic_out/raw_r2.json

python .wflow/scripts/tavily-search.py -n 10 -d advanced \
  "<query_round_3>" > academic_out/raw_r3.json

python .wflow/scripts/tavily-search.py -n 10 -d advanced \
  "<query_round_4>" > academic_out/raw_r4.json

python .wflow/scripts/tavily-search.py -n 10 -d advanced \
  "<query_round_5>" > academic_out/raw_r5.json
```

#### Step 3: 合并 + 去重

```bash
python .wflow/scripts/dedup_db.py merge \
  -q "<query_round_1>" \
     "<query_round_2>" \
     "<query_round_3>" \
     "<query_round_4>" \
     "<query_round_5>" \
  academic_out/raw_r1.json academic_out/raw_r2.json academic_out/raw_r3.json \
  academic_out/raw_r4.json academic_out/raw_r5.json \
  | python .wflow/scripts/dedup_db.py filter --skill academic -i - \
  -o academic_out/deduped.json
```

### Phase B — Analysis

#### Step 4: 相关性筛选 + 深度内容获取

阅读 `academic_out/deduped.json` 逐条判断并写入 `academic_out/result.json`：

**筛选原则（强化版）:**
- ✅ 保留：学术源（arxiv/会议/期刊）、直接相关、含方法/实验数据/理论分析、可获取全文
- ❌ 移除：纯新闻/博客、仅提及关键字、过时（3 年前且无后续引用）、仅有摘要无实质内容
- ⚡ 优先：有开源代码、有后续引用、有多个独立团队验证、揭示方法论局限的论文

**深度内容获取（新增 — 关键步骤）:**
对于标记为 `relevance: "high"` 的论文（至少 8 篇），使用 WebFetch 获取论文全文内容（或详细页面），提取：
- 核心算法/方法的伪代码或数学描述
- 关键实验数据和图表结论
- 作者讨论的方法局限和未来工作
- 与其他方法的对比细节

将这些深度信息写入 result.json 的 `deep_content` 字段：

```json
{
  "meta": {
    "skill": "academic",
    "topic": "研究主题",
    "search_date": "2026-06-16",
    "final_count": 18,
    "deep_fetched_count": 10,
    "search_rounds": [
      {"round": 1, "query": "...", "results_count": 10, "depth": "surface"},
      {"round": 2, "query": "...", "results_count": 10, "depth": "principle"},
      {"round": 3, "query": "...", "results_count": 10, "depth": "implementation"},
      {"round": 4, "query": "...", "results_count": 10, "depth": "principle"},
      {"round": 5, "query": "...", "results_count": 10, "depth": "surface"}
    ]
  },
  "results": [
    {
      "title": "Chain-of-Thought Prompting Elicits Reasoning in LLMs",
      "url": "https://arxiv.org/abs/2201.11903",
      "content": "We explore how generating a chain of thought...",
      "deep_content": "## Method Summary\n...\n## Key Algorithm\n...\n## Key Results\n...\n## Limitations\n...",
      "score": 0.95,
      "relevance": "high",
      "relevance_note": "开创性工作，直接相关",
      "depth": "principle",
      "_round": 2
    }
  ]
}
```

#### Step 5: 撰写深度学术报告

基于 `result.json` 中的深度内容撰写 `academic_out/academic_report.md`：

```markdown
# {Topic} — 学术深度研究报告

> 生成时间: {date} | 有效结果: {count} 条 | 深度获取: {N} 篇 | 检索: 5 轮（覆盖 surface/principle/implementation 三层）

---

## 1. 检索概览
（主题、日期、检索轮次与深度层次映射、来源分布、去重统计）

## 2. 核心发现
（4-6 条宏观发现，每条必须包含：
  - 发现陈述（1 句话）
  - 原理/机制解释（2-3 句话，说明为什么会有这个发现，背后的理论基础是什么）
  - 证据来源（引用具体论文和方法）
  - 局限或争议（如果有））

## 3. 理论基础与形式化分析
（新增章节 — 深入分析方法背后的数学/理论根基）
### 3.1 核心问题的形式化定义
### 3.2 关键理论的数学直觉
### 3.3 理论局限与开放问题

## 4. 方法深度剖析
（按方法流派分组，对每个关键方法包含：）
### 4.1 {方法A}
- **核心思想**：用一段话说清楚 intuition
- **算法概要**：关键步骤的伪代码或数学描述
- **关键创新**：与之前方法的本质区别
- **实验证据**：关键 benchmark 结果（含数字）
- **已知局限**：论文自述 + 后续验证的缺陷
- **适用场景**：什么条件下有效/无效

### 4.2 {方法B}
...

## 5. 研究趋势与流派演进
（领域发展脉络、各阶段的关键突破和驱动力、主要技术路线对比）

## 6. 方法论对比矩阵
| 维度 | 方法A | 方法B | 方法C | 方法D |
|------|-------|-------|-------|-------|
| 理论基础 | | | | |
| 核心机制 | | | | |
| 时间复杂度 | | | | |
| 关键优势 | | | | |
| 主要局限 | | | | |
| 适用场景 | | | | |
| 代表论文 | | | | |
| 代码开源 | | | | |

## 7. 开放问题与未来方向
（基于多篇论文 limitations 章节的交叉综合，2-3 个最关键的开放问题）

## 8. 建议阅读清单
| # | 论文 | URL | 重要度 | 阅读优先级 | 理由 |
|---|------|-----|--------|-----------|------|
| 1 | | | ★★★★★ | 必读 | |
| 2 | | | ★★★★☆ | 推荐 | |
| 3 | | | ★★★☆☆ | 选读 | |

## 9. 参考来源
| # | 标题 | URL | 相关度 | 深度层级 | 检索轮次 |
|---|------|-----|--------|---------|----------|
```

### Phase C — Persist

#### Step 6: 深度内容补充（可选 — 如果 deep_content 不足）

如果深度获取的论文少于 8 篇，使用 WebFetch 对高相关度论文补充获取。

#### Step 7: 记录到数据库

```bash
python .wflow/scripts/dedup_db.py add --skill academic \
  -i academic_out/result.json -p
```

#### Step 8: 保留过程数据

> **不再删除过程数据。** 保留所有 `raw_r*.json` 和 `deduped.json` 文件，以便后续审查检索质量和调整策略。

---

## 查询策略参考

### 学术术语替换

| 口语/中文 | 学术术语 |
|-----------|---------|
| "怎么让 AI 推理" | "LLM reasoning capability" |
| "大模型微调" | "parameter-efficient fine-tuning LLM" |
| "知识问答" | "knowledge-grounded question answering" |

### 常用学术域限定

| 域 | 适用场景 |
|----|---------|
| `site:arxiv.org` | 预印本（最广覆盖） |
| `site:openreview.net` | ICLR/NeurIPS/ICML 审稿论文 |
| `site:aclanthology.org` | NLP 领域（ACL/EMNLP/NAACL） |
| `site:semanticscholar.org` | 跨领域学术索引 |
| `site:papers.nips.cc` | NeurIPS 正式论文集 |

### 深度查询模式

| 目的 | 模板 |
|------|------|
| 文献综述 | `"<topic> survey OR review OR taxonomy"` |
| 方法原理 | `"<method> algorithm OR mechanism OR formulation"` |
| 理论基础 | `"<topic> theoretical analysis OR proof OR foundation"` |
| 对比评估 | `"<topic> benchmark OR empirical study OR ablation"` |
| 局限分析 | `"<topic> limitation OR failure case OR robustness"` |
| 前沿突破 | `"<topic> novel approach OR state-of-the-art 2025"` |

### 深度层次标记

每轮检索应标记其深度层次，确保覆盖完整：
- **surface** — 领域全景、综述、分类法
- **principle** — 数学原理、理论根基、形式化分析
- **implementation** — 算法细节、实验设计、评估方法

5 轮检索中，应至少有 2 轮 principle 层 + 1 轮 implementation 层。

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `TAVILY_API_KEY` | 是 | Tavily API 密钥 |

## 依赖

仅 Python 标准库。
