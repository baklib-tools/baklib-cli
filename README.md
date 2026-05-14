# baklib-cli

面向 [Baklib](https://www.baklib.com) Open API 的独立命令行工具：覆盖常用 Open API 能力，并支持**本地主题预览**（API 拉取站点数据 + Vite/React 壳 + Liquid 渲染），便于在无本地 Rails 环境下开发 `themes/` 下模板。

## 安装

```bash
cd baklib-cli
npm install
npm run build
npm link   # 或 npx / 全局安装发布后使用 baklib
```

需要 **Node ≥ 20**。

## 配置

惰性读取；执行需要鉴权的子命令时才要求 Token，`baklib --help` 不强制。

**优先级（合并后，环境变量始终最后覆盖）**

1. **`~/.config/baklib/baklib.json`**：用户级 JSON（字段 `token`、`apiHost`；`apiHost` 为主机根）
2. **自当前工作目录向上递归**：首个 **`.baklib/baklib.json`** 与同名字段会覆盖用户级配置
3. 兼容：工作区 **`.config/`**、**`~/.config/`** 平铺凭据（如 `BAKLIB_MCP_TOKEN` 等）
4. 环境变量 **`BAKLIB_TOKEN`**、**`BAKLIB_API_BASE`**（主机根，如 `https://open.baklib.com`；未设置主机时默认官方 **`https://open.baklib.com`**；CLI 固定追加 **`/api/v1`**）

`baklib config set-token` / `set-api-base` 默认写入**项目** `.baklib/baklib.json`（若目录树中已有该文件则更新之，否则写在**当前工作目录**下 `.baklib/baklib.json`）；加 **`-g`** 则只更新 `~/.config/baklib/baklib.json`。

`baklib config reset` 会从对应 `baklib.json` 中删除 `token`、`apiHost` 等字段；若无其它键则删除该文件。**`-g`** 表示只处理用户级配置文件。

```bash
baklib config set-token "<your-token>"
baklib config set-token "<your-token>" -g
baklib config set-api-base "https://open.baklib.com"
baklib config set-api-base "https://open.baklib.com" -g
baklib config reset
baklib config reset -g
baklib config show
```

`baklib.json` 示例：

```json
{
  "token": "<your-token>",
  "apiHost": "https://open.baklib.com"
}
```

全局选项：`--json`（机器可读 JSON；**默认**为面向终端的简要文本）、`-B / --api-base <url>`。

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
