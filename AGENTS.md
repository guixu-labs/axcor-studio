# Axcor Studio

Electron、TypeScript 和 React 桌面工作台。环境依赖和启动方式见 [README.md](README.md)。

- 主进程入口是 `src/main.ts`，渲染层在 `src/renderer/`。渲染层通过 `src/preload.ts` 暴露的 IPC 接口访问主进程，共享接口在 `src/shared/`。
- 在仓库根目录先跑受影响的测试。单个测试文件用 `node --test --import tsx tests/<name>.test.ts`。改动涉及界面或跨进程行为时，用 `npm run test:e2e -- tests/e2e/<name>.spec.ts` 跑相关用例。完整 E2E 入口为 `npm run test:e2e`。交付前运行 `npm run lint`、`npm run typecheck` 和 `npm test`。
- CI 运行 `npm run format:check` 检查 Prettier 格式。可用 `npm run format` 修复格式。ESLint 限制每行最多 120 个字符，含 URL 的行按配置豁免。编辑 `src/renderer/i18n.ts` 时，每个翻译条目单独一行。
- 修改服务启动、重试或 SSH 重连时，同时核对正常启动、失败恢复和退出清理。优先复用现有测试夹具，报告结果时注明使用的是测试夹具还是真实服务。
- 修改 Forge 或 Vite 打包配置时，依次运行 `npm run package` 和 `npm run verify:package`。发版流程和平台范围见[开发与发布指南](doc/axcor-studio-development-and-release.md)。
- 改动启动方式、配置或用户可见行为时，在同一次变更中更新 `README.md` 对应章节。
