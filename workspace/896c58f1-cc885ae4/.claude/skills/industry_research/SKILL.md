---
name: industry_research
description: 业界与企业级信息检索与分析。多轮 Tavily 搜索 → 去重汇总 → 深度分析 → 撰写行业研究报告。侧重市场报告、技术架构、企业实践、竞争格局、趋势研判。
type: skill
version: 3.0.0
author: deep-research
tags: [industry, enterprise, market, business, analyst, report, architecture]
---

# industry_research

业界与企业级信息的深度检索与分析。三阶段流水线：**Search Pipeline**（脚本驱动，5 轮递进检索）→ **Analysis**（AI 驱动深度分析）→ **Persist**（脚本驱动，保留过程数据）。

## 完整工作流（8 步）

### Phase A — Search Pipeline（扩展至 5 轮）

#### Step 1: 构造查询

根据上游 keyword_splitter 输出的 industry 维度关键词构造 5 组递进式检索查询：

- **第 1 轮（市场概览 — surface 层）:** `"<topic> market size forecast CAGR 2024 2025 site:gartner.com OR site:idc.com"`
- **第 2 轮（技术架构深挖 — principle/implementation 层）:** `"<topic> architecture OR infrastructure design production deployment site:engineering.OR site:tech."` — 深入技术实现细节
- **第 3 轮（顶尖企业实践 — implementation 层）:** `"<topic> Anthropic OR OpenAI OR Google OR Meta OR Alibaba production deployment architecture"` — 优先检索顶尖 AI/科技公司的技术实践
- **第 4 轮（技术竞争格局 — principle 层）:** `"<topic> technical comparison OR architecture tradeoff OR technology stack decision"`
- **第 5 轮（前瞻/合规/人才 — surface+principle 层）:** `"<topic> trends OR regulatory compliance OR talent market 2025 2026"`

> **域偏好（强化版）:** `site:gartner.com` | `site:idc.com` | `site:mckinsey.com` | `site:forrester.com` | `site:engineering.fb.com` | `site:netflixtechblog.com` | `site:aws.amazon.com/blogs` | `site:cloud.google.com/blog` | `site:techcrunch.com` | `site:infoq.com`

> **🎯 顶尖企业/机构技术源（优先检索）:**
> 行业研究应优先检索以下顶尖公司和机构的技术实践、研究发布和工程博客，而非仅依赖第三方分析机构的二手总结：

| 企业/机构 | 技术源 | 检索焦点 |
|-----------|--------|---------|
| **Anthropic** | `site:anthropic.com/research` `site:anthropic.com/engineering` | AI safety、alignment、Claude 系列模型架构、scaling 策略、RLHF/RLAIF 方法论、长上下文工程、MCP 协议 |
| **Google DeepMind** | `site:deepmind.google` `site:research.google` `site:blog.google/technology/ai` | Gemini 系列、AlphaFold/AlphaCode、TPU 架构、TensorFlow/JAX 生态、搜索与推荐系统 |
| **Meta AI** | `site:ai.meta.com` `site:engineering.fb.com` | Llama 系列开源模型、PyTorch 生态、大规模分布式训练、AR/VR、社交推荐 |
| **OpenAI** | `site:openai.com/research` `site:openai.com/blog` | GPT 系列、Sora、DALL-E、o1/o3 推理模型、API 平台架构、安全实践 |
| **Microsoft Research** | `site:microsoft.com/en-us/research` `site:azure.microsoft.com/blog` | Copilot 架构、Azure AI 基础设施、Phi 系列小模型、多模态研究 |
| **Alibaba / 阿里** | `site:damo.alibaba.com` `site:alibaba.cloud/blog` | 通义千问(Qwen)系列、阿里云 AI 平台、电商/物流 AI 应用、RISC-V 生态 |
| **Baidu / 百度** | `site:yiyan.baidu.com` `site:ai.baidu.com` | 文心一言、飞桨(PaddlePaddle)、自动驾驶 Apollo、搜索 AI |
| **ByteDance / 字节跳动** | `site:bytedance.com` `site:volcengine.com/blog` | 豆包(Doubao)/云雀模型、推荐系统、TikTok 推荐算法、AI 基础设施 |
| **Huawei / 华为** | `site:huawei.com/techinnovation` `site:mindspore.cn` | 昇腾(Ascend)芯片、MindSpore 框架、盘古大模型、通信 AI |
| **Tencent / 腾讯** | `site:ai.tencent.com` `site:tencent.com/ai` | 混元大模型、微信 AI、游戏 AI、腾讯云 AI |

> **重要:** 第 2 轮和第 4 轮是新增的技术深度查询，必须构造到位。避免仅搜索市场数据而忽略技术架构和工程决策分析。第 3 轮应优先检索上述顶尖企业的第一手技术发布内容。

#### Step 2: 执行多轮检索

```bash
python .wflow/scripts/tavily-search.py -n 10 -d advanced \
  "<query_round_1>" > industry_out/raw_r1.json

python .wflow/scripts/tavily-search.py -n 10 -d advanced \
  "<query_round_2>" > industry_out/raw_r2.json

python .wflow/scripts/tavily-search.py -n 10 -d advanced \
  "<query_round_3>" > industry_out/raw_r3.json

python .wflow/scripts/tavily-search.py -n 10 -d advanced \
  "<query_round_4>" > industry_out/raw_r4.json

python .wflow/scripts/tavily-search.py -n 10 -d advanced \
  "<query_round_5>" > industry_out/raw_r5.json
```

#### Step 3: 合并 + 去重

```bash
python .wflow/scripts/dedup_db.py merge \
  -q "<query_round_1>" \
     "<query_round_2>" \
     "<query_round_3>" \
     "<query_round_4>" \
     "<query_round_5>" \
  industry_out/raw_r1.json industry_out/raw_r2.json industry_out/raw_r3.json \
  industry_out/raw_r4.json industry_out/raw_r5.json \
  | python .wflow/scripts/dedup_db.py filter --skill industry -i - \
  -o industry_out/deduped.json
```

### Phase B — Analysis

#### Step 4: 相关性筛选 + 深度内容获取

阅读 `industry_out/deduped.json` 逐条判断并写入 `industry_out/result.json`：

**筛选原则（强化版）:**
- ✅ 保留：分析机构报告、企业技术实践、量化数据、技术架构文档、专利分析、时效性高（12 个月内）
- ❌ 移除：纯产品广告、不可靠来源、仅市场宣传无实质技术内容、数据来源不明
- ⚡ 优先：含具体技术架构描述、有工程指标（SLO/延迟/成本）、有对比测试数据的来源

**深度内容获取（新增）:**
对于 `relevance: "high"` 的来源（至少 6 个），使用 WebFetch 提取深度技术内容：
- 技术架构图的文字描述
- 关键工程指标（QPS、延迟、成本、可用性）
- 技术决策的 trade-off 分析
- 迁移/实施的具体步骤和踩坑经验

```json
{
  "meta": {
    "skill": "industry",
    "topic": "研究主题",
    "search_date": "2026-06-16",
    "final_count": 15,
    "deep_fetched_count": 8,
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
      "title": "...",
      "url": "...",
      "content": "...",
      "deep_content": "## 技术架构\n...\n## 工程指标\n...\n## Trade-off 分析\n...",
      "score": 0.93,
      "relevance": "high",
      "relevance_note": "...",
      "source_credibility": "high",
      "depth": "implementation",
      "_round": 3
    }
  ]
}
```

**可信度分级标准:**
| 等级 | 来源类型 |
|------|---------|
| **高** | 第三方分析机构（Gartner/IDC/Forrester）、学术-产业联合报告、审计过的财务数据 |
| **中** | 厂商技术博客（有具体架构细节）、知名科技媒体深度报道、开源基金会报告 |
| **中低** | 厂商案例研究（可能选择性呈现）、产品对比评测 |
| **低** | 纯产品广告、匿名来源、不可验证的数据 |

#### Step 5: 撰写行业深度报告

基于 `result.json` 中的深度内容撰写 `industry_out/industry_report.md`：

```markdown
# {Topic} — 行业深度研究报告

> 生成时间: {date} | 有效结果: {count} 条 | 深度获取: {N} 条 | 检索: 5 轮

---

## 1. 检索概览
（主题、日期、来源类型分布与可信度分层、检索深度层次覆盖）

## 2. 核心发现
（3-5 条关键洞察，每条包含：
  - 发现陈述
  - 量化数据支撑（具体数字、来源、统计方法）
  - 底层原因分析（为什么会出现这个现象/趋势）
  - 可信度评估）

## 3. 市场概览
（市场规模、增长率、主要驱动因素的技术含义、区域分布）

## 4. 技术架构深度分析
（新增章节 — 核心差异化章节）
### 4.1 主流技术架构对比
（不同厂商/方案的技术架构差异，不只是市场定位差异）
### 4.2 关键技术决策的 Trade-off
（性能 vs 成本、灵活 vs 易用、开源 vs 商业等）
### 4.3 基础设施与依赖链分析
（云平台依赖、硬件需求、供应链风险）

## 5. 企业实践案例
（按行业/场景分组，每案例含: 企业 / 行业 / 技术场景 / 架构方案 / 工程指标 / 踩坑经验 / 来源可信度）

## 6. 竞争格局与技术壁垒
### 6.1 竞争格局矩阵
| 厂商/产品 | 定位 | 技术架构优势 | 技术短板 | 生态壁垒 | 市场阶段 |
|-----------|------|-------------|---------|---------|---------|
### 6.2 专利与技术护城河分析
### 6.3 开源 vs 商业的技术博弈

## 7. 趋势研判
（短期 1-2 年 / 中期 3-5 年趋势，附研判的技术依据，而不仅是市场推测）

## 8. 风险与挑战
| 类别 | 风险 | 技术根源 | 影响范围 | 缓解难度 |
|------|------|---------|---------|---------|
| 技术风险 | | | | |
| 市场风险 | | | | |
| 合规风险 | | | | |
| 供应链风险 | | | | |

## 9. 参考来源
| # | 标题 | URL | 来源类型 | 可信度 | 深度层级 | 检索轮次 |
|---|------|-----|----------|--------|---------|----------|
```

### Phase C — Persist

#### Step 6: 深度内容补充（可选）

如果深度获取的来源少于 6 个，对高可信度来源补充 WebFetch。

#### Step 7: 记录到数据库

```bash
python .wflow/scripts/dedup_db.py add --skill industry \
  -i industry_out/result.json -p
```

#### Step 8: 保留过程数据

> **不再删除过程数据。** 保留所有 `raw_r*.json` 和 `deduped.json` 文件。

---

## 查询策略参考

### 行业关键词注入

| 意图 | 注入词 |
|------|--------|
| 市场规模 | `market size`, `forecast`, `CAGR`, `TAM` |
| 技术架构 | `architecture`, `tech stack`, `infrastructure`, `system design` |
| 企业落地 | `enterprise`, `production`, `deployment`, `case study`, `lessons learned` |
| 竞争格局 | `landscape`, `technical comparison`, `architecture tradeoff`, `vs` |
| ★ 顶尖企业 | `Anthropic`, `OpenAI`, `Google DeepMind`, `Meta AI`, `Alibaba`, `Microsoft Research`, `Huawei`, `Tencent AI` — 按主题注入相关企业名 |
| 专利技术 | `patent landscape`, `proprietary technology`, `technical moat` |
| 合规政策 | `regulation`, `compliance`, `policy`, `governance` |
| 人才市场 | `hiring trends`, `talent market`, `skill demand`, `salary survey` |

### 权威来源域限定

#### 分析机构

| 域 | 侧重 |
|----|------|
| `site:gartner.com` | 技术成熟度、魔力象限 |
| `site:idc.com` | 市场份额、出货量数据 |
| `site:mckinsey.com` | 战略洞察、行业转型 |
| `site:forrester.com` | 技术评估、企业架构 |

#### 🎯 顶尖企业/机构研究源（最高优先级）

| 域 | 企业/机构 | 侧重 |
|----|-----------|------|
| `site:anthropic.com/research` | Anthropic | AI safety、alignment、Claude 架构、RLHF/RLAIF、MCP、长上下文 |
| `site:anthropic.com/engineering` | Anthropic | 工程实践、基础设施、模型部署 |
| `site:openai.com/research` | OpenAI | GPT/o1/o3 系列、Sora、DALL-E、API 架构、安全研究 |
| `site:deepmind.google` | Google DeepMind | Gemini、AlphaFold、AlphaCode、强化学习 |
| `site:research.google` | Google Research | Transformers 演进、TPU、搜索 AI、多模态 |
| `site:ai.meta.com` | Meta AI | Llama 系列开源、PyTorch、大规模训练、多模态 |
| `site:engineering.fb.com` | Meta | 分布式训练基础设施、推理优化、硬件 |
| `site:microsoft.com/en-us/research` | Microsoft Research | Copilot 架构、Phi 系列、多模态、系统 AI |
| `site:damo.alibaba.com` | 阿里达摩院 | Qwen 系列模型、机器翻译、CV、AI 平台 |
| `site:ai.tencent.com` | 腾讯 AI | 混元大模型、游戏 AI、微信 AI |
| `site:huawei.com/techinnovation` | 华为 | 昇腾/Ascend、MindSpore、盘古模型 |
| `site:research.bytedance.com` | 字节跳动 | 推荐系统、语音 AI、豆包/云雀模型 |

#### 工程博客（技术细节）

| 域 | 侧重 |
|----|------|
| `site:engineering.fb.com` | Meta 基础设施、AI 训练架构 |
| `site:netflixtechblog.com` | 微服务、流媒体、混沌工程 |
| `site:aws.amazon.com/blogs` | AWS 架构实践、Serverless |
| `site:cloud.google.com/blog` | Google Cloud 方案、Kubernetes |
| `site:eng.uber.com` | 大规模分布式系统 |
| `site:slack.engineering` | 实时通信架构 |

#### 财经/科技媒体

| 域 | 侧重 |
|----|------|
| `site:techcrunch.com` | 创业融资、产品发布 |
| `site:infoq.com` | 技术架构资讯 |
| `site:36kr.com` | 国内创投 |

### 深度查询模式

| 目的 | 模板 |
|------|------|
| 市场概览 | `"<topic> market forecast 2024 2025 site:gartner.com OR site:idc.com"` |
| 技术架构 | `"<topic> architecture system design production scale"` |
| 顶尖企业实践 ★ | `"<topic> site:anthropic.com OR site:openai.com OR site:ai.meta.com OR site:deepmind.google OR site:damo.alibaba.com"` |
| 顶尖企业技术发布 ★ | `"<topic> research OR breakthrough OR announce 2025 site:anthropic.com OR site:openai.com OR site:ai.meta.com OR site:deepmind.google OR site:damo.alibaba.com"` |
| 巨头技术对比 ★ | `"<topic> Anthropic vs OpenAI vs Google vs Meta vs Alibaba comparison 2025"` |
| 竞争分析 | `"<topic> technical comparison benchmark evaluation 2025"` |
| 趋势研判 | `"<topic> trends predictions 2025 technical implications"` |
| 合规政策 | `"<topic> regulation compliance technical requirements enterprise"` |
| 特定企业检索 | `"<topic> site:<company_domain>"` — 按需替换为具体企业域名 |

### 中英文双语检索

行业信息在中英文源差异大，建议双语检索：

```bash
# 国际视角
python .wflow/scripts/tavily-search.py -n 5 "LLM enterprise adoption survey 2024"

# 国内视角
python .wflow/scripts/tavily-search.py -n 5 "大模型 企业落地 技术架构 2024"
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `TAVILY_API_KEY` | 是 | Tavily API 密钥 |

## 依赖

仅 Python 标准库。
