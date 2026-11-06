# Agent Workbench：竞品调研

**初稿日期：** 2026-10-22

**更新日期：** 2026-11-06，补充 Axon，并从方案设计中拆分。

**范围：** Agent 编码工具、工作流资产与任务执行控制面。Axon 分析依据公开资料，未安装实测；其余竞品沿用原调研内容，本次未重新核验。

产品方案见[Agent Workbench 方案设计](axcor-studio-design.md)。

## 1. 趋势与设计启示

现有产品正在从“代码补全”迁移到“Agent 执行”：VS Code 已经提供 Agents window、Markdown custom agents、handoff、subagents 和本地/云端 automations；Cursor 提供 Cloud Agents、background subagents、运行权限模式和远程执行；Windsurf/Devin 把可复用工作流直接定义成 Markdown；Kiro 用 `requirements.md`、`design.md`、`tasks.md` 组织规格驱动开发；Claude Code 用 `SKILL.md` 把可复用流程封装成技能。

上述编码产品主要围绕“一个 Agent 帮我改代码”；新增调研的 Axon 则已面向跨机器、跨业务的任务执行，公开介绍统一网关、节点调度、审批和留痕能力。下一代工作台应把**工作流本身**作为一等工程资产：可发现、可组合、可执行、可暂停接管、可回放、可评测、可发布。代码只是工作流产生的一类产物；控制面和执行留痕本身也不足以构成独有优势。

## 2. 竞品能力对照

| 产品 | 已有能力 | 设计启示 | 明显空白 |
|---|---|---|---|
| VS Code Agents | Agents window 统一管理会话；`.agent.md` 自定义 Agent；工具限制；handoff；subagents；本地/云端 automations | 证明 Agent 可以成为工作区一级入口，Markdown 配置可进入团队仓库 | 运行证据、过程遵循性和跨运行时质量闭环仍分散在 GitHub/Copilot 生态 |
| Cursor | Cloud Agents 在隔离 VM 中长时间运行；可生成 PR、视频、截图和日志；foreground/background subagents；Run Modes | 远程长任务和可接管执行会成为标配，权限策略必须显式化 | 工作流资产和评测资产仍以模式/提示为主，跨 Agent 框架的可移植性有限 |
| Windsurf / Devin Desktop | 工作流存为 `.devin/workflows/*.md` 或旧 `.windsurf/workflows/*.md`，通过 `/name` 手动调用；Skill 用于自动发现 | Markdown 工作流是自然的团队共享接口；“手动 Workflow / 自动 Skill”是有用的语义分层 | 工作流仍偏 Cascade 专用；运行历史、质量门和版本化结果不足 |
| Kiro | Specs 生成 `requirements.md`、`design.md`、`tasks.md`；Steering 用 Markdown 注入持久项目知识；支持并行任务、hooks、custom agents | 规格、设计、任务和项目约束应该是显式、可审查的文件 | 规格到运行到证据的闭环仍主要围绕单一 IDE/Agent 体验 |
| Claude Code | `SKILL.md` 及支持文件；按需加载；可手动 `/skill-name` 或自动触发；支持子 Agent 和动态上下文 | Skill 应采用渐进式披露，避免所有规则常驻上下文；目录即分发单元 | CLI 强而 UI 弱；运行图、团队治理和质量比较需要外接工具 |
| Cline / Roo 类工具 | MCP 外部工具连接；本地 Agent 编辑和命令执行 | 工具协议应开放，连接器不应锁死在单一产品 | MCP 工具多时发现、权限、成本和结果质量容易失控 |
| [Axon](https://axon-ai.cn/zh-CN) | 官网介绍 Gateway 统一入口和调度、Node 跨机器执行、内置本地节点的桌面端，以及审批、沙箱、限流和执行留痕 | 与工作流控制面直接重叠；桌面与远程节点共享执行能力值得对照 | 本次公开资料尚未确认 Markdown 工作流版本化、跨 Agent CLI 语义兼容、过程遵循性评测与回归门禁，需实测 |

**竞争判断：**

- 只做“更好的聊天编码”会直接进入 Cursor、Copilot、Windsurf 的红海。
- 只做“Markdown 工作流编辑器”会被 `.agent.md`、`SKILL.md`、Kiro Specs 和 Windsurf Workflows 快速复制。
- 更有防御力的切入点是 **Workflow Control Plane + Evidence-based Quality Loop**：让工作流可以在多个 Agent runtime 中执行，并把每一步的工具、权限、上下文、产物和质量判定记录成可复用证据。
- Axon 已覆盖相近的控制面叙事；上述切入点仍是待验证的差异化假设，应通过工作流资产可移植性、证据对账和质量回归证明优势。

## 3. Axon 专项补充（2026-11-06）

**公开能力与定位。** [官网](https://www.axon-ai.cn/)将产品定位扩展到科研、工业和运维等实际任务；Gateway 汇集网页、桌面、IM 和终端请求，调度模型与节点，记录执行过程。桌面应用内置本地节点，企业支持包含私有化部署。该定位与本方案的 Desktop + local service + remote worker 存在直接交集，应纳入核心对照组。

[Node 产品页](https://www.axon-ai.cn/zh-CN/product/node)介绍本机命令、文件、浏览器和桌面操作，支持 Linux、Windows、macOS、容器与 K8s Pod；通过长连接接入 Gateway，并提供断线恢复、技能分发及多机协同。以上属于厂商公开描述，本次未验证恢复语义、审批覆盖率或生产稳定性。

**对本方案的影响（分析判断）。** “能执行、能审批、有日志”已是竞品对照的基础项。我们应重点验证工作流作为仓库资产的版本化、同一工作流在不同 runtime 下的行为一致性，以及声明步骤与实际证据逐条对账的质量门。Axon 是否具备这些能力仍待确认，不能将官网未披露视为产品不支持。官网导航列有 Workbench 和 Axon Workflow，但本次未取得足够可读的详情，暂不推断其编辑器和编排格式。

**后续实测。** 使用同一任务和验收条件，比较桌面启动到远程节点执行、敏感操作审批、断线恢复及失败重试；再检查工作流导出/版本化、runtime 替换、产物与日志定位、质量门和回归对比。记录人工介入、恢复成功率、证据完整度与每次成功交付成本。官网案例收益数字缺少本次可核验的样本和测量口径，不作为效果结论。

## 参考资料（官方文档）

- Axon 中文官网：https://axon-ai.cn/zh-CN （本次读取原链接无可读正文，采用 [www 官网](https://www.axon-ai.cn/)及下列产品页；检索结果含历史抓取，能力需实测确认）
- Axon Node：https://www.axon-ai.cn/zh-CN/product/node
- VS Code Custom Agents: https://code.visualstudio.com/docs/agent-customization/custom-agents
- VS Code Agents window: https://code.visualstudio.com/docs/agents/run/agents-window
- Cursor Background/Cloud Agents: https://prod.cursor.com/help/ai-features/background-agents
- Cursor Run Modes: https://cursor.com/docs/agent/security/run-modes
- Windsurf/Devin Cascade Workflows: https://docs.windsurf.com/windsurf/cascade/workflows
- Kiro Specs: https://kiro.dev/docs/specs/
- Kiro Steering: https://kiro.dev/docs/steering/
- Claude Code Skills: https://code.claude.com/docs/en/skills
- OpenAI Skills: https://developers.openai.com/plugins/concepts/skills
- OpenAI Agents API: https://developers.openai.com/api/docs/guides/agents-api/overview

