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

### 列出 / 查看 / 拉取模板

- `theme list`：请求 `GET /themes?all=true`，**一次返回全部**模板（按服务端 `updated_at` **正序**：较早的在上方，**最近更新的在列表底部**），终端摘要为「共 N 条」。**默认**（不传 `--from`）为当前组织可选范围：**自有**、**他人已发布共享**与**官方公开**模板；`--from org` 仅自有，`--from public` 仅官方公开目录。
- `theme show <id|scope/name>`：`GET /themes/:id`（`id` 可为 hashid、数字 id，或路径形式 `cms/guide`，斜杠需编码），展示 Git 仓库、分支/标签列表与数量、在用站点数等；人类可读首行与 `theme list` 行格式一致。**若 `scope/name` 同时命中多个可选模板**（例如组织自有与官方公开同名），接口返回 `themes` 数组，CLI 会逐条打印；后续 `pull` / manifest 须改用具体 **id**。
- `theme pull <id|scope/name>`：清单逐文件下载（位置参数同 `show`）。**未指定版本时服务端默认 `main`**；无 `main` 时回退 `latest_version`。可用 `--version-name` / `--branch`、`tag:v1.0`、`--commit-oid`、`--version-id`。

```bash
baklib theme list
baklib theme list --from org
baklib theme list --from public
baklib theme show 3
baklib theme show cms/guide
baklib theme pull <THEME_HASHID>
baklib theme pull cms/guide --branch develop --yes --out ./my-theme
baklib theme pull cms/guide --version-name tag:v1.0 --out ./rel
```

脚本或非交互拉取须加 `--yes`。交互环境下会先确认写入文件数与目标目录。

可与官方示例仓库（如 [baklib-templates/blog](https://github.com/baklib-templates/blog)）对照：`git clone` 后 `checkout` 目标分支，再执行 `pull` 将对应版本同步到工作区。

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
