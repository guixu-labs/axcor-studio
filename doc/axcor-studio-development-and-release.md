# Axcor Studio 开发与发布指南

## 从源码启动

本地服务的安装方式见[使用者 README](../README.md#准备环境)。

安装 Node.js 22.12 或更新版本以及 npm，然后在仓库根目录执行：

```bash
npm ci
npm run start
```

## 开发与验证

桌面端使用 Electron Forge、Vite 和 React。主进程入口是 [src/main.ts](../src/main.ts)，渲染层在 [src/renderer/](../src/renderer/)，通过 [src/preload.ts](../src/preload.ts) 暴露的 Electron IPC 接口调用主进程。共享接口在 [src/shared/](../src/shared/)。Controller API 由主进程访问。

本地和远程的会话导入都依赖 Workflow Controller 的 `GET /api/v1/sessions/{session_id}/transcript-source` 接口。Context Insight 需要能读取同一台主机上的会话转录文件。

远程工作区的文件助手安装在 SSH 用户的 `~/.local/share/axcor-studio/helpers/` 下。

### 验证

在仓库根目录执行以下检查。

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

HTTP 和 Electron E2E 测试使用本地 fixture，`MockExecutionClient` 用于隔离测试。真实 Controller 和 Insight 的验证需单独记录。依赖中固定了 `@electron/rebuild` 版本，避免旧版本引入托管在 GitHub 上的 `@electron/node-gyp` 源码依赖。

单独运行受影响的单元测试可用 `node --test --import tsx tests/<name>.test.ts`。验证特定界面或跨进程流程可用 `npm run test:e2e -- tests/e2e/<name>.spec.ts`。

## 本地打包

| 命令              | 产物                                        |
| ----------------- | ------------------------------------------- |
| `npm run package` | 在 `out/` 下生成对应平台的应用目录。        |
| `npm run make`    | 先打包应用，再在 `out/make/` 下生成分发包。 |

[Forge 配置](../forge.config.ts)启用了 macOS ZIP、Windows Squirrel 和 ZIP，以及 Linux DEB、RPM 和 ZIP。平台配置表示可生成的目标格式，实际分发前需要在目标系统上验证启动。

修改 Forge 或 Vite 打包配置后，依次运行 `npm run package` 和 `npm run verify:package`。

## 版本号

版本号采用 `X.Y.Z` 格式。根据本次发布的变更决定递增哪一段：

- **X（主版本）**：引入破坏性变更，已有用户需要修改命令、配置或数据才能继续使用。
- **Y（次版本）**：新增向后兼容的功能，或弃用仍可继续使用的旧接口。
- **Z（修订版本）**：修复缺陷，保持现有用法兼容。

## 发布流程

| 流水线                                              | 触发方式与产物                                                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [CI](../.github/workflows/ci.yml)                   | PR 指向 `main`，或由 CD 调用。在 macOS 26 arm64 上检查版本元数据、Prettier 格式、lint、类型、单元测试和 Electron E2E。              |
| [Tag Release](../.github/workflows/tag-release.yml) | 更新 `main` 且改动 `package.json` 时，对比本次推送前后的版本。版本变化时在推送后的提交创建 `vX.Y.Z` 标签，并显式在该标签上触发 CD。 |
| [CD](../.github/workflows/cd.yml)                   | 由 Tag Release 调用或手动运行。先复用 CI，再在 macOS 26 上构建 arm64 ZIP，检查 ASAR 内容，并解压 ZIP 验证签名和启动。               |

发布时运行 `npm version <版本> --no-git-tag-version`，将 `package.json` 和 `package-lock.json` 一起提交并合入 `main`。CI、打包、签名和启动检查通过后，CD 自动发布 GitHub Release，附上 macOS arm64 ZIP、`SHA256SUMS.txt` 和自动生成的发布说明。

CD 通过 `workflow_dispatch` 触发。在 **Actions → CD → Run workflow** 可选择分支试打包，产物保存在该次运行的 Artifacts 中。如果需要在已有版本标签上重跑发布，执行 `gh workflow run cd.yml --ref v0.1.0 -f create_release=true`，将示例标签换成目标版本。

首次导入 `main` 时跳过自动打标。若要发布导入时已有的版本，先在对应提交创建并推送版本标签，再用上述命令运行 CD。

macOS 包使用 ad-hoc 签名。面向公众分发时，按需接入 macOS Developer ID 签名和公证。
