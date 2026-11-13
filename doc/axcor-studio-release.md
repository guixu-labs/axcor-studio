# Axcor Studio 版本发布

## 版本号

版本号采用 `X.Y.Z` 格式。根据本次发布的变更决定递增哪一段：

- **X（主版本）**：引入破坏性变更，已有用户需要修改命令、配置或数据才能继续使用。
- **Y（次版本）**：新增向后兼容的功能，或弃用仍可继续使用的旧接口。
- **Z（修订版本）**：修复缺陷，保持现有用法兼容。

## 发布流程

| 流水线 | 触发方式与产物 |
| --- | --- |
| [CI](../.github/workflows/ci.yml) | PR 指向 `main`，或由 CD 调用。在 macOS 26 arm64 上检查版本元数据、lint、类型、单元测试和 Electron E2E。 |
| [Tag Release](../.github/workflows/tag-release.yml) | 更新 `main` 且改动 `package.json` 时，对比本次推送前后的版本。版本变化时在推送后的提交创建 `vX.Y.Z` 标签，并显式在该标签上触发 CD。 |
| [CD](../.github/workflows/cd.yml) | 由 Tag Release 调用或手动运行。先复用 CI，再在 macOS 26 上构建 arm64 ZIP，检查 ASAR 内容，并解压 ZIP 验证签名和启动。 |

发布时运行 `npm version <版本> --no-git-tag-version`，将 `package.json` 和 `package-lock.json` 一起提交并合入 `main`。CI、打包、签名和启动检查通过后，CD 自动发布 GitHub Release，附上 macOS arm64 ZIP、`SHA256SUMS.txt` 和自动生成的发布说明。

CD 仅由显式调用启动，GitCode 镜像同步 tag 时不会重复构建。在 **Actions → CD → Run workflow** 可选择分支试打包，产物保存在该次运行的 Artifacts 中。如果需要在已有版本标签上重跑发布，执行 `gh workflow run cd.yml --ref v0.1.0 -f create_release=true`，将示例标签换成目标版本。

首次导入 `main` 时跳过自动打标。若要发布导入时已有的版本，先在对应提交创建并推送版本标签，再用上述命令运行 CD。

macOS 包使用 ad-hoc 签名。面向公众分发时，按需接入 macOS Developer ID 签名和公证。
