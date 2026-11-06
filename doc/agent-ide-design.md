# Agent Workbench：方案设计

**日期：** 2026-10-22  
**文档拆分：** 2026-11-06；竞品能力对照、Axon 专项分析与官方来源见[竞品调研](agent-ide-competitive-research.md)。
**定位：** 面向“用自然语言编写和运行工作流”的工程师工作台，而不是给传统代码编辑器增加一个聊天侧栏。

## 1. 结论先行

本方案以**工作流本身**作为一等工程资产：可发现、可组合、可执行、可暂停接管、可回放、可评测、可发布。代码是工作流产生的一类产物。依据[竞品调研](agent-ide-competitive-research.md)，控制面和执行留痕已有相近竞品覆盖，差异化需要通过资产可移植性、证据对账和质量回归验证。

建议产品定位为：

> **Workflow-first Agent Workbench：以 Markdown 工作流为源代码，以 Agent 运行时为执行引擎，以证据和评测为质量门，以 VS Code 级工作区为交互载体。**

内部已有组件可以形成五层闭环：

- **工作流资产层：** Markdown agent、skill、workflow、spec、policy、eval。
- **执行控制层：** Opsbot 的 Loop Engine、Reviewer、暂停/修改/继续、运行时 Driver。
- **兼容接入层：** Claude Code、OpenCode、Codex CLI 及 cpx wrapper，统一 session/trace/artifact 契约。
- **观测层：** Insight 的链路、运行、Skill 生命周期和 A/B 数据。
- **质量层：** Sift 的评测、遵循性审计、校准、post-hoc gate 和 CI 输出。

第一阶段不应试图重新实现一个通用 IDE 或训练平台，而应围绕“把一份 Markdown 工作流可靠地跑完并交付可审查结果”建立强产品闭环。

## 2. 用户和任务变化

传统 IDE 的基本单位是文件、符号、编辑、编译、调试。Agent 工程的基本单位变成：

1. **意图：** 用自然语言描述目标、边界和验收条件。
2. **工作流：** 规定阶段、角色、工具、上下文和门禁。
3. **运行：** Agent 在本地、远程或隔离 worktree 中执行。
4. **证据：** 产出文件、测试、日志、截图、trace、决策和人工接管记录。
5. **复用：** 将成功运行沉淀为 skill、agent、模板或评测题。

当前 VS Code 仍把 Markdown 当作普通文档，把 Agent 对话当作一个侧面板，把终端和 Git 当作人工操作工具，因此用户需要在多个窗口之间拼接上下文。新工作台的核心对象应该是一个 **Workflow Run**，而不是一个 Chat conversation。

## 3. 产品定义

### 3.1 核心对象模型

```text
Workspace
  ├── Workflow Package
  │     ├── workflow.md       # 阶段和执行逻辑
  │     ├── agents/*.md       # 角色和工具权限
  │     ├── skills/*/SKILL.md # 可复用能力
  │     ├── spec/             # requirements/design/tasks
  │     ├── policies/         # 安全、审批、交付规则
  │     └── evals/            # 验收题、断言、基准
  ├── Run
  │     ├── plan / steps / handoffs
  │     ├── sessions / tool calls / approvals
  │     ├── artifacts / diffs / test reports
  │     └── scorecard / audit / cost
  └── Delivery
        ├── commit / PR / release note
        └── reusable learning
```

### 3.2 工作流文件建议

保持 Markdown 可读，同时用轻量 front matter 描述可执行元数据：

```markdown
---
name: release-readiness
version: 0.3.0
entry: manual
runtime: [claude_code, opencode, codex_cli]
permissions: review-first
artifacts: [release-checklist.md, test-report.json]
gates: [tests-pass, sift-compliance, human-approval]
---

# Release readiness

## Inputs
- 当前分支和目标版本
- 变更范围与发布风险

## Steps
1. 读取变更和历史发布约束。
2. 并行运行测试、依赖审计和文档检查。
3. 汇总冲突，生成发布建议。
4. 在门禁通过后请求人工批准。

## Failure handling
- 测试失败：保留日志，进入修复子流程。
- 高风险命令：暂停并请求审批。

## Acceptance
- 产出清单、测试证据和未解决风险。
```

文件是源代码，但运行时必须编译出结构化计划：步骤依赖图、可用工具、权限策略、输入输出 schema、重试策略、超时和门禁。这样既保持自然语言的表达力，又避免把执行完全交给不可见的 prompt。

### 3.3 三种运行形态

- **Local Run：** 使用当前 workspace 和本地凭据，适合探索、调试和小改动。
- **Isolated Run：** 自动创建 worktree/容器，适合并行任务、长任务和不可信输入。
- **Cloud Run：** 远程持续运行，允许关机后继续，完成后返回可审查证据包。

三种形态共享同一 Run schema 和 UI。切换运行形态不应改变工作流语义。

## 4. 交互方案

### 4.1 工作区布局

1. **Workflow Explorer（左侧）**：按 `agents / workflows / skills / specs / policies / evals` 分组，显示来源、版本、触发方式、最近运行和质量分。
2. **Canvas / Markdown Editor（中间）**：编辑 Markdown；结构化标题自动生成步骤图、依赖图和输入输出提示；支持从运行结果回写工作流草稿。
3. **Run Control（右侧）**：阶段时间线、当前 Agent、工具调用、权限请求、token/成本、产物和失败原因；按钮是暂停、接管、修改、重试、分叉、回滚。
4. **Evidence Drawer（底部）**：diff、测试、日志、截图、trace、评测报告和审计结论，所有结论可跳回原始调用。

### 4.2 从“聊天”转向“运行”

输入框仍存在，但每次提交先生成可编辑的 Run Plan：

- 目标和非目标
- 将使用的 workflow/skills/agents
- 预计阶段和产物
- 权限和高风险动作
- 验收条件

用户可以直接开始，也可以修改计划。运行中每个阶段都是可暂停的状态机，用户的自然语言修订成为事件，而不是追加到一个无限聊天上下文中。

### 4.3 关键交互

- 点击文件只负责选择和查看；“跳到运行步骤”由时间线按钮完成，保留普通编辑器的导航和滚动行为。
- 对话消息、工具调用和产物使用稳定 locator，可从报告定位到 transcript、Markdown 行和文件 diff。
- 同一工作流支持“试运行/基准运行/生产运行”三种模式，避免把探索期的低质量结果混进生产统计。

## 5. 体系架构

```text
┌────────────────────────────────────────────────────────────┐
│ Agent Workbench UI                                        │
│ Workflow Explorer | Markdown/Plan | Run Control | Evidence │
└───────────────────────┬────────────────────────────────────┘
                        │ Run API / Event Stream
┌───────────────────────▼────────────────────────────────────┐
│ Workflow Control Plane                                     │
│ parser/compiler · DAG/state machine · approvals · artifacts│
│ retry/resume/fork · policy · delivery adapters             │
└──────────────┬────────────────────┬────────────────────────┘
               │                    │
      ┌────────▼────────┐  ┌────────▼───────────┐
      │ Runtime Adapter  │  │ Quality & Evidence  │
      │ Opsbot Drivers   │  │ Insight + Sift      │
      │ Claude/OpenCode  │  │ trace / eval / gate  │
      │ Codex / cpx      │  │ score / audit / CI   │
      └──────────────────┘  └─────────────────────┘
               │
      Local / worktree / container / cloud execution
```

### 5.1 复用现有组件

- **Opsbot：** 作为长任务执行内核和可接管控制面；抽出稳定的 Run、Step、Approval、Artifact、Driver 接口。
- **Insight：** 作为统一事件和 trace 层，补充 workflow/step/artifact/policy 维度；保留框架无关和自托管优势。
- **Sift：** 作为工作流质量门：结果评分、过程遵循性、校准、盲比较、post-hoc gate 和 CI JSON。
- **cpx：** 继续作为 CLI wrapper/argv 前缀，不把它提升为独立 runtime；在 Adapter 层记录 wrapper、真实 runtime 和可定位的 session 文件。
- **CANNBay / 领域插件：** 作为领域应用和产物查看器，通过 `InsightDataPort` 等能力接口接入，不把领域数据库耦合进工作台核心。

### 5.2 事件和数据契约

最小事件集合：`run.created`、`plan.approved`、`step.started`、`tool.called`、`approval.requested`、`artifact.created`、`step.failed`、`step.completed`、`gate.evaluated`、`run.paused`、`run.resumed`、`run.delivered`。

每个事件至少包含：`run_id`、`workflow_id/version`、`step_id`、`agent_id`、`runtime`、`wrapper`、`workspace`、`parent_event_id`、时间戳、权限上下文、输入/输出引用和敏感信息脱敏后的摘要。

## 6. MVP 边界（12 周）

### P0：一个可靠的本地闭环（第 1–4 周）

- Electron 桌面壳（编辑器能力用 Monaco 组件组装）；打开 workspace 后发现工作流包。
- Markdown workflow parser + front matter 校验。
- Opsbot 作为执行后端，支持 Claude Code/OpenCode/Codex CLI 三种 adapter。
- Run Plan、阶段时间线、暂停/继续/人工修改、diff 和测试结果。
- 统一 session/trace/artifact schema；Insight 展示单次运行。

### P1：质量和复用（第 5–8 周）

- Sift 作为 workflow gate：结果、遵循性、校准和 JSON 报告。
- 工作流版本、基准题集、A/B 运行和回归对比。
- 从成功运行生成 workflow/skill 草稿，但必须经过 review 才能写回仓库。
- 运行结果可生成 PR 描述、变更摘要和证据包。

### P2：并行和远程（第 9–12 周）

- worktree 隔离、并行 runs、依赖图和合并前冲突检查。
- 云端/远程 worker 适配；关闭本地窗口后继续运行。
- 团队 policy、allowlist、审批角色和成本预算。
- 组织级 workflow registry 与私有模板分发。

## 7. 不做什么

- 不在第一阶段自研基础模型或替换所有 Agent CLI。
- 不把每个工具都做成一个独立 UI；工具通过 Adapter/MCP 接入，Run UI 统一呈现。
- 不把所有自然语言都隐式执行；任何会改文件、联网、提交、发布或产生费用的动作都必须可见并受 policy 控制。
- 不用“代码行数”衡量价值；以成功交付、首轮通过率、人工介入、返工、延迟、成本和证据完整度衡量。

## 8. 竞争壁垒和验证指标

### 8.1 产品壁垒

1. **跨运行时可移植性：** 同一 workflow 可在 Claude/OpenCode/Codex 运行，结果 schema 不变。
2. **过程证据：** 不只展示最终 diff，还能证明步骤、工具、权限和门禁是否按声明执行。
3. **可进化资产：** 每次运行都能成为 eval、skill 修订和 workflow 改进的数据源。
4. **接管式自治：** Agent 长时间运行，但用户始终能在阶段边界暂停、修改、回滚和分叉。
5. **领域插件边界：** CANNBot、算子生成、文档工程等领域能力通过插件挂载，核心保持通用。

### 8.2 首批实证指标

对固定任务族建立历史 baseline、shadow run 和难度匹配的人工/传统 Agent control：

- 成功交付率、首轮通过率
- 从启动到交付的 wall-clock 时间
- 人工介入次数和介入分钟数
- 返工率、恢复成功率、失败原因分布
- 每次成功交付的 token / 模型 / worker 成本
- 工作流遵循性、门禁误放行率、证据完整率
- workflow/skill 复用率和版本回归率

不要从“具备自动化能力”直接推导 ROI；先证明固定任务族在质量不下降时的周期、人工介入和成本变化。

## 9. 建议的第一条用户路径

用户打开一个已有仓库，选择 `feature-delivery.md`，系统生成计划：需求澄清 → 代码探索 → 实现 → 测试 → Sift 审计 → 人工 review → PR。用户在计划上改一行验收条件，点击运行。Opsbot 在隔离 worktree 中执行，Insight 显示每个阶段和工具调用，遇到高风险命令暂停。完成后，Sift 给出结果分、过程遵循性和 gate 判定；用户在 Evidence Drawer 中查看 diff、测试日志和关键 transcript，批准后生成 PR。下一次运行复用同一 workflow，并自动比较上次基线。

这条路径足以让用户感受到它不是“VS Code 里多了一个聊天框”，而是一个可以编写、运行、审查和改进工程流程的工作台。

## 10. 关键风险和决策

- **协议漂移：** 先固定 Run/Event/Artifact/Policy 四个内部契约，再接更多 runtime；不要让每个 runtime 直接修改 UI。
- **上下文膨胀：** workflow 使用渐进式披露，元数据先发现，正文和参考资料按步骤加载。
- **自动化失控：** local/isolated/cloud 三种执行边界和权限模式必须在 Run Plan 中可见；高风险动作不可被工作流正文绕过。
- **评测与生产混淆：** 每个运行标记 purpose 和 dataset，报告分离探索、基准、生产结果。
- **UI 过重：** 首版只做一个高质量 Run Control 和 Evidence Drawer；Canvas、可视化编排器放到验证后。

## 11. 近期行动清单

1. 在 Opsbot 中冻结 Run/Step/Approval/Artifact/Driver 接口，并写一份 ADR。
2. 在 Insight 中增加 workflow、step、artifact、gate、policy 字段和统一事件导入。
3. 在 Sift 中增加 workflow 级 gate schema，支持工作流声明与实际执行的逐条对账。
4. 选一个真实任务族（例如算子生成或发布准备）做 20–30 个 baseline/shadow/control 样本。
5. 做一个桌面 App vertical slice：发现 Markdown → 生成计划 → 运行 → 暂停/继续 → 查看证据 → Sift gate。
6. 用四类竞品做可用性对照：VS Code custom agent、Cursor Cloud Agent、Kiro Spec、Axon Gateway/Node；比较“从意图到可审查交付”的步骤数、等待时间和证据完整度，并对 Axon 增加节点恢复、审批和工作流可移植性验证。

## 12. 技术形态决策：独立 IDE + 本地服务 + Web 控制面（2026-11-03 修订）

> **决策记录（2026-11-03）**：本工具定位为**独立 IDE**——用户在做工作流时全程留在本工具内（写 workflow → 运行 → 审证据 → 改代码），不跳回 VS Code。编辑器能力路线选定 **B：自研壳 + 组件组装**（Electron + Monaco / xterm.js / LSP），**不 fork VS Code**（fork 的转向判据见文末）。本节其余内容为修订后的形态描述。

采用三层形态：

1. **主工作台：独立 Desktop App（当前路线）**
   - 自研壳复用 VS Code 工作台边界（NavigationRail / Explorer / Editor Part / Panel，见 doc/vscode-workbench-adaptation.md）；编辑器能力用同源组件组装：**Monaco**（编辑、语法高亮、diff）、**xterm.js**（终端）、**monaco-languageclient**（LSP）。
   - 不重造编辑器长尾：SCM 用 git CLI 封装、搜索用 ripgrep、调试器与扩展市场不在 MVP 范围，按需演进。
   - 用户不跳回 VS Code；如需在外部编辑器打开文件，由本工具发深链，反向不成立。

2. **执行后端：本地 companion service**
   - Opsbot、runtime adapters、Insight collector、Sift runner 运行在本地进程或 workspace-sidecar 中。
   - 桌面壳只负责 UI 和命令编排，不把长任务状态放在渲染层内。
   - 通过 localhost HTTP/SSE 或 WebSocket 通信，未来可把同一协议切到远程 worker。

3. **远程控制面：Web**
   - 用于查看 Cloud Run、手机/浏览器发起任务、团队运行列表、质量报表和审批。
   - Web 不承担本地文件编辑、终端执行和本机凭据管理。

### 形态比较

| 形态 | 适合 | 优点 | 主要问题 | 建议 |
|---|---|---|---|---|
| VS Code Extension | 本地工作流编写和运行 | 文件、Git、终端、Remote、Worktree 都在同一上下文；用户迁移成本低 | 受 Extension API、发布和宿主生命周期约束；用户在 VS Code 内而非本工具内 | 暂不采用（产品定位要求全程留在本工具） |
| 独立 Desktop App | IDE 定位的工作流控制台、长期运行、强隔离 | 可控制 Electron、后台进程和升级；产品体验自由；无上游同步负担 | 编辑器能力需组件组装（Monaco/xterm.js/LSP） | **当前路线（2026-11-03 定）** |
| Web App | 云端运行、团队协作、手机审批、运行报表 | 部署和协作方便；天然适合远程 Worker | 本地文件、终端、凭据、Worktree 和网络权限受限 | 作为远程控制面 |

### 推荐的技术栈

- **Desktop shell：** Electron + React；编辑器能力组装 Monaco（编辑/语法高亮/diff）、xterm.js（终端）、monaco-languageclient（LSP），不 fork VS Code。
- **Local service：** 复用 Opsbot 的 Python 核心；提供 Run API、事件流、状态恢复、权限和 artifact 引用。
- **Event transport：** MVP 使用 HTTP + SSE；需要双向控制时增加 WebSocket。事件持久化由服务端负责，UI 断线后通过 `run_id` 重放。
- **契约：** OpenAPI/JSON Schema 固化 Run、Step、Approval、Artifact、Event、Gate；不要让 UI 直接读取各 runtime 的私有日志。
- **Persistence：** 本地 SQLite 保存运行元数据和事件索引，文件/日志/截图存 artifact directory；未来可替换为 Postgres + object storage。
- **Remote：** 保持同一 Run API，把 local service 替换为 remote worker gateway；Web 和 Desktop App 都是客户端。
- **Packaging：** `opsbot` 作为 CLI/服务包，Desktop App 作为独立 Electron 发行（自有更新渠道）；两者通过版本化协议兼容，不把 Python runtime 打进前端 bundle。

### 独立 App 的边界原则与 fork 转向判据（2026-11-03）

独立 App 已定为当前路线，但边界是“Agent Control Center”型，不复制完整 VS Code：保留 Markdown/Workflow 编辑、Run Control、Evidence、Git 交付；编辑器能力以 Monaco 提供扎实的代码阅读 / diff 审查 / 就地修改，编辑器长尾功能（调试器、扩展市场）不在 MVP 范围。

**不 fork VS Code**（Cursor 路线被评估后否决）：本产品的差异化是工作流编排与证据链，不是 AI 原生编辑，fork 的最大收益（深入 text model / diff 引擎）用不上，而其上游同步成本（VS Code 每月发版，需专职 merge 团队）、扩展市场替换（Open VSX）、遥测/品牌/更新通道剥离均是负资产。以下条件**同时成立**时才重新评估 fork：

- 产品验证后发现核心场景变成“AI 原生改代码”（补全、inline diff、多文件编辑成为主交互）；
- 需要官方扩展市场或 VS Code 级调试/Remote 能力，且 Monaco 组装路径已被证明覆盖不了；
- 团队规模足以承担上游同步。

架构纪律保证该决策无沉没成本：**服务层与 UI 经协议解耦**（`shared/protocol.ts`、OpsbotClient、insight 服务调用均壳无关）。若未来转向 fork，运行控制面可整体迁入 VS Code 的 webview/panel，损失仅限于 React UI 层。
