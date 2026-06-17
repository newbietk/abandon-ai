# 编程 Agent 数据采集与指标提取实践 — 学术深度研究报告

> 生成时间: 2026-06-17 | 有效结果: 18 条 | 深度获取: 10 篇 | 检索: 5 轮（覆盖 surface/principle/implementation 三层）

---

## 1. 检索概览

**主题**: 编程 Agent 的数据采集与指标提取实践（学术维度）

**检索日期**: 2026-06-17

**检索轮次与深度层次映射**:

| 轮次 | 深度层次 | 检索式概要 | 结果数 | 目标 |
|------|---------|-----------|--------|------|
| 1 | surface | coding agent / code generation survey / taxonomy / review | 5 | 领域全景图与综述 |
| 2 | principle | LLM code generation pass@k benchmark methodology framework | 5 | 方法深挖与算法细节 |
| 3 | implementation | code generation benchmark empirical evaluation failure analysis | 5 | 实验评估与实证数据 |
| 4 | principle | program synthesis evaluation metrics theoretical formal framework | 5 | 理论基础与形式化分析 |
| 5 | surface | coding agent evaluation data collection telemetry 2025 | 5 | 前沿进展与最新突破 |

**来源分布**: arXiv 预印本 16 篇（88.9%），ACL Anthology 1 篇，其他学术源 1 篇

**去重统计**: 原始 25 条 → 批量去重后 24 条 → 筛选后 18 条（去除非学术博客/GitHub 仓库/聚合页面 5 条，合并重复 1 条）

---

## 2. 核心发现

### 发现 1: 编程 Agent 评估已从单一指标走向多维分层体系

**陈述**: 学术界对编程 Agent 的评估已从早期简单的 pass@k 单一指标，发展为覆盖功能性、安全性、可维护性、效率的多维分层评估体系。

**原理/机制**: 早期 HumanEval 提出的 pass@k 仅测量通过单元测试的概率，但随着编码任务复杂度提升（从函数级到仓库级），单一指标无法反映代码质量的全貌。MERA Code 框架展示了这一演进：它同时评估执行正确性（pass@k）、语义等价性（LLM-as-Judge）、代码质量（静态分析）和仓库上下文适配度。ProjDevBench 进一步引入 Online Judge 测试 + LLM 辅助代码审查的双轨评估，分别检测功能正确性和隐性合规问题。

**证据来源**: MERA Code (2507.12284) 提出统一评估框架，覆盖函数级到仓库级任务；ProjDevBench (2602.01655) 采用 OJ + LLM 双轨评估；Agent-based Evaluation Framework (2504.13472) 引入 ICE-SCORE、CODEJUDGE、CodeVisionary 等多维度指标。

**局限/争议**: 多维评估带来新的挑战：各维度权重如何设定？不同维度间可能存在冲突（如高安全性可能降低功能性分数），目前尚未形成标准化方案。

### 发现 2: 评估粒度从函数级向仓库级和端到端项目级演进

**陈述**: 评估基准正经历从"函数补全"到"完整仓库生成"的范式转移，以反映真实软件开发的多文件、多模块协作场景。

**原理/机制**: 传统 HumanEval 等函数级基准的局限在于：它们评估的是"孤立函数生成"，而真实开发需要跨文件依赖管理、架构设计和多步骤集成。NL2Repo-Bench 直接要求 Agent 从空白工作区开始，仅凭一份自然语言需求文档自主设计架构、生成完整仓库。ProjDevBench 则要求 Agent 完成端到端项目开发，评估系统架构设计和迭代优化能力。

**证据来源**: NL2Repo-Bench (2512.12730) 设计多领域仓库生成任务（Web 开发、ML、数据处理等）；ProjDevBench (2602.01655) 涵盖 20 个编程问题、8 个类别；SR-Eval (2509.18808) 通过逐步需求细化模拟迭代开发。

**局限/争议**: 仓库级评估的成本极高（每次评估可能需要数小时的 Agent 运行时间和大量 token 消耗），导致样本量受限（ProjDevBench 仅 20 个问题）。

### 发现 3: LLM-as-Judge 成为主流评估方法但仍存在偏差风险

**陈述**: LLM-as-Judge（使用大型语言模型作为评估者）已成为代码生成语义等价性判断的主流方法，但其评估者固有的偏差尚未得到充分解决。

**原理/机制**: 当面对"一对多"问题（同一需求有多种合法代码实现）时，传统测试用例覆盖不足。MERA Code 框架提出使用 LLM 作为评判者来评估模型输出与参考答案之间的语义等价性，并采用 pass@k 指标报告性能。但该方法存在明显偏差：如果作为评判者的 LLM 与其评估的模型同源（如同为 Qwen 系列），会产生有利于同源模型的系统性偏差。Agent-based Evaluation Framework (2504.13472) 提出了 CodeVisionary 等替代方案，通过 agent 协作进行更公正的评估。

**证据来源**: MERA Code (2507.12284) 明确承认 Qwen2.5-Coder-32B 作为评判模型的偏差；Agent-based Evaluation Framework (2504.13472) 提出 ICE-SCORE (0.655 相关性) 和 CodeVisionary (0.644 相关性) 替代纯 LLM-Judge。

**局限/争议**: 如何确保 LLM Judge 的评估公平性（避免同模型偏差）是开放问题。交叉评估或多 Agent 协作评估可能增加成本但提高公正性。

### 发现 4: 实证研究方法论正从单一实验走向结构化参考框架

**陈述**: 针对 LLM 代码生成的实证研究正在经历从"即兴实验设计"向"结构化参考框架"的转变，以提升研究的可重复性和可比性。

**原理/机制**: 最新研究 (2510.03862) 通过自底向上的方法——结合自身实验经验和文献回顾分析——构建了一个理论框架来指导 LLM 代码生成的实证实验设计。该框架围绕问题来源（problem sources）、质量属性（quality attributes）和评估指标（evaluation metrics）三大核心组件组织，支持跨不同实验设置的可重复性、可比性和覆盖率。框架涵盖的评估维度包括：正确性（测试通过率、编译成功率）、复杂度（圈复杂度、token 数）、安全与偏差（CWE 违规、公平性审计）和效率（执行时间、内存分析）。

**证据来源**: Designing Empirical Studies (2510.03862) 提出参考框架；Critical Review (2406.12655) 系统对比了 BLEU/ROUGE/CodeBLEU/pass@k 等指标的局限。

**局限/争议**: 该框架目前是理论性的，尚未经过大规模实证验证。不同研究者对"可重复实验"的定义仍存在分歧。

### 发现 5: AI 编码助手的使用度量正成为独立研究领域

**陈述**: AI 编码助手的使用模式、生产力影响和用户体验度量已从辅助分析发展为独立的实证研究方向，形成了专门的调查方法论和度量体系。

**原理/机制**: 大量调查和随机对照试验 (RCT) 表明 AI 编码助手可带来 12-25% 的速度提升，约三分之一的开发者代码借助 AI 工具完成。企业级研究 (2601.20112) 通过 25 道题的综合性问卷，在科技公司内部采集 57 份有效回复。用户感知研究 (2508.12285) 通过对 739 条 Reddit 评论进行系统的主题建模，揭示了 AI 编码助手用户体验的 9 大维度（生产力、可用性、可控性、可预测性等），发现"可预测性"维度的负面情绪高达 100%。

**证据来源**: Enterprise Study (2601.20112) 全面调查企业用户需求和体验；Users' Perception (2508.12285) 采用主题建模分析 Reddit 评论；Debt Behind AI Boom (2603.28592) 大规模实证研究显示 40% 的 AI 生成代码存在安全漏洞。

**局限/争议**: 调查方法依赖自我报告，可能存在认知偏差。RCT 研究的生态效度（是否反映真实开发场景）仍存疑。

### 发现 6: AI 生成代码的质量风险催生了新的评估指标需求

**陈述**: 随着 AI 生成代码大规模进入生产环境（Google 和 Microsoft 超 20% 新代码由 AI 生成），传统功能正确性之外的评估指标（安全性、可维护性、技术债务）变得迫切。

**原理/机制**: Debt Behind the AI Boom (2603.28592) 是对 AI 生成代码在生产环境中质量问题的首次大规模实证研究。研究表明 AI 生成代码存在功能性 bug、运行时错误和系统性可维护性问题。Pearce 等人发现约 40% 的 AI 生成代码在安全敏感上下文包含严重漏洞。这推动了评估指标从"代码是否运行"向"代码是否安全、可维护、可演化"的方向扩展。

**证据来源**: Debt Behind AI Boom (2603.28592) 涵盖超 110 万个 GitHub 仓库；HLCE (ACL 2025) 展示高级 LLM 在极限编程竞赛中的表现；Critical Review (2406.12655) 指出 pass@k 与真实正确性和开发者有用性之间的弱相关性。

**局限/争议**: 安全评估的自动化程度仍然较低，多数安全评估仍需人工专家参与。

---

## 3. 理论基础与形式化分析

### 3.1 核心问题的形式化定义

编程 Agent 评估的核心问题可以形式化为一个多目标优化问题：

给定编程任务 \( T \)，Agent \( A \) 生成代码 \( C \)，评估函数 \( E \) 度量代码质量：

\[
E(C) = \sum_{i} w_i \cdot f_i(C)
\]

其中 \( f_i \) 是各维度评估函数：
- \( f_1(C) \) = 功能正确性（pass@k）
- \( f_2(C) \) = 语义等价性（LLM-Judge 评估）
- \( f_3(C) \) = 安全性（CWE 违规计数）
- \( f_4(C) \) = 复杂度（圈复杂度）
- \( f_5(C) \) = 可维护性（静态分析得分）

权重 \( w_i \) 的设定和各维度间的权衡目前缺乏理论基础。

### 3.2 关键理论的数学直觉

**pass@k 的统计意义**: pass@k 测量的是"在 k 次独立采样中至少有一次通过所有测试"的概率。数学上，如果单个样本的通过率为 \( p \)，则 pass@k = \( 1 - (1-p)^k \)。这导致 pass@k 对较小的 \( k \) 和较低的 \( p \) 非常敏感，且随 \( k \) 增大迅速趋于 1，导致高 \( k \) 值下区分度下降。

**BLEU/CodeBLEU 的局限**: BLEU 基于 n-gram 精确匹配，假设"与参考答案的词汇重叠度 = 质量"。这在自然语言中尚可接受，但在编程语言中，语法等价但词汇不同的实现（如不同变量命名、不同算法选择）会被错误惩罚。CodeBLEU 通过引入 AST 和 DFG 匹配部分解决了结构相似性问题，但无法评估语义等价性。

**LLM-as-Judge 的理论基础**: 将 LLM 视为一个隐式学习到"代码质量分布"的模型。其评估可看作是在学到的分布上做最大后验估计：
\[
\text{Judge}(C | T) = \arg\max_{s \in S} P_{\text{LLM}}(s | T, C)
\]
其中 \( s \) 是质量评分。该方法的根本风险在于 \( P_{\text{LLM}} \) 可能对与训练数据分布相似的代码有系统性偏向。

### 3.3 理论局限与开放问题

1. **评估指标的理论不可公度性**: 不同维度指标（正确性 vs. 安全性 vs. 可维护性）本质上是不可公度的，无法在不引入价值判断的情况下合并为单一分数。

2. **评估的对抗性鲁棒性**: Agent 可能学会"针对评估指标优化"而非"生成真正好的代码"（Goodhart 定律在评估中的体现）。HLCE 基准 (ACL 2025) 试图通过私密 leaderboard 和未见过的测试用例来缓解过拟合。

3. **评估成本的指数增长**: 仓库级评估的时间复杂度和 token 消耗随项目规模近似线性增长，导致大规模评估在计算上不可行。如何在采样效率和评估置信度之间取得平衡缺乏形式化分析。

---

## 4. 方法深度剖析

### 4.1 ProjDevBench — 端到端项目级评估框架

- **核心思想**: 从简单的"函数补全"评估走向"完整项目开发"评估，要求 Agent 从零开始构建可工作的软件项目。
- **算法概要**: 
  1. 提供项目需求文档 → Agent 自主设计架构和实现
  2. OJ 平台自动执行测试套件评估功能正确性
  3. 规则脚本 + LLM 审查双轨检测合规违规
- **关键创新**: OJ 测试 + LLM 审查的双轨机制，弥补了纯自动化测试无法检测规则违规和"作弊解法"的不足。
- **实验证据**: Codex + GPT-5 取得整体最佳性能 (77.85%)；42% 的失败归因于错误答案，14% 归因于超时。
- **已知局限**: 仅 20 个编程问题，样本量偏小；Agent 评估耗费大量 token 和时间。
- **适用场景**: 评估 Agent 的端到端软件开发能力，尤其适合对比不同 Agent 架构的全流程表现。

### 4.2 NL2Repo-Bench — 长程仓库生成评估

- **核心思想**: 评估 Agent 在"仅给定需求文档和空工作区"条件下，自主完成完整仓库构建的能力，聚焦长程推理和架构设计。
- **算法概要**: 
  - 按领域分类（Web 开发、工具库、ML、数据处理等）
  - 多维度成功率评估（数据库交互、网络、批处理、系统工具）
  - 跨模型对比（12 种主流模型/Agent）
- **关键创新**: 首次系统性地评估 Agent 在跨多文件、多模块场景下的长程保持能力；提出细粒度技能维度分解。
- **实验证据**: Claude-Sonnet-4.5 (Claude Code) 在 Web 开发 (56.9%) 和工具库 (59.8%) 领先；但 ML 任务普遍偏低 (最高 19.7%)，揭示 Agent 在复杂推理领域的短板。
- **已知局限**: 同一模型在不同工具集成（Claude Code vs Cursor）下表现不同，暗示工具链本身影响显著。
- **适用场景**: 评估 Agent 的完整软件工程周期自主能力。

### 4.3 MERA Code — 统一评估框架

- **核心思想**: 整合多种评估范式的统一框架，覆盖从函数级到仓库级的代码生成任务。
- **算法概要**: 
  - 函数级: HumanEval, MBPP, BigCodeBench
  - 类级: ClassEval, CoderEval
  - 仓库级: RealCode, YABLoCo, RepoBench
  - 评估方式: pass@k + LLM-as-Judge + EM
- **关键创新**: 提出 LLM-as-Judge 解决"一对多"评估挑战；RealCode 通过 Mock 函数体构建真实仓库任务。
- **实验证据**: RealCode 包含 802 个 Python 任务（95 个仓库），RealCodeJava 包含 298 个任务（27 个仓库）。
- **已知局限**: LLM Judge 的模型偏差问题（Qwen2.5-Coder-32B 作为评估者可能偏向 Qwen 系列模型）。
- **适用场景**: 需要跨任务类型统一评估的 benchmark 对比场景。

### 4.4 SR-Eval — 逐步需求细化评估

- **核心思想**: 模拟真实迭代开发中"需求逐步细化"的过程，评估 Agent 在多轮交互中持续改进代码的能力。
- **算法概要**: 
  - 函数级: 148 Python (BigCodeBench-Hard) + 188 Java (AutoCodeBench)
  - 仓库级: 1825 Python (DevEval) + 106 Java (MRGBench)
  - 多轮交互: 每轮细化需求并重新评估
  - 人工验证: 3 位开发者，5 点 Likert 量表
- **关键创新**: 捕捉了软件开发中"需求变化"这一核心现实，而不仅是静态的一次性代码生成。
- **实验证据**: 80 个任务采样产生 333 次多轮交互的大规模人工评估。
- **已知局限**: 人工评估成本高，仅有 3 位开发者参与评估。
- **适用场景**: 评估 Agent 在迭代开发中的适应性和持续改进能力。

### 4.5 实证研究参考框架

- **核心思想**: 为 LLM 代码生成实验设计提供结构化参考框架，解决"如何设计可重复、可比较的实验"这一元问题。
- **框架组件**:
  - 问题来源: 函数级 / 类级 / 仓库级 / 领域特定
  - 质量属性: 正确性 / 复杂度 / 安全性 / 效率 / 伦理
  - 评估指标: 测试通过率 / 编译成功率 / 圈复杂度 / CWE 违规 / 执行时间
- **关键创新**: 从 meta 层面系统化实证研究方法论，提升跨研究的可比性。
- **证据来源**: 系统梳理了现有文献中使用的质量和指标的映射关系。
- **适用场景**: 研究者设计 LLM 代码生成实验时的框架参考。

---

## 5. 研究趋势与流派演进

### 发展阶段

```
2021-2022 (第一代)          2023-2024 (第二代)              2025-2026 (第三代)
│                           │                              │
├─ HumanEval (pass@k)      ├─ ClassEval (类级)            ├─ NL2Repo-Bench (仓库级)
├─ MBPP (函数补全)          ├─ CoderEval (真实项目)        ├─ ProjDevBench (端到端)
├─ APPS (竞赛编程)          ├─ SWE-Bench (issue修复)       ├─ SR-Eval (迭代开发)
├─ BLEU/CodeBLEU           ├─ CodeBERTScore               ├─ ICE-SCORE/CodeVisionary
└─ 单一指标                ├─ LLM-as-Judge                ├─ 多维分层评估
                           └─ 人工+自动混合               └─ 理论化框架
```

### 驱动因素

1. **任务复杂度提升**: 从单函数 → 多文件 → 完整仓库，评估基准持续匹配实际开发复杂度。
2. **评估成本考量**: 仓库级评估的计算成本推动了更高效的采样策略和多阶段评估设计。
3. **安全性关注**: AI 生成代码大规模进入生产环境（20%+），推动安全评估从可选变为必需。
4. **方法学成熟**: 从"指标驱动"转向"理论驱动"，实证研究框架的出现标志着领域的学术成熟。

### 主要技术路线对比

| 技术路线 | 核心主张 | 代表工作 | 优势 | 局限 |
|---------|---------|---------|------|------|
| 执行驱动 | 代码是否正确运行是唯一标准 | HumanEval, SWE-Bench | 客观可重复 | 无法评估非功能性质量 |
| 语义等价 | 代码应语义等价于参考答案 | MERA Code (LLM-Judge) | 处理一对多问题 | Judge 模型偏差 |
| 多维评估 | 从多个维度综合评估 | ProjDevBench, CodeVisionary | 全面覆盖 | 维度权重主观 |
| 实证框架 | 实验设计本身需要理论指导 | Designing Empirical Studies | 提升可重复性 | 尚未广泛验证 |

---

## 6. 方法论对比矩阵

| 维度 | pass@k | LLM-as-Judge | ICE-SCORE | CodeVisionary | CodeBLEU |
|------|--------|-------------|-----------|---------------|----------|
| 理论基础 | 概率采样 | 隐式质量分布学习 | Agent协作评估 | 多维特征融合 | n-gram + AST + DFG |
| 核心机制 | k次采样中至少一次通过 | LLM判断语义等价 | 多Agent交叉评分 | 多维度编码器 | 结构匹配 |
| 计算成本 | 低 (仅执行) | 中 (需LLM推理) | 高 (多Agent) | 中 | 低 |
| 关键优势 | 客观可重复 | 灵活处理多样解 | 高相关性(0.655) | 高跨域泛化(23语言) | 包含结构信息 |
| 主要局限 | 需高质量测试用例 | 同模型偏差 | Agent间通信开销 | 需人工标注数据 | 不反映功能正确性 |
| 适用场景 | 函数级评测 | 语义等价判断 | 复杂代码评估 | 多语言场景 | 代码相似度 |
| 代表论文 | HumanEval, 2021 | MERA Code, 2025 | Agent Framework, 2025 | Agent Framework, 2025 | CodeBLEU, 2020 |
| 代码开源 | 是 | 部分 | 否 | 否 | 是 |

---

## 7. 开放问题与未来方向

### 开放问题 1: 评估指标的统一理论框架

各维度指标（正确性、安全性、效率、可维护性）之间缺乏统一的理论基础。未来的关键挑战是：能否建立一个类似于信息检索中 MAP/NDCG 的统一评估理论，使得不同维度的指标可以在一个共同的理论框架下进行标准化和比较？

### 开放问题 2: Agent 评估的可扩展性

仓库级评估的成本（时间、token、计算资源）随项目规模线性增长。如何在保证评估置信度的前提下大幅降低评估成本？可能的路径包括：分层采样策略、代理指标（surrogate metrics）、以及渐进式评估（从轻量级预筛选到全量评估）。

### 开放问题 3: 评估的对抗鲁棒性与基准过拟合

随着 benchmark 广泛使用，模型和 Agent 对特定基准的过拟合日益严重。HLCE 通过私有 leaderboard 和未公开发布的测试用例提供了部分解决方案，但根本问题——如何设计"不可过拟合"的评估——仍未解决。动态生成的评估任务和自适应难度调整可能成为发展方向。

---

## 8. 建议阅读清单

| # | 论文 | URL | 重要度 | 阅读优先级 | 理由 |
|---|------|-----|--------|-----------|------|
| 1 | Benchmarks and Metrics for Evaluations of Code Generation: A Critical Review | https://arxiv.org/abs/2406.12655 | ★★★★★ | 必读 | 最全面的代码生成评估指标批判性综述，包含所有主流 benchmark 的性能数据对比 |
| 2 | A Survey on Code Generation with LLM-based Agents | https://arxiv.org/abs/2508.00083 | ★★★★★ | 必读 | 最新 LLM Agent 代码生成综述，涵盖评估方法、工具和全流程应用 |
| 3 | MERA Code: A Unified Framework for Evaluating Code Generation Across Tasks | https://arxiv.org/abs/2507.12284 | ★★★★★ | 必读 | 统一评估框架的代表作，LLM-as-Judge 方法的标杆实践 |
| 4 | ProjDevBench: End-to-End Project Development | https://arxiv.org/abs/2602.01655 | ★★★★☆ | 推荐 | 端到端项目级评估的开创性工作，OJ+LLM 双轨评估方案 |
| 5 | NL2Repo-Bench: Long-Horizon Repository Generation | https://arxiv.org/abs/2512.12730 | ★★★★☆ | 推荐 | 仓库级生成评估的标杆，细粒度技能维度分解有重要参考价值 |
| 6 | Designing Empirical Studies on LLM-Based Code Generation | https://arxiv.org/abs/2510.03862 | ★★★★☆ | 推荐 | 实证研究方法论框架，对设计可重复实验有直接指导意义 |
| 7 | Agent-based Evaluation Framework for Complex Code Generation | https://arxiv.org/abs/2504.13472 | ★★★☆☆ | 选读 | Agent 协作评估替代方案，ICE-SCORE 等新指标 |
| 8 | Debt Behind the AI Boom | https://arxiv.org/abs/2603.28592 | ★★★☆☆ | 选读 | AI 生成代码质量的第一个大规模实证，揭示安全隐患数据 |

---

## 9. 参考来源

| # | 标题 | URL | 相关度 | 深度层级 | 检索轮次 |
|---|------|-----|--------|---------|----------|
| 1 | A Survey on Code Generation with LLM-based Agents | https://arxiv.org/html/2508.00083v1 | 高 | surface | 1 |
| 2 | NL2Repo-Bench: Towards Long-Horizon Repository Generation Evaluation | https://arxiv.org/html/2512.12730v1 | 高 | surface | 1 |
| 3 | Benchmarking AI Coding Agents on End-to-End Project Development (ProjDevBench) | https://arxiv.org/html/2602.01655v1 | 高 | surface | 1 |
| 4 | AI Agentic Programming: A Survey of Techniques, Challenges, and ... | https://arxiv.org/html/2508.11126v1 | 中 | surface | 1 |
| 5 | An Agent-based Evaluation Framework for Complex Code Generation | https://arxiv.org/html/2504.13472v2 | 高 | surface | 1 |
| 6 | Evaluating LLM-Generated Code: A Benchmark and Developer Study | https://arxiv.org/html/2605.09059 | 中 | principle | 2 |
| 7 | Large Language Models for Code Generation | https://arxiv.org/html/2503.01245v2 | 中 | principle | 2 |
| 8 | Towards Advancing Code Generation with Large Language Models | https://arxiv.org/html/2501.11354v1 | 中 | principle | 2 |
| 9 | MERA Code: A Unified Framework for Evaluating Code Generation Across Tasks | https://arxiv.org/html/2507.12284v3 | 高 | principle | 2 |
| 10 | SR-Eval: Evaluating LLMs under Stepwise Requirement Refinement | https://arxiv.org/html/2509.18808v2 | 高 | principle | 2 |
| 11 | Can Advanced LLMs Conquer Human's Hardest Code Competition? (HLCE) | https://aclanthology.org/2025.findings-emnlp.1152.pdf | 中 | implementation | 3 |
| 12 | Enhancing LLM Code Generation: A Systematic Evaluation of Multi... | https://arxiv.org/html/2505.02133v1 | 中 | implementation | 3 |
| 13 | Designing Empirical Studies on LLM-Based Code Generation: Reference Framework | https://arxiv.org/html/2510.03862v1 | 高 | principle | 4 |
| 14 | Benchmarks and Metrics for Evaluations of Code Generation: A Critical Review | https://arxiv.org/html/2406.12655v1 | 高 | principle | 4 |
| 15 | Usage, Effects and Requirements for AI Coding Assistants in the Enterprise | https://arxiv.org/html/2601.20112v1 | 高 | surface | 5 |
| 16 | "My productivity is boosted, but ..." Users' Perception on AI Coding Assistants | https://arxiv.org/html/2508.12285v1 | 中 | surface | 5 |
| 17 | The 2025 AI Agent Index: Technical and Safety Documentation | https://arxiv.org/html/2602.17753 | 中 | surface | 5 |
| 18 | Debt Behind the AI Boom: Empirical Study of AI-Generated Code in the Wild | https://arxiv.org/html/2603.28592v1 | 高 | surface | 5 |
