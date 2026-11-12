# Axcor Studio

![Axcor Studio 工作流桌面工作台](assets/axcor-studio-hero.png)

Axcor Studio 是面向工作流开发者的桌面工作台，贯通了工作流的编写、执行、观测、评测、（自）进化，支持团队间协作开发，为用户提供统一的工作环境。


## 当前功能

- **编写**：打开本地或 SSH 远程工作区，从文件树浏览文件，在标签页中编辑和保存 Markdown、YAML 等文本文件。编辑器支持左右或上下分屏，关闭含有未保存改动的文件时会提示确认。
- **执行**：运行 Graph YAML 工作流，或直接输入提示词启动单次 Agent 会话。运行 Graph 时可指定文件、运行名称、工作流变量和最大并行数。启动会话时可选择 Agent 运行时和模型。运行期间可按任务类型和状态停止运行、暂停或继续会话，也可向会话发送回复。
- **观测**：在运行列表中选择一条记录，查看状态、耗时和事件日志。展开工具调用可查看输入和返回结果，结合错误信息定位运行中的问题。对于已导入的会话，可从运行详情打开会话轨迹，回看消息和工具调用的顺序。

评测和工作流（自）进化属于后续规划。见[方案设计](doc/axcor-studio-design.md)。

## 快速开始

### 准备环境

- **Workflow Controller** 目前通过源码安装，步骤见 [Workflow Controller 仓库 README](https://gitcode.com/qwren/opsbot/blob/main/README.md)。
- **Context Insight** 通过 npm 安装，运行 `npm install -g context-insight`。详见 [Context Insight npm 包](https://www.npmjs.com/package/context-insight)。

### 从安装包启动

安装包通过 GitHub 构建并发布，在项目的 **GitHub Releases** 页面下载与系统和 CPU 架构匹配的安装包。

- **macOS**：解压 ZIP，打开 `axcor-studio.app`。
- **Windows**：运行 Squirrel 安装程序，或解压 ZIP 后运行其中的应用。
- **Linux**：使用系统包管理器安装 DEB 或 RPM，或解压 ZIP 后运行其中的应用。

### 从源码启动

安装 Node.js 22.12 或更新版本以及 npm，然后在仓库根目录执行：

```bash
npm ci
npm run start
```

启动页可打开本地或远程工作区。当前窗口固定使用所选工作区，切换时关闭窗口并重新选择。

选择本地工作区后，工作台会探测本机的 Workflow Controller（`127.0.0.1:18600`）和 Context Insight（`127.0.0.1:21025`）。已有服务就绪时直接复用，否则自动启动对应服务。启动失败时，按服务行的错误信息处理，再点击该服务旁的「重试」。

### 跑通第一次运行

1. 在启动页点击「打开本地工作区」，选择一个本地目录。在「设置 → 模型供应商」配置一个可用模型。
2. 打开「运行 → 运行配置」，选择「Workflow Controller Session」，选定 Agent 运行时和模型。输入提示词「只回复 OK」，点击「运行工作流」。
3. 在运行列表里打开刚创建的记录，查看状态和事件日志。有可观测会话时，点击「在 Insight 中查看」。

如果已有 Workflow Controller 能执行的 Graph YAML 文件，可在工作区打开并保存该文件，选择 `Graph` 运行时。留空「运行文件」会使用当前打开的文件，也可以手动填写路径。按工作流需要填写变量后，点击「运行工作流」。

## 远程工作区

桌面端通过系统 OpenSSH 连接无桌面的 Linux 服务器。文件助手走 SSH 标准输入输出，Workflow Controller API 走 SSH 本地端口转发。运行由服务器上的 Controller 管理，关闭桌面端后可重新连接查看运行和日志。

1. 在服务器上使用普通用户部署 Python 3.8+、`workflow-controller`、`context-insight` 和运行所需的 CLI、模型配置。若已有手动管理的服务，请让服务监听回环地址，并将 Controller 的 `WORKFLOW_CONTROLLER_INSIGHT_PORT` 配置为实际 Insight 端口。共享服务器上，为各用户分配独立的端口。
2. 从本机安装文件助手。把示例中的 `dev-server` 换成 SSH 配置中的主机别名。首次先在终端核验服务器主机密钥并确认可使用密钥或本机 SSH agent 登录。助手必须在服务器非交互 SSH 命令的 PATH 中。

   ```bash
   ssh dev-server 'mkdir -p ~/.local/bin'
   scp remote/axcor-workspace-helper dev-server:.local/bin/axcor-workspace-helper
   ssh dev-server 'chmod 755 ~/.local/bin/axcor-workspace-helper && command -v axcor-workspace-helper'
   ```

3. 在 Axcor Studio 启动页选择「打开远程工作区」，从本机 `~/.ssh/config` 选择主机，或手动输入 `user@hostname` 和可选的 SSH 端口。手动输入的主机可选择「保存到 SSH 配置」，指定别名后再连接。表单另外填写服务器上的绝对目录以及 Controller 和 Insight 的远端端口。用文件树打开并保存 UTF-8 文件（每个文件最多 2 MiB）。Graph 的「运行文件」填工作区内的相对路径，也可留空运行当前文件。Session 使用同一远端工作区作为项目目录。

SSH 服务端需要允许本地端口转发。桌面端沿用本机 `known_hosts`，通过 SSH 配置使用跳板机等连接设置。桌面端采用非交互公钥认证。若私钥有口令，可先用 `ssh-add` 将它加载到本机 SSH agent。

断线后点击「重新连接」。未保存草稿保留在当前窗口。若服务器上的文件已变更，保存会提示冲突，可以先复制草稿，再用「从服务器重新读取」查看最新内容。运行提交结果不确定时，先刷新并检查运行列表。启动远程工作区时，桌面端通过 SSH 转发检查远端 Controller 和 Insight。文件助手会复用健康服务，或以 SSH 用户身份在服务器后台启动缺失的服务。启动日志位于 `~/.local/state/axcor-studio/controller-<端口>.log` 和 `~/.local/state/axcor-studio/insight-<端口>.log`。关闭桌面端会关闭转发，服务器上的服务可供下次连接复用。升级已有远程工作区时，重新复制最新的 `axcor-workspace-helper` 即可获得自动启动能力。

## 开发与验证

桌面端使用 Electron Forge、Vite 和 React，渲染进程通过 Electron IPC 调用主进程，由主进程访问 Controller API。

```bash
npm run lint
npm test
npm run test:e2e
```

HTTP 和 Electron E2E 测试使用本地 fixture，`MockExecutionClient` 用于隔离测试。真实 Controller 和 Insight 的验证需单独记录。依赖中固定了 `@electron/rebuild` 版本，避免旧版本引入托管在 GitHub 上的 `@electron/node-gyp` 源码依赖。

### 开发者本地打包

| 命令 | 产物 |
| --- | --- |
| `npm run package` | 在 `out/` 下生成对应平台的应用目录。 |
| `npm run make` | 先打包应用，再在 `out/make/` 下生成分发包。 |

[Forge 配置](forge.config.ts)启用了 macOS ZIP、Windows Squirrel 和 ZIP，以及 Linux DEB、RPM 和 ZIP。平台配置表示可生成的目标格式，实际分发前需要在目标系统上验证启动。

**macOS arm64 本地打包已知问题**：已检查的产物缺少渲染界面文件，且 macOS 签名校验失败。开发体验请使用 `npm run start`。

## 技术栈

| 用途 | 技术 |
| --- | --- |
| 桌面应用 | Electron、Node.js、TypeScript |
| 用户界面 | React、CSS |
| 文件编辑 | Monaco Editor |
| 服务集成 | Electron IPC、HTTP API、WebContentsView |
| 构建与分发 | Vite、Electron Forge、npm |
| 测试与代码检查 | Node.js 测试运行器、tsx、Playwright、ESLint |
