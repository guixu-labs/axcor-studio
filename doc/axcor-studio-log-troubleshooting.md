# Axcor Studio 日志排查指南

先记下报错时间、失败的服务名称、连接方式和服务端口。启动页上的错误详情可以帮助判断是启动命令找不到、服务进程退出，还是服务未在规定时间内就绪。

## 去哪里找日志

这里的「自启动」指 Axcor Studio 探测不到就绪服务后启动的实例。「已有服务」指 Axcor Studio 直接连接的实例。远程日志中的 `~` 指服务运行用户的家目录。SSH 直连时在服务器上查，Docker 工作区在容器内查。

| 环境 | 服务                | Axcor Studio 自启动                                                                                                                                             | 已有服务                                                                                                        |
| ---- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 本地 | Workflow Controller | 服务日志在 `~/.workflow-controller/workflow-controller.log`。标准输出被丢弃，标准错误的末尾用于启动失败提示。                                                   | 服务日志通常在 `<Controller 启动目录>/.workflow-controller/workflow-controller.log`。进程输出由原启动方式管理。 |
| 本地 | Context Insight     | 服务日志默认在 `~/.context-insight/logs/insight-YYYY-MM-DD.log`。通过 `npm run start` 启动桌面端时，标准输出可在同一终端查看，标准错误的末尾用于启动失败提示。  | 服务日志默认在 `~/.context-insight/logs/insight-YYYY-MM-DD.log`。进程输出由原启动方式管理。                     |
| 远程 | Workflow Controller | 先看 `~/.local/state/axcor-studio/controller-<端口>.log`，这里会追加进程的标准输出和标准错误。服务日志通常在 `~/.workflow-controller/workflow-controller.log`。 | 服务日志通常在 `<Controller 启动目录>/.workflow-controller/workflow-controller.log`。进程输出由原启动方式管理。 |
| 远程 | Context Insight     | 先看 `~/.local/state/axcor-studio/insight-<端口>.log`，这里会追加进程的标准输出和标准错误。服务日志默认在 `~/.context-insight/logs/insight-YYYY-MM-DD.log`。    | 服务日志默认在 `~/.context-insight/logs/insight-YYYY-MM-DD.log`。进程输出由原启动方式管理。                     |

远程启动日志文件名里的 `<端口>` 是服务在 SSH 主机或容器内的监听端口。复用已有服务时，旧的同端口启动日志可能仍在。服务自身的日志路径以当前实例的版本和配置为准。见[本地 Controller 启动代码](../src/executionBackend/lifecycle.ts)、[本地 Insight 启动代码](../src/observability/insightService.ts)和[远端助手](../remote/axcor-workspace-helper)。

## 按报错排查

1. **找不到启动命令或解释器**。在服务实际运行的环境里，以对应用户执行 `command -v workflow-controller` 或 `command -v context-insight`。如果命令存在，再检查它依赖的解释器是否可用。远端助手在找到启动命令后才打开日志文件，这类故障可能只有启动页的错误提示。
2. **进程退出或端口已被占用**。先查对应服务和端口的启动日志。若端口上已有进程，在服务运行环境中用 `lsof -nP -iTCP:<端口> -sTCP:LISTEN` 找到监听进程，再用 `lsof -nP -p <PID>` 核对它的工作目录、输出去向和打开的日志文件。运行在 Docker 中时，在容器内检查。
3. **远程请求超时**。先从桌面端请求实际使用的本地转发地址，记录 HTTP 状态、连接耗时和总耗时，再到服务所在的 SSH 主机或容器内直连同一接口，比较结果。健康探测可用 Controller 的 `/api/v1/runs` 和 Insight 的 `/api/observe/data?pageSize=1`，业务请求超时则用报错的同一接口。可用 `curl -sS -o /dev/null -w 'HTTP %{http_code} connect=%{time_connect}s total=%{time_total}s\n' '<实际 URL>'` 记录结果。
4. **工作流失败或界面异常**。先在运行详情查看对应运行的事件日志。事件由 Controller 提供，当前版本默认持久化在启动目录的 `.workflow-controller/events.db`。如果是启动窗口或观测页面加载失败，从源码启动时可查看 `npm run start` 的终端输出。当前桌面应用没有单独配置持久化诊断日志。
