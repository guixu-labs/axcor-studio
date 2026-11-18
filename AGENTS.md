# Axcor Studio

Electron、TypeScript 和 React 桌面工作台。环境依赖和启动方式见 [README.md](README.md)。

- 主进程入口是 `src/main.ts`，渲染层在 `src/renderer/`。渲染层通过 `src/preload.ts` 暴露的 IPC 接口访问主进程，共享接口在 `src/shared/`。
- 在仓库根目录先跑受影响的测试。单个测试文件用 `node --test --import tsx tests/<name>.test.ts`。改动涉及界面或跨进程行为时，用 `npm run test:e2e -- tests/e2e/<name>.spec.ts` 跑相关用例。完整 E2E 入口为 `npm run test:e2e`。交付前运行 `npm run lint`、`npm run typecheck` 和 `npm test`。
- CI 运行 `npm run format:check` 检查 Prettier 格式。可用 `npm run format` 修复格式。ESLint 限制每行最多 120 个字符，含 URL 的行按配置豁免。编辑 `src/renderer/i18n.ts` 时，每个翻译条目单独一行。
- 新增界面入口时，从用户首次打开的默认界面走一遍，检查入口是否容易发现、下一步是否明确，以及常用窗口尺寸下能否完成操作。同一行的控件要检查对齐和加载状态下的布局。修改表单错误反馈时，用较长的实际错误格式验证表单宽度和操作位置，确保能查看完整错误。
- 有独立职责的远程 Python 或 Shell 脚本放在 `remote/`，复用现有脚本打包方式。TypeScript 负责传参、启动进程和管理生命周期。
- 修改服务启动、重试或 SSH 重连时，同时核对正常启动、失败恢复和退出清理。优先复用现有测试夹具。报告跨进程测试结果时，注明覆盖了哪些测试夹具、真实 SSH 或 Docker 环境，以及实际服务联调。真实容器中运行模拟服务可以验证传输链路，实际服务需要单独验收。
- 排查远程请求超时时，先探测桌面端使用的转发地址，再在宿主机或容器内直连同一业务接口并记录耗时。需要看服务日志时，以当前监听进程实际打开的日志为准。根据业务接口的实测耗时设置该操作的超时，并在提示中区分等待响应超时和连接失败。
- 改动 SSH 认证时，验证正确凭据、错误凭据、未知主机密钥和重连。SSH 密码只保留在当前应用会话内，连接参数、日志和最近连接记录都不得包含密码。
- 修改 Forge 或 Vite 打包配置时，依次运行 `npm run package` 和 `npm run verify:package`。发版流程和平台范围见[开发与发布指南](doc/axcor-studio-development-and-release.md)。
- 改动启动方式、配置或用户可见行为时，在同一次变更中更新 `README.md` 对应章节。
