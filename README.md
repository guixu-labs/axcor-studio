# axcor-studio

![axcor-studio：工作流一站式解决平台，贯通编写、执行、观测与评测，通过（自）进化反馈形成闭环，支持团队协作开发与统一工作环境](assets/axcor-studio-hero.png)

axcor-studio 定位为**工作流一站式解决平台**，目标是贯通工作流的编写、执行、观测、评测、（自）进化，支持团队间协作开发，为用户提供统一的工作环境。

当前以 Electron Forge + Vite + React 构建桌面工作台，接入 Workflow Controller 提供工作流执行服务，并嵌入 Insight 观测视图。下文说明当前已实现的能力与开发方式。

## 开发启动

```bash
npm install
npm run start
```

桌面应用通过 Electron IPC 访问 Workflow Controller API，支持选择工作区、使用 Monaco 编辑并保存 Markdown、查看和控制运行、轮询运行事件，以及在内嵌 Insight 视图中打开已导入的会话。

默认地址为 `http://127.0.0.1:18600`。工作台启动时会复用可访问的服务，本地服务不可用时会尝试执行 `workflow-controller web --port 18600 --no-open`。可通过「设置 → 常规」修改连接地址，或在启动工作台时通过 `EXECUTION_BACKEND_BASE_URL` 配置地址。设定 `EXECUTION_BACKEND_NO_AUTOSTART=1` 可关闭自动启动。

执行后端的显示名称和 CLI 命令集中定义在 `src/shared/executionBackendConfig.ts`。

启动页先选择「打开本地工作区」或「打开远程工作区」。进入工作台后，当前窗口使用所选工作区。要切换目录或服务器，关闭工作台并重新选择。

选择本地工作区后会并行检查 Workflow Controller 和本机 Context Insight（默认 `http://127.0.0.1:21025`），并显示各自的启动状态。两个服务都就绪后才进入工作台。启动失败时可在启动页按当前工作区和服务配置重试。

如果 Insight 未运行，工作台会通过 PATH 中的 `context-insight` 命令启动服务，并在退出时停止自己启动的实例。首次启动可能需要构建 Insight 页面。进入工作台后，打开「观测」时才加载页面。

可在启动工作台时通过 `CONTEXT_INSIGHT_PORT` 指定端口，或设置 `CONTEXT_INSIGHT_NO_AUTOSTART=1` 使用手动启动的实例。会话导入仍由 Workflow Controller 定位转录文件。如果 Workflow Controller 是单独启动的，请在启动它时将 `WORKFLOW_CONTROLLER_INSIGHT_PORT` 设为同一个端口。

`MockExecutionClient` 保留用于隔离测试。产物获取和 Evidence 面板仍为占位实现；运行完成本身不代表代码或业务验收通过。

依赖配置将 `@electron/rebuild` 固定为已发布的 4.2.0 版本，避免旧版本引入托管在 GitHub 上的 `@electron/node-gyp` 源码依赖，降低受限网络环境下的安装失败风险。

## 检查与验证

```bash
npm run lint
npm run test
npm run test:e2e
npm run package
npm run make
```

按改动范围选择检查。HTTP 和 Electron E2E 测试使用本地 fixture，真实 Workflow Controller 和 Insight 服务的验证结果需单独记录。构建或分发相关改动需要执行打包检查。

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
