# @baklib/baklib-cli

面向 [Baklib](https://www.baklib.com) Open API 的独立命令行工具：覆盖常用 Open API 能力，并支持**本地主题预览**（Open API 拉取站点数据 + Vite/React 管理面板；页面 HTML 由服务端 `preview_render` 渲染 Liquid），便于在无本地 Rails 环境下开发 Baklib 站点模板。

## 安装

自 npm 安装（发布后）：

```bash
npm install -g @baklib/baklib-cli
```

从源码开发：

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

## 主题与本地模版开发

面向主题目录下的 Liquid 模版（`baklib theme init` 会在当前目录生成 `./<scope>--<name>/`）：在**本机**跑开发服，通过 Open API 把允许路径内的文件写入服务端 **主题预览**缓存，由 **Baklib** 执行 `preview_render` 得到与线上一致的 HTML（无需本地 Rails）。实现边界与路线图另见 [docs/PLAN.md](docs/PLAN.md)；预览协议、代理与 `422` 排查见 **[docs/theme-preview.md](docs/theme-preview.md)**。

### 1. 准备

- 已 [安装](#安装) 并 `npm link`（或全局安装发布包），本机 **Node ≥ 20**。
- 已 [配置](#配置) `baklib config set-token` / `set-api-base`（或 `BAKLIB_TOKEN`、`BAKLIB_API_BASE`）。**无 Token 时 `theme dev` 无法调 Open API。**

### 2. 脚手架（可选）

```bash
# 生成 <scope>--<name>/ 最小骨架（如 cms--vcard/）；技能请另执行 baklib skill install
baklib theme init cms vcard
```

### 3. 本地开发服务器 `theme dev`

```bash
cd /path/to/your-theme
baklib theme dev
# 可选：baklib theme dev --port 5175
```

1. 终端会打印 **管理面板**地址（形如 `http://127.0.0.1:5174/!admin`），用浏览器打开。  
2. 左侧 **刷新站点列表** 并 **选择站点**；指纹资源回源可用站点 `portal_url`，或本机设置 **`BAKLIB_PORTAL_ORIGIN`**。  
3. 右侧底部打开 **「同步模版到预览」**：创建预览会话、按入口 `templates/index.liquid` 解析依赖并上传主题，之后可 **监听文件变更** 防抖同步。  
4. 中间区域为 **远端页面**、**静态页面**（`statics/` → `/s/…`）、**本地页面**；开启同步后 **点击标题** 可在新标签中打开当前路径的 **服务端 HTML 预览**（非 iframe 嵌入）。

默认语言包与 `theme push` 一致，从 **`LANG` / `LC_ALL`** 推导；可在面板内切换语言。`theme dev --help` 列出 `--theme-dir`、`--port`、`--recopy-preview`。

首次运行或升级 CLI 后，`theme dev` 会把预览前端与解析用源码同步到用户缓存下的工作台（默认 `~/.cache/baklib-cli/<包版本>/`；若设置了 **`XDG_CACHE_HOME`** 则使用 `$XDG_CACHE_HOME/baklib-cli/<包版本>/`），并在该目录根与 `theme-preview/` 各执行一次 `npm install`（根目录用于 `src/api` 的 `form-data` 等依赖解析），可能需要数十秒。若需无视指纹强制从安装包重拷工作台，可加 **`--recopy-preview`**。

### 4. 单次上传（不经面板）

```bash
baklib theme push --theme-dir ./cms--my_theme --entry templates/index.liquid --locale zh-CN
```

用于脚本或 CI 单次写入预览缓存；可选 `--site-id` + `--page-id` 校验 `preview_render` 返回的 HTML 长度等（见 `baklib theme push --help`）。

### 5. 发布本 CLI 到 npm（维护者）

```bash
npm test && npm run build
# 更新 package.json 版本号与 CHANGELOG.md 后
npm pack --dry-run   # 确认清单中无 theme-preview/node_modules（否则 registry 可能 415）
npm publish --access public
```

`prepublishOnly` 已配置为自动 `npm run build`。`theme-preview/.npmignore` 会排除本地 `node_modules` / `dist`，避免发布包内含 npm 硬链接目录。发布包会附带 `src/lib/theme-preview-*.js`（供全局安装后 `theme dev` 解析 Vite 插件与面板对常量、Liquid 依赖的引用）。

### 列出 / 查看 / 拉取模板

- `theme list`：请求 `GET /themes?all=true`，**一次返回全部**模板（按服务端 `updated_at` **正序**：较早的在上方，**最近更新的在列表底部**），终端摘要为「共 N 条」。**默认**（不传 `--from`）为当前组织可选范围：**自有**、**他人已发布共享**与**官方公开**模板；`--from org` 仅自有，`--from public` 仅官方公开目录。
- `theme show <id|scope/name>`：`GET /themes/:ref`（`ref` 为主题 **id**（与 `theme list` 返回一致，即服务端 hashid），或 **`scope/name`**（如 `cms/guide`，斜杠需 URL 编码），展示 Git 仓库、分支/标签列表与数量、在用站点数等；人类可读首行与 `theme list` 行格式一致。**若 `scope/name` 同时命中多个可选模板**（例如组织自有与官方公开同名），接口返回 `themes` 数组，CLI 会逐条打印；后续 `pull` / manifest 须改用具体 **id**。
- `theme pull <id|scope/name>`：清单逐文件下载（位置参数同 `show`）。**未指定版本时服务端默认 `main`**；无 `main` 时回退 `latest_version`。可用 `--version-name` / `--branch`、`tag:v1.0`、`--commit-oid`、`--version-id`。
- **`--dir <path>`**：把「主题 Git 仓库根」与**默认写入目录**设为该路径（仍在该目录读 `git rev-parse`）；若同时需要写到别处，用 **`--out`** 覆盖输出目录（Git 仍在 `--dir`）。
- **`--json`**：`theme pull` 在拉取过程中会向 **stderr** 打印 NDJSON 行：`type: baklib_theme_pull_manifest`（拿到清单后）与 `type: baklib_theme_pull_progress`（每文件完成一条）；**stdout** 仍为收尾一条汇总 JSON（含 `file_results`、`warnings` 等）。

```bash
baklib theme list
baklib theme list --from org
baklib theme list --from public
baklib theme show <id>
baklib theme show cms/guide
baklib theme pull <id>
baklib theme pull cms/guide --branch develop --yes --out ./my-theme
baklib theme pull cms/guide --version-name tag:v1.0 --out ./rel
# 在克隆的模板仓库内与平台某分支对齐（先 git checkout 目标分支）
git clone https://github.com/baklib-templates/blog.git && cd blog
baklib theme pull cms/blog --dir . --use-git-branch --yes
```

说明：**非 TTY** 下人类模式会逐文件向 stderr 输出 `[theme pull] i/n path`；**TTY** 下为单行进度条。若本地 `HEAD` 与清单 `commit_oid` 不一致，人类模式 stderr 会提示，**`--json`** 时写入结果里的 `warnings`。

脚本或非交互拉取须加 `--yes`。交互环境下会先确认写入文件数与目标目录。

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
