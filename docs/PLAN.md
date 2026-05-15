# Baklib CLI 路线图（`docs/PLAN.md`）

> 与 Cursor 计划文件同步的**执行副本**：随迭代更新本节。勿编辑 `.cursor/plans/*.plan.md`（由工具生成）。

## 当前里程碑

- **版本**：0.1.0
- **焦点**：P0 本地主题预览（Vite + React + Liquid + Open API fixture）与常用 Open API 子命令。

## Next（最多 5 条）

1. 扩展 Liquid **SupportedSubset**（`form_tag`、`paginate_tag`、`query` 等，见 [baklib-theme-dev references](https://github.com/baklib-tools/skills/tree/main/skills/baklib-theme-dev/references)）。
2. 评估抽取 `@baklib/open-api-client` 供多工具共用（当前：**方案 2 — CLI 内实现 + 惰性配置**）。
3. Open API 若增加**主题库**文件上传（zip / Git 发布），再扩展 `baklib theme push` 或增加独立子命令承接正式上架。
4. 主题预览：设备宽度 / 多路由 / 错误 overlay 增强。
5. `kb pull` 支持批量（按目录树与 meta）。

## Done（倒序）

- 2026-05-15：`theme push`：将本地主题按依赖写入 Open API **主题预览**会话缓存（原单次 `preview-sync` 能力）；`theme pull` 不再提供 `sync` 别名。
- 2026-05-14：初版 `baklib-cli`：`dam` / `kb` / `site` / `theme` / `member` / `user` / `config`；`--json`；`kb pull|push`、`site pages pull`；`theme init` 脚手架；`theme dev`（Vite 预览 + middleware 拉 API + liquidjs）；`theme-preview/server/baklib-liquid-registry.js` 与单测；`dam-markdown-resolve` 单测。

## Decisions（ADR 摘要）

- **API 客户端**：首版在 `baklib-cli` 内自建 `BaklibClient` + `ops-*`，无模块顶层 `exit(1)`；配置见仓库 `README`（`.baklib/baklib.json`、`~/.config/baklib/baklib.json` 等）。
- **主题预览**：Node 侧 **liquidjs** + 自定义 tag/filter 注册表；**不**嵌入完整 Rails；与线上一致性以 **SupportedSubset** 明示。
- **打包**：CLI 入口 `esbuild` 打包为 `dist/index.js`；`theme-preview` 以源码随包分发，动态 `import()` 插件路径；Vite/React/Liquidjs 列为 external 由运行时 `node_modules` 解析。

## 与线上一致性（SupportedSubset）

| 能力 | 预览支持 | 说明 |
|------|----------|------|
| 标准 Liquid 语法与多数内置过滤器 | 是 | 见 [liquidjs 文档](https://liquidjs.com/) |
| `{% meta_tags %}` | 部分 | 输出 charset、viewport、title（来自 `page` / `site`） |
| `{% render 'x' %}` | 部分 | 解析 `snippets/_x.liquid` 或 `snippets/x.liquid` |
| `asset_url` / `stylesheet_tag` | 部分 | 资源 URL 前缀 `/__theme_asset/`，由预览中间件从主题目录提供文件 |
| `{% layout "theme" %}` | 是 | 由 `render-theme.js` 先剥 layout 行再套 `layout/*.liquid` |
| 其它 Baklib 自定义 tag（`form_tag`、`track_event` 等） | 否 | 待按 references 分期实现 |
| `page.content` / 富文本 | 依赖 API | 选择页面后 GET `/pages/:id` 合并详情（`body_format=markdown`） |

## 发布主题（无 Open API 写接口时）

Open API 当前仅有 `GET /themes`，**无**主题 zip / 仓库的**正式发布**上传接口。`baklib theme push` 仅将文件写入 **主题预览**会话对应的服务端缓存（与 `theme dev` 面板内「同步模版到预览」同源），**不是**模板库上架。发布流程：在 Baklib 后台 / 组织模板管理中上传 zip 或绑定仓库主题；待 API 发布后由 CLI 承接正式上架。

## 维护约定

- 合并影响路线的大功能后更新 **Done** 与 **SupportedSubset** 表。
- 架构取舍写入 **Decisions**。
