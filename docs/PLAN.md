# Baklib CLI 路线图（`docs/PLAN.md`）

> 与 Cursor 计划文件同步的**执行副本**：随迭代更新本节。勿编辑 `.cursor/plans/*.plan.md`（由工具生成）。

## 当前里程碑

- **版本**：0.1.0
- **焦点**：P0 本地主题预览（Vite + React + Open API）与常用 Open API 子命令。

## Next（最多 5 条）

1. 主题预览：面板体验与 `preview_render` 路径覆盖（设备宽度、多路由、错误 overlay 等）。
2. 评估抽取 `@baklib/open-api-client` 供多工具共用（当前：**方案 2 — CLI 内实现 + 惰性配置**）。
3. Open API 若增加**主题库**文件上传（zip / Git 发布），再扩展 `baklib theme push` 或增加独立子命令承接正式上架。
4. `kb pull` 支持批量（按目录树与 meta）。

## Done（倒序）

- 2026-05-15：`theme push`：将本地主题按依赖写入 Open API **主题预览**会话缓存（原单次 `preview-sync` 能力）；`theme pull` 不再提供 `sync` 别名。
- 2026-05-14：初版 `baklib-cli`：`dam` / `kb` / `site` / `theme` / `member` / `user` / `config`；`--json`；`kb pull|push`、`site pages pull`；`theme init` 脚手架；`theme dev`（Vite 预览 + middleware 拉 API）；`dam-markdown-resolve` 单测。

## Decisions（ADR 摘要）

- **API 客户端**：首版在 `baklib-cli` 内自建 `BaklibClient` + `ops-*`，无模块顶层 `exit(1)`；配置见仓库 `README`（`.baklib/baklib.json`、`~/.config/baklib/baklib.json` 等）。
- **主题预览**：**不**在 Node 内嵌 Liquid 引擎；主题文件经 Open API 写入预览会话后，由 Baklib **`preview_render`** 执行 Liquid。CLI 负责依赖扫描、上传与会话保活；与线上模版行为一致以服务端为准。
- **打包**：CLI 入口 `esbuild` 打包为 `dist/index.js`；`theme-preview` 以源码随包分发，动态 `import()` 插件路径；Vite/React 列为 external 由运行时 `node_modules` 解析。

## 与线上一致性（Liquid）

Liquid 语法与 Baklib 自定义 tag/filter **以线上 `preview_render` 为准**。管理面板内开启「同步模版到预览」后，本地编辑的文件经 Open API 同步至服务端缓存，再在 iframe / 新标签中拉取服务端渲染的 HTML。

以下为历史说明（曾计划 Node 侧子集，**已不采用**）：

| 能力 | 说明 |
|------|------|
| 标准 Liquid 与 Baklib 扩展 | 以 Baklib 服务端实现为准 |
| 本地 `theme dev` 中间件 | 代理、静态资源、Open API 与预览会话；**不做**本地 Liquid 解析 |

## 发布主题（无 Open API 写接口时）

Open API 当前仅有 `GET /themes`，**无**主题 zip / 仓库的**正式发布**上传接口。`baklib theme push` 仅将文件写入 **主题预览**会话对应的服务端缓存（与 `theme dev` 面板内「同步模版到预览」同源），**不是**模板库上架。发布流程：在 Baklib 后台 / 组织模板管理中上传 zip 或绑定仓库主题；待 API 发布后由 CLI 承接正式上架。

## 维护约定

- 合并影响路线的大功能后更新 **Done** 与 **SupportedSubset** 表。
- 架构取舍写入 **Decisions**。
