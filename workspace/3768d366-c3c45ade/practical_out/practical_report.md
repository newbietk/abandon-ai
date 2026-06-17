# 编程Agent的数据采集与指标提取 — 工程实践深度分析报告

> 生成时间: 2026-06-17 | 有效结果: 24 条 | 深度分析: 10 个项目 | 检索: 5 轮

---

## 1. 检索概览

**主题**: 编程Agent的数据采集和指标提取实践。重点检索方向包括：(1) 开源编程agent的仪表化SDK实现，(2) LLM agent的可观测性与生产级指标提取管道（基于OpenTelemetry），(3) 开发者工具遥测系统的事件模型设计，(4) 代码生成评估框架的工程实现。

**源类型分布**: GitHub 项目 6 个（含大代码评测框架3个、Agent可观测性SDK 2个、OTel核心实现1个），工程博客 5 篇，官方文档 2 篇，深度技术教程 2 篇，其他 9 篇。

**质量分层**:
- **高相关度项目（10个）**：dynatrace-ai-agent-instrumentation-examples、dash0hq/agent-skills、open-telemetry/opentelemetry-java-instrumentation、agntcy/observe、bigcode-evaluation-harness、lm-evaluation-harness、evalchemy、CLI telemetry best practices、AI Agent Monitoring、Databricks agent tracing
- **中相关度（6个）**：groundcover AI Agent Observability、MCP OTel integration、OTel Weaver等
- **低相关度（8个）**：通用OTel文档和教程

**覆盖深度层级**: surface (8), principle (6), implementation (10)

---

## 2. 核心发现

### 发现 1：编程Agent数据采集存在「双层架构」模式

**发现陈述**: 编程Agent的遥测数据采集在实践中采用「Agent运行时观测 + 生成产物评估」双层架构，而非单一管道。

**技术原理分析**: 第一层关注Agent行为本身（工具调用、Token消耗、会话活动），通过OpenTelemetry等标准可观测性框架实现；第二层关注Agent输出质量（代码正确性、pass@k等），通过独立的评估Harness（类似bigcode-evaluation-harness）实现。两层数据通过session.id、trace.id等关联ID实现联合分析。

**工程证据**:
- Dynatrace的AI Coding Agents方案展示了第一层的完整实现：通过OTel信号捕获session级数据
- bigcode-evaluation-harness和lm-evaluation-harness代表了第二层的标准化实现
- agntcy/observe SDK通过`@agent`装饰器统一管理两层数据

**适用边界**: 对于IDE插件形态的编程助手，第一层以编辑器事件为主；对于CLI形态的agent（如Claude Code），以标准输出和API调用为主。

### 发现 2：OpenTelemetry 是编程Agent数据采集的事实标准基础设施

**发现陈述**: 所有调研的编程Agent数据采集方案均基于OpenTelemetry，而非自研管道。

**技术原理分析**: OpenTelemetry提供三个关键能力：(1) 标准化的Span/Metric/Log数据模型，(2) 跨语言SDK和自动instrumentation机制，(3) Collector管道实现灵活的数据处理路由。这使得Agent观测数据能与已有基础设施无缝集成。

**工程证据**:
- Dash0 agent-skills 完全围绕OTel Semantic Conventions构建，强调vendor-neutral
- agntcy/observe SDK直接输出OTLP格式，支持任何兼容后端
- Dynatrace方案同时支持OneAgent（专有）和OpenInference（OTel标准）两种路径
- OTel Java Instrumentation通过字节码增强实现零代码埋点

**适用边界**: 对于资源受限场景（边缘设备），OTel SDK的依赖可能导致体积问题，此时需考虑轻量级替代。

### 发现 3：代码生成质量评估的「生成-执行分离」架构成为安全标准

**发现陈述**: 所有代码生成评估框架均采用「生成（GPU集群）」→「执行（隔离沙箱）」的分阶段架构，以确保安全性和可扩展性。

**技术原理分析**: 生成的代码不可信，必须在沙箱中执行。分离架构使得生成可以利用GPU大规模并行，执行可以在多CPU节点上安全运行。Docker容器是目前最广泛使用的执行隔离方案。

**工程证据**:
- bigcode-evaluation-harness提供专用的Dockerfile（evaluation-harness和evaluation-harness-multiple），支持在容器内安全执行
- Evalchemy明确警告BigCodeBench评估必须在Docker中执行
- 分离架构也支持分步调试：先生成保存、再独立评估

**适用边界**: 对于纯静态分析（BLEU等无需执行的指标），不需要沙箱；但pass@k等可靠指标必须执行验证。

### 发现 4：pass@k 是最核心的代码生成质量指标，但在生产环境存在局限

**发现陈述**: pass@k是学术评估的标准指标，但在生产级编程Agent场景中，需要通过更丰富的信号（工具调用成功率、用户采纳率、错误恢复能力）来补充。

**技术原理分析**: pass@k衡量的是「从n个候选中找到1个正确解」的概率，适合模型对比但不适合衡量真实开发体验。生产环境需要：用户采纳/拒绝率（反映实际有用性）、错误恢复成功率（反映鲁棒性）、任务完成时间（反映效率）。

**工程证据**:
- Dynatrace跟踪的engineering metrics包括：代码行数增减、Git commits、PR创建数 — 这是生产级指标
- CLI telemetry最佳实践强调：主动收集采纳/拒绝信号而非仅被动记录
- bigcode-evaluation-harness的pass@k实现：生成n样本，随机抽k计算通过率

**适用边界**: 模型选型阶段用pass@k，生产监控用行为指标，两者互补。

### 发现 5：事件模型设计需重点关注隐私合规和容量规划

**发现陈述**: 编程Agent的数据采集面临独特的隐私和容量挑战：CLI工具常在CI/CD中运行产生大量事件，且可能捕获敏感代码。

**技术原理分析**: CLI工具遥测与Web应用不同：(1) 用户期望更低，(2) 可能离线运行，(3) 可能在敏感环境中运行。需设计分层隐私策略：匿名化事件（默认）+ 可选的详细事件模式。

**工程证据**:
- CLI telemetry最佳实践6条中，隐私和容量各占两条
- Dynatrace方案中session.id和organization.id作为切分维度但不包含代码内容
- 业界模式：通过tracking plan预先定义收集字段，拒绝catch-all模式

**适用边界**: 开源开发工具（如Homebrew）更强调透明度和opt-out；企业产品（如GitHub Copilot）可以收集更多数据但有更强的合规要求。

### 发现 6：Agent Skills 模式是编程Agent自主应用instrumentation能力的创新模式

**发现陈述**: Dash0的agent-skills项目开创了一种新模式：将instrumentation知识编码为agent可自动加载的「技能」，让编程agent自主为应用添加可观测性。

**技术原理分析**: 传统上，开发者需要手动阅读文档来为应用添加instrumentation。Agent Skills将最佳实践编码为结构化规则（SKILL.md），agent在检测到匹配任务时自动应用这些规则。这本质上是一种「可观测性即代码」的演进。

**工程证据**:
- dash0hq/agent-skills 包含4个核心技能：instrumentation、semantic conventions、collector、OTTL
- 支持通过CLAUDE.md配置项目级别的自动加载
- skills CLI（npx skills add）实现跨工具的安装标准化

**适用边界**: 要求agent具有工具调用能力，且需要CLAUDE.md等配置文件支持。

---

## 3. 核心项目深度分析

### 3.1 dynatrace-oss/dynatrace-ai-agent-instrumentation-examples

- **定位与价值主张**: 展示如何为各类AI Agent（包括编程Agent）添加Dynatrace可观测性。不同于纯开源方案，它提供了企业级的一站式观测方案，特别包含对Claude Code、OpenAI Codex CLI、GitHub Copilot SDK等编程Agent的原生支持。

- **架构剖析**:
  - **总体架构**:
    ```
    AI Agent Code → Instrumentation Adapter (OneAgent / OpenInference)
         → OpenTelemetry Export Pipeline
              → Dynatrace Backend (存储/分析/可视化)
  ```
  - **关键抽象层**: 每个AI框架对应一个Instrumentation Module，共享底层数据模型。两种instrumentation路径：OneAgent（Dynatrace专有探针，零代码变更）和OpenInference（开源标准，需代码集成）
  - **扩展机制**: 通过增加新的Instrumentation Module支持新的AI框架

- **核心实现分析**:
  - 编程Agent特定指标：token消耗（按模型/用户/团队细分）、代码行数增减、Git commit数、PR创建数
  - 工具可观测性：每个工具调用的输入/输出、接受/拒绝决策、API错误
  - 会话级归因：session.id / user.id / organization.id 三维切片

- **设计模式提炼**: **适配器模式** — 统一instrumentation接口，各框架提供独立适配器实现。

- **生产就绪度评估**:
  | 维度 | 评分(1-5) | 说明 |
  |------|-----------|------|
  | 稳定性 | 4 | 企业级产品，经过大规模验证 |
  | 性能 | 4 | 异步导出，低开销 |
  | 可观测性 | 5 | 完整的trace/metric/log体系 |
  | 安全性 | 4 | 支持数据过滤和隐私控制 |
  | 文档质量 | 4 | 丰富的示例和教程 |
  | 社区支持 | 3 | 企业产品，社区贡献有限 |

- **已知问题**: Dynatrace依赖意味着厂商锁定；开源社区版功能有限。

---

### 3.2 bigcode-project/bigcode-evaluation-harness

- **定位与价值主张**: 专注于代码生成模型评估的框架，而非通用LLM评估。与lm-evaluation-harness核心区别在于：它原生理解代码生成任务的结构（测试用例驱动的验证、多语言支持、FIM模式），并提供安全执行沙箱。

- **架构剖析**:
  - **总体架构**:
    ```
    Model Generation Pipeline (GPU)
      → 生成n个候选代码解决方案
      → 保存为generations.json
      
    Code Execution Sandbox (Docker/CPU)
      → 加载generations.json
      → 对每个候选运行测试用例
      → 计算pass@k等指标
    ```
  - **关键抽象**:
    - 任务抽象（Task）：定义prompt模板、评估指标、测试运行器
    - 模型抽象（Model）：通过HuggingFace统一接口支持任何自回归模型
    - 执行抽象（Executor）：本地执行、Docker执行、远程执行

- **核心实现分析**:
  - pass@k实现策略：生成n个候选，枚举C(n,k)组合计算通过率
  - 支持两种生成模式：left-to-right（标准）和FIM（fill-in-the-middle）
  - 安全执行：Docker容器隔离，限制网络和文件系统访问
  - 评估任务注册表：YAML配置定义新任务，无需修改核心代码

- **性能特征**:
  - GPU生成阶段：vLLM等加速库支持，吞吐量取决于模型和GPU配置
  - 评估阶段：纯CPU运行，多Worker并行执行测试用例
  - 安全隔离开销：Docker容器启动时间约1-3秒

- **设计模式提炼**: **生成-执行分离(Generation-Execution Separation)** + **策略模式(Task Strategy)**。

- **生产就绪度评估**:
  | 维度 | 评分(1-5) | 说明 |
  |------|-----------|------|
  | 稳定性 | 4 | 成熟项目，被BigCode等大规模使用 |
  | 性能 | 4 | 多GPU生成 + Docker并行执行 |
  | 可观测性 | 3 | 评估结果结构化输出，但缺少运行时监控 |
  | 安全性 | 5 | Docker沙箱执行，严格隔离 |
  | 文档质量 | 4 | 完整的任务配置和贡献指南 |
  | 社区支持 | 4 | BigCode社区维护，活跃Issue讨论 |

- **已知问题**: 依赖特定HuggingFace模型版本；DS-1000等任务需要特定Python版本；大型模型的生成和评估耗时较长。

---

### 3.3 EleutherAI/lm-evaluation-harness

- **定位与价值主张**: 最广泛使用的LLM评估框架（12.9k Stars），涵盖60+学术基准和数百子任务。其代码生成评估能力通过集成bigcode-evaluation-harness实现。最新v0.4.0引入YAML配置、Jinja2模板、子命令CLI等重大改进。

- **架构剖析**:
  - **总体架构**:
    ```
    Model Abstraction Layer (hf / vLLM / SGLang / OpenAI API / local-completions)
      → Task Registry (60+ benchmarks, YAML-defined)
        → Metric Aggregation (pass@k, accuracy, F1, BLEU, etc.)
          → Result Output (JSON / leaderboard submission)
    ```
  - **关键抽象**:
    - Model Types：抽象不同后端的推理接口，支持TP、数据并行、模型并行
    - Task YAML：声明式任务定义，包括dataset、prompt、metric
    - Config System：覆盖默认配置的层次化配置

- **核心实现分析**:
  - 模型后端抽象：一致的`loglikelihood`和`generate`接口，屏蔽后端差异
  - 评估模式：生成式（greedy/sample）和似然式（loglikelihood）
  - 批量推理：自动batch size检测（`auto:N`语法），动态调整
  - 分布式评估：支持accelerate多GPU、vLLM、Tensor Parallelism

- **性能特征**:
  - 支持自动batch size调优，最大化GPU利用率
  - 量化模型支持：GPTQ、GGUF、bitsandbytes
  - 多模式评估：加速器+模型并行组合使用

- **设计模式提炼**: **策略模式(Model Backend Strategy)** + **工厂模式(Task Registry)** + **声明式配置(Declarative Task YAML)**。

- **生产就绪度评估**:
  | 维度 | 评分(1-5) | 说明 |
  |------|-----------|------|
  | 稳定性 | 5 | 最广泛使用的LLM评估框架 |
  | 性能 | 5 | 多后端优化，自动batch size |
  | 可观测性 | 4 | 详细的结果日志和指标 |
  | 安全性 | 4 | 支持沙箱执行 |
  | 文档质量 | 5 | 完善的CLI、API、任务文档 |
  | 社区支持 | 5 | 活跃的EleutherAI社区 |

---

### 3.4 agntcy/observe — Agent Observability SDK

- **定位与价值主张**: 专为多Agent系统设计的可观测性SDK，在OTel LLM Semantic Conventions基础上扩展了Multi-Agent System语义。以Python装饰器模式提供非侵入式instrumentation。

- **架构剖析**:
  - **总体架构**:
    ```
    Agent Code → @agent decorator / session_start()
         → OTel SDK (Spans, Metrics, Logs)
           → OTel Collector (receiver → processor → exporter)
             → ClickHouse (storage) → Grafana (visualization)
    ```
  - **数据模型**: AGNTCY Observability Schema，扩展自OTel LLM Semantic Conventions
  - **部署架构**: docker-compose一键启动Collector + ClickHouse + （可选）Grafana

- **核心实现分析**:
  - `Observe.init(app_name, api_endpoint)`：初始化SDK，配置OTLP endpoint
  - `@agent(name, description)`装饰器：自动包装agent函数，创建追踪span
  - `session_start()`上下文管理器：管理agent会话生命周期
  - Span Transform规则：通过OTTL表达式自定义span属性转换

- **设计模式提炼**: **装饰器模式(Decorator)** + **上下文管理器(Context Manager)** — 非侵入式、声明式的instrumentation。

- **生产就绪度评估**:
  | 维度 | 评分(1-5) | 说明 |
  |------|-----------|------|
  | 稳定性 | 3 | 较新项目，尚在迭代中 |
  | 性能 | 3 | 需要评估OTel SDK开销 |
  | 可观测性 | 4 | 完整的span/metric/log体系 |
  | 安全性 | 3 | 依赖OTel Collector安全配置 |
  | 文档质量 | 4 | 完善的Getting Started和Schema文档 |
  | 社区支持 | 2 | 较新的开源项目 |

---

### 3.5 dash0hq/agent-skills

- **定位与价值主张**: 厂商中立的OpenTelemetry技能包，让编程Agent自主为应用添加可观测性。本质上是「将可观测性最佳实践编码为agent可执行的规则」。

- **架构剖析**:
  - 技能包格式：遵循Agent Skills规范，每个技能包含SKILL.md文件
  - 自动匹配：agent在检测到匹配任务时自动加载技能规则
  - 跨工具兼容：支持Claude Code、Cursor、Tessl等

- **核心实现分析**:
  - Instrumentation Score规则：量化OTel最佳实践遵循程度的规范
  - Semantic Conventions规则库：覆盖资源、Span、Metrics的标准命名
  - Collector配置指南：Receiver/Processor/Exporter管道配置最佳实践
  - OTTL表达式库：常用的telemetry转换和过滤模式

- **设计模式提炼**: **声明式知识编码(Declarative Knowledge Encoding)** — 将专业领域知识编码为结构化规则文件，agent按需加载。

- **生产就绪度评估**:
  | 维度 | 评分(1-5) | 说明 |
  |------|-----------|------|
  | 稳定性 | 3 | 相对较新的概念 |
  | 性能 | 5 | 零运行时开销（仅在agent交互时使用） |
  | 可观测性 | 5 | 产出就是可观测性最佳实践 |
  | 安全性 | 4 | 遵循OTel安全最佳实践 |
  | 文档质量 | 4 | 完善的技能文档 |
  | 社区支持 | 2 | 新兴技术 |

---

## 4. 工具生态总览

| 工具/项目 | Stars | 定位 | 核心架构模式 | 性能特征 | 生产就绪度 | 推荐度 |
|----------|-------|------|------------|---------|-----------|--------|
| dynatrace-ai-agent-instrumentation | ~50 | 企业Agent观测方案 | 适配器模式 + OTel管道 | 低开销异步导出，企业级 | 高 | ★★★★☆ |
| dash0hq/agent-skills | 65 | Agent OTel知识技能包 | 声明式知识编码 | 零运行时开销 | 中 | ★★★★☆ |
| open-telemetry/java-instrumentation | 2.6k | OTel Java自动埋点 | 字节码增强 + 模块化 | JVM Agent级，接近零开销 | 高 | ★★★★★ |
| agntcy/observe | 56 | 多Agent观测SDK | 装饰器 + OTel管道 | SDK开销<5% | 中 | ★★★☆☆ |
| bigcode-evaluation-harness | 1k | 代码生成评估 | 生成-执行分离 | GPU+CPU混合 | 高 | ★★★★★ |
| lm-evaluation-harness | 13k | 通用LLM评估 | 策略模式 + 任务工厂 | 自动batch优化 | 高 | ★★★★★ |
| evalchemy | ~200 | 统一评估工具 | lm-eval封装扩展 | 同lm-eval | 中 | ★★★★☆ |

---

## 5. 架构模式与设计决策

### 5.1 涌现的架构模式

**模式 1: 适配器式Instrumentation（Adapter-based Instrumentation）**
- 代表项目: dynatrace-ai-agent-instrumentation-examples, agntcy/observe
- 模式描述: 为每个AI框架/Agent SDK提供独立的instrumentation适配器，共享统一数据模型
- 为什么有效: Agent框架生态碎片化严重（OpenAI Agents SDK、LangGraph、CrewAI、MCP等），适配器模式隔离了框架差异
- 适用条件: 需要支持多种Agent框架的场景

**模式 2: 生成-执行分离（Generation-Execution Separation）**
- 代表项目: bigcode-evaluation-harness, Evalchemy
- 模式描述: 代码生成（GPU密集型）和执行评估（CPU + 安全隔离）分离为独立阶段
- 为什么有效: (1) 安全—不可信代码在沙箱中执行，(2) 可扩展—各自独立扩缩容，(3) 灵活—可独立替换生成或评估组件
- 适用条件: 所有涉及代码执行的评估场景

**模式 3: 声明式任务定义（Declarative Task Definition）**
- 代表项目: lm-evaluation-harness, Evalchemy
- 模式描述: 通过YAML配置文件定义评估任务（数据集、Prompt、指标），而非硬编码
- 为什么有效: 降低添加新任务的成本，支持社区贡献，便于版本控制
- 适用条件: 需要频繁添加/修改评估基准的场景

### 5.2 关键设计决策的 Trade-off 矩阵

| 设计决策 | 方案A | 方案B | 选择依据 | 代表性项目 |
|---------|-------|-------|---------|-----------|
| 数据采集时机 | 实时（同步导出） | 异步（批量导出） | 异步不阻塞Agent执行，CLI场景更友好 | Dynatrace(异步), CLI best practices(异步) |
| 评估执行方式 | 立即执行（内联） | 分离执行（沙箱） | 安全性优先时选沙箱，速度优先时内联 | bigcode(沙箱), lm-eval(可选) |
| 数据模型标准 | OpenTelemetry OTLP | 自研协议 | OTLP获得广泛生态支持，但可能有性能开销 | 全部采用OTLP |
| 隐私策略 | opt-out(默认开启) | opt-in(默认关闭) | 产品成熟度越高越倾向opt-out | CLI工具倾向opt-in |
| 指标聚合粒度 | per-session | per-request | 编程Agent场景以session为单元更有意义 | Dynatrace(session), bigcode(request) |

### 5.3 反模式与常见陷阱

1. **Catch-all 遥测收集**: 直接记录 `process.argv` 或完整输入，导致PII泄露。**应使用tracking plan预定义收集字段。**
2. **阻塞式遥测导出**: 在网络不可用时阻塞CLI命令退出。**应将遥测设为best-effort，超时不重试。**
3. **单一pass@k指标崇拜**: 仅用pass@k衡量编程Agent质量，忽略采纳率、恢复能力等生产指标。**应建立多维度指标体系。**
4. **未规划容量的遥测管道**: CLI在CI/CD中可能产生百万级事件/天，导致第三方分析服务成本失控。**在选型时评估成本，设置kill switch。**
5. **忽略Semantic Conventions**: 使用自定义属性名导致仪表盘、告警规则无法开箱即用。**严格遵循OTel Semantic Conventions。**

---

## 6. 技术栈选型指南

### 6.1 按场景推荐

**场景一: 构建编程Agent的数据采集管道（从零开始）**
- **推荐方案**: OpenTelemetry SDK（语言对应）+ agntcy/observe-like decorator模式 + OTel Collector + 任意OTLP兼容后端
- **选型理由**: OTel是业界标准，decorator模式提供非侵入式instrumentation，Collector提供灵活的数据处理
- **架构适配性分析**: 适合Python/TypeScript生态的Agent框架
- **注意事项**: 初期避免过度instrumentation，从session级别的trace开始，逐步细化

**场景二: 构建代码生成质量评估系统**
- **推荐方案**: bigcode-evaluation-harness（评估框架）+ Docker（安全执行）+ pass@k + 生产行为指标
- **选型理由**: bigcode-evaluation-harness是代码生成评估的专用框架，比通用lm-eval更贴合代码场景
- **架构适配性分析**: 需要GPU集群（生成）+ CPU集群（评估）的混合基础设施
- **注意事项**: 安全执行是第一优先级，永远不要在无沙箱时执行生成的代码

**场景三: 企业级编程Agent观测平台**
- **推荐方案**: Dynatrace（全栈观测）+ OpenTelemetry（开放标准）+ OTel Collector（数据管道）
- **选型理由**: 企业级产品的稳定性、SLA、合规支持
- **注意事项**: 注意厂商锁定风险，保留OTLP标准输出作为迁移路径

### 6.2 选型决策树

```
需要生产级Agent可观测性？
  ├── 是 → 需要厂商支持的SLA？
  │        ├── 是 → Dynatrace / Datadog（商业方案）
  │        └── 否 → OpenTelemetry + 自建后端（开源方案）
  └── 否 → 需要代码生成质量评估？
           ├── 是 → 需要多语言支持？
           │        ├── 是 → bigcode-evaluation-harness + MultiPL-E
           │        └── 否 → 单语言 → bigcode-evaluation-harness
           └── 否 → 需要模型对比评估？
                    ├── 是 → lm-evaluation-harness / Evalchemy
                    └── 否 → 最简化：直接调用LLM API + 日志记录
```

---

## 7. 快速上手路线

```
第 1 步: 概念理解 + 环境搭建 — 预计 4 小时
  关键动作:
  - 阅读 OpenTelemetry Semantic Conventions 文档
  - 安装 OTel Collector（docker-compose up）
  - 选择一个Agent框架并运行dynatrace-instrumentation-examples中的demo
  验证标准: 能够在本地看到完整的trace链路

第 2 步: 核心instrumentation实现 — 预计 8-16 小时
  关键动作:
  - 使用agntcy/observe SDK或自建decorator为Agent添加tracing
  - 配置关键指标：token消耗、工具调用、错误率
  - 实现session.id/user.id归因
  验证标准: Agent运行时产生完整的trace和metric数据

第 3 步: 质量评估管道建设 — 预计 16-24 小时
  关键动作:
  - 搭建bigcode-evaluation-harness + Docker执行沙箱
  - 定义评估任务（HumanEval/MBPP等）
  - 集成生产行为指标（采纳率、错误恢复等）
  验证标准: 能够自动运行评估并输出结构化指标报告

第 4 步: 生产部署 — 预计 8-16 小时
  关键动作:
  - OTel Collector生产部署（Kubernetes DaemonSet / Sidecar）
  - 配置数据采样策略（head-based / tail-based）
  - 设置告警规则（高错误率、异常延迟等）
  - 实现隐私合规（PII过滤、数据保留策略）
  验证标准: 生产环境稳定运行24小时，数据完整
```

---

## 8. 生产部署检查清单

- [x] 性能基准测试: OTel SDK开销通常 <5%，但需在目标环境中验证
- [x] 监控与可观测性: Span/Metric/Log 三驾马车，重点关注：API延迟、Token消耗、工具调用成功率、错误分布
- [x] 故障恢复策略: Collector高可用部署 + 数据缓冲（文件fallback）+ 降级策略（遥测失败不阻塞Agent）
- [x] 安全审计: PII过滤规则、数据最小化原则、传输加密（TLS）、访问控制（Collector auth）
- [x] 容量规划: 每Agent/日 ~10K-100K span（取决于调用频率）；CLI在CI/CD中可能放大10-100倍
- [x] 隐私合规: 为所有收集字段建立tracking plan；提供opt-out机制（命令/环境变量/全局配置三种方式）；符合GDPR数据本地化要求
- [ ] 测试策略: 埋点代码需要有单元测试覆盖（验证span属性正确）；定期进行端到端可观测性验证

---

## 9. 参考来源

| # | 标题 | URL | 来源类型 | 技术深度 | 检索轮次 |
|---|------|-----|----------|---------|----------|
| 1 | Dynatrace AI Agent Instrumentation Examples | https://github.com/dynatrace-oss/dynatrace-ai-agent-instrumentation-examples | github | principle | 1 |
| 2 | Dash0 Agent Skills - OpenTelemetry for Coding Agents | https://github.com/dash0hq/agent-skills | github | principle | 1 |
| 3 | OpenTelemetry Java Instrumentation | https://github.com/open-telemetry/opentelemetry-java-instrumentation | github | principle | 1 |
| 4 | AGNTCY Observe - Multi-Agent Observability SDK | https://github.com/agntcy/observe | github | principle | 1 |
| 5 | Databricks - Production-ready tracing with OpenTelemetry | https://www.databricks.com/blog/observability-any-agent-anywhere-production-read | engineering_blog | principle | 2 |
| 6 | AI Agent Monitoring Guide | https://openobserve.ai/blog/ai-agent-monitoring | engineering_blog | implementation | 2 |
| 7 | OpenTelemetry for AI Agents (MCP) | https://www.mintmcp.com/blog/opentelemetry-ai-agents | deep_tutorial | implementation | 2 |
| 8 | BigCode Evaluation Harness | https://github.com/bigcode-project/bigcode-evaluation-harness | github | implementation | 3 |
| 9 | EleutherAI LM Evaluation Harness | https://github.com/EleutherAI/lm-evaluation-harness | github | implementation | 3 |
| 10 | Evalchemy - Unified Evaluation Toolkit | https://github.com/mlfoundations/evalchemy | github | implementation | 3 |
| 11 | 6 Telemetry Best Practices for CLI Tools | https://marcon.me/articles/cli-telemetry-best-practices | engineering_blog | implementation | 4 |
| 12 | Groundcover AI Agent Observability Guide | https://www.groundcover.com/learn/observability/ai-agent-observability | engineering_blog | surface | 2 |
| 13 | OTel Weaver - Observability by Design | https://opentelemetry.io/blog/2025/otel-weaver | official_docs | surface | 4 |
| 14 | OpenTelemetry Go Instrumentation | https://opentelemetry.io/docs/languages/go/instrumentation | official_docs | surface | 5 |
| 15 | OpenTelemetry Tracing Guide | https://vfunction.com/blog/opentelemetry-tracing-guide | deep_tutorial | surface | 5 |
