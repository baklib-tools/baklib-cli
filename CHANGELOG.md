# 更新日志

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.4.1] - 2026-05-16

### 新增

- CLI 启动时按自然日最多向 npm registry 检查一次 `@baklib/baklib-cli` 新版本；若有更新则在 stderr 提示升级命令（状态缓存在 `~/.cache/baklib-cli/version-check-state.json`）。可用环境变量 **`BAKLIB_SKIP_VERSION_CHECK=1`** 关闭；仅执行 `baklib --version` / `-V` 时不检查。

## [0.4.0] - 2026-05-16

### 新增

- `baklib theme dev --recopy-preview`：无视指纹强制删除并重建用户缓存下的预览工作台（重新复制 `theme-preview`、`src/lib`、`src/api` 并执行 npm install）。

### 变更

- `theme dev`：将预览工作台 materialize 到用户缓存目录（默认 `~/.cache/baklib-cli/<版本>/`；支持 `XDG_CACHE_HOME`），避免从全局 `node_modules` 内直接启动 Vite 带来的解析问题。
- 工作台在 **`theme-preview/` 与缓存根各执行一次** `npm install`：根目录安装 `form-data` 等，供动态加载的 `src/api/*` 正确解析。
- `baklib config show`：人类可读与 `--json` 输出均不再包含「请求基址」「默认主机」字段。

### 修复

- 预览中间件 `/api/baklib/*` 异常时改为返回 **JSON**（`{ "error": "…" }`），避免管理面板将纯文本误判为 JSON 而报错。
- 移除未接入面板的 Node 侧 `liquidjs` 本地渲染路径及相关文件，减轻依赖与缓存安装负担；主题 Liquid 仍以服务端 `preview_render` 为准。

## [0.2.0] - 2026-05-15

### 新增

- 主题本地开发：`baklib theme dev` 内置 Vite 管理面板（`/!admin`）、预览会话与路径 HTML（`preview_render`）、同源 `__baklib_proxy` / `__theme_asset` 等中间件能力。
- 开发面板：远端页面树、**静态页面**（`statics/**/*.liquid` → `/s/…`）、**本地页面**分区；与 Open API 对齐的站点 `site_id` 解析。
- `docs/theme-preview.md`：主题预览上传、故障排查与 API 约定说明。

### 变更

- `baklib theme dev` 精简命令行参数，仅保留 `--theme-dir`、`--port`；默认同步入口为 `templates/index.liquid`，语言从 `LANG` / `LC_ALL` 推导，站点与门户回源在面板或环境变量中配置。

### 修复

- 与主题预览、路径预览相关的边界行为与文档对齐（以 `docs/theme-preview.md` 为准）。

## [0.1.0] - 2026-05-14

### 新增

- 初版 CLI：`config`、`site`、`kb`、`dam`、`theme`（含 `theme list/show/pull/init`）、`member`、`user` 等；Open API 鉴权与 `--json` 输出。
