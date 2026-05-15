# 更新日志

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.2.0] - 2026-05-15

### 新增

- 主题本地开发：`baklib theme dev` 内置 Vite 管理面板（`/!/theme-admin-panel`）、预览会话与路径 HTML（`preview_render`）、同源 `__baklib_proxy` / `__theme_asset` 等中间件能力。
- 开发面板：远端页面树、**静态页面**（`statics/**/*.liquid` → `/s/…`）、**本地页面**分区；与 Open API 对齐的站点 `site_id` 解析。
- `docs/theme-preview.md`：主题预览上传、故障排查与 API 约定说明。

### 变更

- `baklib theme dev` 精简命令行参数，仅保留 `--theme-dir`、`--port`；默认同步入口为 `templates/index.liquid`，语言从 `LANG` / `LC_ALL` 推导，站点与门户回源在面板或环境变量中配置。

### 修复

- 与主题预览、路径预览相关的边界行为与文档对齐（以 `docs/theme-preview.md` 为准）。

## [0.1.0] - 2026-05-14

### 新增

- 初版 CLI：`config`、`site`、`kb`、`dam`、`theme`（含 `theme list/show/pull/init`）、`member`、`user` 等；Open API 鉴权与 `--json` 输出。
