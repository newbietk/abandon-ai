---
name: practical_research
description: 实践技术深度检索与分析。多轮 Tavily 搜索 → 去重汇总 → 深度技术分析 → 撰写工程实践报告。侧重源码架构、设计模式、性能基准、生产部署，深入原理和底层分析。
type: skill
version: 3.0.0
author: deep-research
tags: [practical, engineering, architecture, performance, production, open-source, deep-analysis]
---

# practical_research

实践技术的深度检索与分析。三阶段流水线：**Search Pipeline**（脚本驱动，5 轮递进检索）→ **Analysis**（AI 驱动深度技术分析）→ **Persist**（脚本驱动，保留过程数据）。

## 核心定位

本 skill 的目标是产出**工程技术分析报告**，而非工具列表或教程汇总。每个收录的工具/项目必须有架构剖析、设计模式提炼、性能特征分析和生产就绪度评估。

## 完整工作流（8 步）

### Phase A — Search Pipeline（5 轮递进检索）

#### Step 1: 构造查询

根据上游 keyword_splitter 输出的 practice 维度关键词构造 5 组递进式检索查询：

- **第 1 轮（开源项目发现 — surface 层）:** `"<topic> open source framework tool site:github.com stars:>100"` — 发现主流开源项目
- **第 2 轮（架构与设计模式 — principle 层）:** `"<topic> architecture design pattern OR system design OR data flow site:engineering. OR site:github.com"` — 深入架构层面
- **第 3 轮（性能与基准 — implementation 层）:** `"<topic> benchmark OR performance evaluation OR scalability test OR profiling"` — 获取性能数据
- **第 4 轮（生产部署 — implementation 层）:** `"<topic> production deployment OR monitoring OR troubleshooting OR migration guide best practices"` — 获取生产级实践经验
- **第 5 轮（源码深度分析）:** `"<top_tool> source code analysis OR internals OR how it works under the hood"` — 对前 3 个最重要的工具进行源码级挖掘

> **域偏好（工程技术源）:**
> - 源码与文档：`site:github.com` | `site:gitlab.com` | `site:readthedocs.io` | `site:pypi.org`
> - 工程博客：`site:engineering.fb.com` | `site:netflixtechblog.com` | `site:slack.engineering` | `site:eng.uber.com` | `site:blog.cloudflare.com` | `site:stripe.com/blog/engineering`
> - 技术问答：`site:stackoverflow.com` (high-score only) | `site:discuss.pytorch.org` | `site:github.com/*/discussions`
> - 深度技术文章：`site:lilianweng.github.io` | `site:jaykmody.com` | `site:karpathy.github.io`

> **源质量红线（新增 — 关键）:**
> - ✅ 优先：GitHub 项目 README/源码（>100 stars）、官方文档、工程博客、Stack Overflow 高赞回答（>50 votes）、顶会 workshop 的 engineering track 论文
> - ⚠️ 谨慎使用：个人博客（需交叉验证）、Medium/Dev.to 技术文章（需查看作者背景）
> - ❌ 禁止使用：内容农场（csdn.net 非原创内容、低质转载）、无署名/无日期的匿名文章、纯营销/SEO 内容
> - 🌐 语言偏好：英文优先（全球技术社区内容更深入），中文仅使用权威技术博客/官方文档翻译

#### Step 2: 执行多轮检索

```bash
python .wflow/scripts/tavily-search.py -n 10 -d advanced \
  "<query_round_1>" > practical_out/raw_r1.json

python .wflow/scripts/tavily-search.py -n 10 -d advanced \
  "<query_round_2>" > practical_out/raw_r2.json

python .wflow/scripts/tavily-search.py -n 10 -d advanced \
  "<query_round_3>" > practical_out/raw_r3.json

python .wflow/scripts/tavily-search.py -n 10 -d advanced \
  "<query_round_4>" > practical_out/raw_r4.json

python .wflow/scripts/tavily-search.py -n 10 -d advanced \
  "<query_round_5>" > practical_out/raw_r5.json
```

#### Step 3: 合并 + 去重

```bash
python .wflow/scripts/dedup_db.py merge \
  -q "<query_round_1>" \
     "<query_round_2>" \
     "<query_round_3>" \
     "<query_round_4>" \
     "<query_round_5>" \
  practical_out/raw_r1.json practical_out/raw_r2.json practical_out/raw_r3.json \
  practical_out/raw_r4.json practical_out/raw_r5.json \
  | python .wflow/scripts/dedup_db.py filter --skill practical -i - \
  -o practical_out/deduped.json
```

### Phase B — Analysis

#### Step 4: 相关性筛选 + 深度技术分析

阅读 `practical_out/deduped.json` 逐条判断并写入 `practical_out/result.json`：

**筛选原则（强化版）:**
- ✅ 保留：含具体架构/实现细节、有性能数据、有生产案例、代码活跃（近 12 个月维护）、文档完整
- ❌ 移除：仅概念介绍无实操、已归档废弃项目、低质量教程（无技术深度）、纯工具列表对比无分析
- ⚡ 优先：有公开 benchmark、有知名企业生产案例、源码架构清晰、有详细的设计决策记录（ADR/RFC）

**深度技术分析（新增 — 关键步骤）:**
对 `relevance: "high"` 的项目/来源（至少 8 个），使用 WebFetch 获取深度内容，重点提取：
- 核心架构设计（组件图、数据流、关键抽象）
- 关键算法/数据结构的实现策略
- 性能特征（吞吐量、延迟、资源消耗）
- 设计模式与最佳实践
- 生产环境的已知问题与解决方案

```json
{
  "meta": {
    "skill": "practical",
    "topic": "研究主题",
    "search_date": "2026-06-16",
    "final_count": 20,
    "deep_analyzed_count": 10,
    "search_rounds": [
      {"round": 1, "query": "...", "results_count": 10, "depth": "surface"},
      {"round": 2, "query": "...", "results_count": 10, "depth": "principle"},
      {"round": 3, "query": "...", "results_count": 10, "depth": "implementation"},
      {"round": 4, "query": "...", "results_count": 10, "depth": "implementation"},
      {"round": 5, "query": "...", "results_count": 10, "depth": "principle"}
    ]
  },
  "results": [
    {
      "title": "项目名称",
      "url": "https://github.com/author/project",
      "content": "项目简介...",
      "deep_content": "## 架构分析\n...\n## 关键实现\n...\n## 性能特征\n...\n## 设计模式\n...\n## 生产注意事项\n...",
      "score": 0.95,
      "relevance": "high",
      "relevance_note": "核心开源项目，架构设计优秀",
      "source_type": "github",
      "depth": "principle",
      "_round": 1
    }
  ]
}
```

**source_type 分类:**
| 类型 | 说明 | 深度要求 |
|------|------|---------|
| `github` | GitHub/GitLab 仓库 | 必须包含架构分析和代码组织 |
| `official_docs` | 官方文档 | 必须引用具体章节和 API |
| `engineering_blog` | 企业工程博客 | 必须提取设计决策和 trade-off |
| `benchmark` | 性能基准/测试报告 | 必须包含具体数字和测试条件 |
| `deep_tutorial` | 深度技术教程 | 必须评估作者权威性和内容深度 |
| `academic_code` | 学术论文配套代码 | 必须关联论文方法 |

#### Step 5: 撰写工程实践深度报告

基于 `result.json` 中的深度分析撰写 `practical_out/practical_report.md`：

```markdown
# {Topic} — 工程实践深度分析报告

> 生成时间: {date} | 有效结果: {count} 条 | 深度分析: {N} 个项目 | 检索: 5 轮

---

## 1. 检索概览
（主题、日期、源类型分布、质量分层、覆盖的深度层级）

## 2. 核心发现
（4-6 条工程技术洞察，每条包含：
  - 发现陈述
  - 技术原理分析（为什么这个设计有效/无效）
  - 工程证据（benchmark 数据、架构对比、生产案例）
  - 适用边界（什么场景下成立/不成立））

## 3. 核心项目深度分析
（对最重要的 3-5 个项目进行深度剖析，每个项目一节）

### 3.1 {项目A}
- **定位与价值主张**：这个项目解决什么问题的？与其他方案的本质区别是什么？
- **架构剖析**：
  - 总体架构图（文字描述核心组件和它们之间的数据流）
  - 关键抽象层设计（为什么这么分层？每一层的职责边界在哪？）
  - 扩展机制（插件系统 / 中间件 / 钩子等）
- **核心实现分析**：
  - 关键算法的伪代码或实现策略
  - 数据结构选择及其 trade-off 分析
  - 并发/异步模型
- **性能特征**：
  - Benchmark 数据（附测试条件和版本）
  - 资源消耗特征（内存/CPU/存储）
  - 可扩展性瓶颈
- **设计模式提炼**：从这个项目中学到的可迁移设计模式
- **生产就绪度评估**：
  | 维度 | 评分(1-5) | 说明 |
  |------|-----------|------|
  | 稳定性 | | |
  | 性能 | | |
  | 可观测性 | | |
  | 安全性 | | |
  | 文档质量 | | |
  | 社区支持 | | |
- **已知问题与注意事项**

### 3.2 {项目B}
...

## 4. 工具生态总览

| 工具/项目 | Stars | 定位 | 核心架构模式 | 性能特征 | 生产就绪度 | 推荐度 |
|----------|-------|------|------------|---------|-----------|--------|
| {tool} | ★{N}K | {定位} | {架构模式} | {关键指标} | 高/中/低 | ★★★★★ |

## 5. 架构模式与设计决策

（跨项目提炼可复用的架构模式）

### 5.1 涌现的架构模式
（跨多个项目共同采用的架构模式，分析为什么这个模式在领域内有效）

### 5.2 关键设计决策的 Trade-off 矩阵
| 设计决策 | 方案A | 方案B | 选择依据 | 代表性项目 |
|---------|-------|-------|---------|-----------|
| | | | | |

### 5.3 反模式与常见陷阱
（跨项目分析中发现的不良设计模式和工程错误）

## 6. 技术栈选型指南

### 6.1 按场景推荐

**场景一: {场景名称}**
- 推荐方案: {方案}
- 选型理由（技术层面）: 
- 架构适配性分析:
- 性能考量:
- 注意事项:

### 6.2 选型决策树
```
需要 {特性A} ？
  ├── 是 → 需要 {特性B} ？
  │        ├── 是 → {方案X}
  │        └── 否 → {方案Y}
  └── 否 → {方案Z}
```

## 7. 快速上手路线

（从入门到生产部署的递进路线，每步含具体的技术动作和时间估计）

```
第 1 步: {概念理解 + 环境搭建} — 预计 {N} 小时
  关键动作: ...
  验证标准: ...

第 2 步: {核心功能实现} — 预计 {N} 小时
  关键动作: ...
  验证标准: ...

第 3 步: {性能优化与调优} — 预计 {N} 小时
  关键动作: ...
  验证标准: ...

第 4 步: {生产部署准备} — 预计 {N} 小时
  关键动作: ...
  验证标准: ...
```

## 8. 生产部署检查清单

- [ ] 性能基准测试（已获取的具体指标）
- [ ] 监控与可观测性（关键 metrics、logs、traces）
- [ ] 故障恢复策略（回滚、降级、熔断）
- [ ] 安全审计（依赖漏洞、认证授权、数据加密）
- [ ] 容量规划（预期的资源消耗和扩展策略）

## 9. 参考来源

| # | 标题 | URL | 来源类型 | 技术深度 | 检索轮次 |
|---|------|-----|----------|---------|----------|
| 1 | | | github/official_docs/engineering_blog/... | principle/implementation/surface | |
```

### Phase C — Persist

#### Step 6: 深度分析补充（可选）

如果深度分析的项目少于 8 个，对高相关度项目补充 WebFetch 分析。

#### Step 7: 记录到数据库

```bash
python .wflow/scripts/dedup_db.py add --skill practical \
  -i practical_out/result.json -p
```

#### Step 8: 保留过程数据

> **不再删除过程数据。** 保留所有 `raw_r*.json` 和 `deduped.json` 文件。

---

## 查询策略参考

### 实践关键词注入（深度版）

| 意图 | 注入词 |
|------|--------|
| 架构分析 | `architecture`, `design pattern`, `system design`, `component diagram`, `data flow` |
| 性能工程 | `benchmark`, `throughput`, `latency`, `scalability test`, `profiling`, `optimization` |
| 源码分析 | `source code walkthrough`, `internals`, `how it works`, `under the hood`, `implementation details` |
| 生产部署 | `production deployment`, `monitoring`, `troubleshooting`, `incident review`, `postmortem` |
| 设计决策 | `ADR`, `RFC`, `design decision`, `tradeoff`, `why we chose`, `migration from` |
| 安全实践 | `security best practices`, `vulnerability`, `auth`, `encryption`, `compliance` |

### 工程技术源域限定

#### 开源项目
| 域 | 用途 |
|----|------|
| `site:github.com` | GitHub 仓库、Issues、Discussions |
| `site:gitlab.com` | GitLab 仓库 |
| `site:pypi.org` | Python 包 |
| `site:npmjs.com` | NPM 包 |
| `site:readthedocs.io` | 项目文档 |

#### 工程博客（权威技术源）
| 域 | 企业 | 侧重 |
|----|------|------|
| `site:engineering.fb.com` | Meta | 大规模 AI 训练、分布式系统 |
| `site:netflixtechblog.com` | Netflix | 微服务、混沌工程、流媒体 |
| `site:slack.engineering` | Slack | 实时通信、客户端架构 |
| `site:eng.uber.com` | Uber | 分布式系统、机器学习平台 |
| `site:blog.cloudflare.com` | Cloudflare | 网络、边缘计算、性能优化 |
| `site:stripe.com/blog/engineering` | Stripe | API 设计、可靠性工程 |
| `site:github.blog/engineering` | GitHub | 开发者工具、CI/CD |
| `site:stackoverflow.blog` | Stack Overflow | 社区、开发者体验 |

#### 深度技术个人博客
| 域 | 作者 | 侧重 |
|----|------|------|
| `site:lilianweng.github.io` | Lilian Weng (OpenAI) | LLM、强化学习、系统工程 |
| `site:jaykmody.com` | Jay Mody | Transformers、GPU、底层优化 |
| `site:karpathy.github.io` | Andrej Karpathy | 深度学习、计算机视觉、教育 |
| `site:colah.github.io` | Chris Olah | 神经网络可视化、可解释性 |
| `site:jalammar.github.io` | Jay Alammar | Transformers、NLP 可视化解释 |

### 深度查询模式

| 目的 | 模板 |
|------|------|
| 架构分析 | `"<tool> architecture design OR system overview OR component diagram"` |
| 源码分析 | `"<tool> source code walkthrough OR internals OR under the hood"` |
| 性能评估 | `"<tool> benchmark OR performance evaluation OR latency throughput"` |
| 生产经验 | `"<tool> production deployment OR incident OR postmortem OR lessons learned"` |
| 设计决策 | `"why <tool> chose <approach> OR <tool> design decision OR <tool> migration"` |
| 对比评估 | `"<tool_a> vs <tool_b> technical comparison benchmark 2025"` |
| ★ 顶尖企业实践 | `"<tool> OR <topic> production site:anthropic.com OR site:openai.com OR site:engineering.fb.com OR site:deepmind.google OR site:netflixtechblog.com"` |
| ★ 顶尖企业开源 | `"<topic> open source released by Anthropic OR OpenAI OR Meta OR Google OR Alibaba site:github.com"` |

### 源质量自检清单

每次检索后检查：
- [ ] 工程技术源（GitHub/官方文档/工程博客）是否占 > 60%？
- [ ] 是否有至少 3 个 GitHub 仓库的源码级分析？
- [ ] 是否避免了内容农场和低质博客？
- [ ] 是否有具体的性能数字和测试条件？
- [ ] 是否有生产部署的实践证据（而非仅教程）？

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `TAVILY_API_KEY` | 是 | Tavily API 密钥 |

## 依赖

仅 Python 标准库。
