# baklib-cli

面向 [Baklib](https://www.baklib.com) Open API 的命令行工具：对齐 [baklib-mcp-server](https://github.com/baklib/baklib-mcp-server) 已实现的接口，并支持**本地主题预览**（API 拉取站点数据 + Vite/React 壳 + Liquid 渲染），便于在无本地 Rails 环境下开发 `themes/` 下模板。

## 安装

```bash
cd baklib-cli
npm install
npm run build
npm link   # 或 npx / 全局安装发布后使用 baklib
```

需要 **Node ≥ 20**。

## 配置

与 MCP 一致（惰性读取，执行子命令时才要求 Token，`baklib --help` 不强制）：

- 环境变量：`BAKLIB_MCP_TOKEN`（或 `BAKLIB_TOKEN`）、`BAKLIB_MCP_API_BASE`（或 `BAKLIB_API_BASE`）
- 文件：`~/.config/BAKLIB_MCP_TOKEN`、`~/.config/BAKLIB_MCP_API_BASE`
- 工作区：`$BAKLIB_MCP_WORKSPACE/.config/` 下同名文件优先于用户目录

```bash
baklib config set-token "<your-token>"
baklib config show
```

全局选项：`--json`、`-B / --api-base <url>`。

## 主题开发（优先）

```bash
# 脚手架（themes/<scope>/<name>/）
baklib theme init cms my_theme

# 本地预览（需 Token；--site-id 用于拉取 fixture）
baklib theme dev --site-id <SITE_ID> --theme-dir ./themes/cms/my_theme
```

浏览器打开终端输出的本地 URL；在 UI 中选择模板与页面，iframe 内为 Liquid 渲染结果。实现边界与自定义 Liquid 覆盖范围见 [docs/PLAN.md](docs/PLAN.md)。

## 数据与资源（节选）

```bash
baklib --json site list
baklib kb articles --space-id <SPACE_ID>
baklib kb pull --space-id <SID> --article-id <AID> --out ./article.md
baklib kb push --file ./article.md
baklib site pages pull --site-id <SID> --page-id <PID> --out ./page.json
baklib dam upload --file-path ./logo.png
```

站点页面创建/更新可使用 `--vars-file` 传入 `template_variables` 的 JSON 文件。

## 开发与测试

```bash
npm test
npm run build
```

路线图与 SupportedSubset 维护：[docs/PLAN.md](docs/PLAN.md)。
