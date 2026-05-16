# 主题预览上传（Theme Preview Push）

通过 Baklib Open API 将本地主题目录中的**允许路径内的文本文件**写入服务端 **Rails.cache（生产多为 Solid Cache）**，供站点「服务端 Liquid 预览」读取。适用于 `baklib theme push`（单次）与 `baklib theme dev`（在管理面板中开启「同步模版到预览」后创建会话并上传主题）。

## 分步交付说明

1. **控制面板**：`baklib theme dev` 提供 **`/!admin`** 及配套 API（站点/页面只读列表、开发态存储）。  
2. **预览会话与路径 HTML 预览**：在面板**右侧底部**打开「**同步模版到预览**」后，开发服务器会**创建预览会话**、上传主题并开始监听目录变更；并注入 **`BAKLIB_PREVIEW_SESSION_ID`** 以启用 **`preview_render`** 路径预览。关闭开关会**删除会话**并停止监听。若单独运行 Vite（不经 CLI），则无会话：根路径 `/` **302** 到管理面板，站点路径也不会由中间件渲染。

## 路径预览 API（`preview_render`）

Baklib Open API（需与实现该接口的 **Baklib 应用**版本一致）：

- `POST /api/v1/theme_preview/sessions/:id/preview_render`  
  JSON body：
  - **`site_id`**：与 Open API `GET /sites/:id` 路径参数一致，可为 **JSON:API `data.id`（数字主键字符串）** 或 **Hashid**（若客户端仍从其它字段取得）。
  - **`path`**：当前浏览器请求路径（如 `/foo`），服务端按站点 **`pages.full_path`** 查库并渲染；库中无该路径则渲染主题 **`404`**，HTTP **404**，响应体仍为 `{ "html": "..." }`。
  - **`local_page`**（可选）：仅用于**未入库的本地虚拟页**，或面板对远端页的**确有差异的覆盖**（模版名、与列表 API 不一致的 `template_variables`、非空 `content`）。若把列表同步下来的 `template_variables` 原样再发并带空 `content`，服务端可能按「仅本地页」渲染，**会丢失库里的正文、图片、发布时间等**；`baklib-cli` 已避免在未编辑时向远端路径附带 `local_page`。**已编辑的远端页**：开发服务器在调用 `preview_render` 前会再请求 **GET 单页**（`body_format=markdown`），将正文、访问量、发布时间等与面板覆盖合并进 `local_page`，以减轻服务端仅按局部 variables 构页时的字段缺失；`template_variables` 在面板侧也会与列表行做**深度合并**后再与单页详情合并。
  - **`body_format`**（可选）：`markdown` 与 Open API 单页一致，合并进 `local_page` 的富文本（richtext）**字符串**会按 BKE Markdown 解析后再进 Liquid；`html` 则按已入库 Fragment HTML 解析。带 `local_page` 且命中库页时 **CLI 默认传 `markdown`**；服务端在未传时对该场景也默认 `markdown`，若你的 `template_variables` 已是 HTML 片段可显式传 `html`。

`baklib-cli` 在 **`theme dev` 且已开启「同步模版到预览」** 时：GET 非管理面板路径会带当前 **`path`** 调用上述接口；若该路径在面板里对应**本地页**，则额外带上合并后的 **`local_page`**（含 **`path`**，供服务端识别虚拟路径）。远端页仅靠服务端 `full_path` 解析，**不再上传整站 `pages[]` 路由表**（以前用于在「仅罗列部分 URL」时强制 404；现已改为以数据库为准）。

返回的 HTML 会经本地中间件改写：

- 主题内 **`/assets/`** 等静态路径 → 同源 **`/__theme_asset/`**（映射到本地主题目录）；
- **预览页热刷新**：`preview_render` 返回的 HTML 会注入 `__baklib_live_reload` 客户端；目录监控或面板触发**增量同步**成功后，通过 SSE 通知已打开的预览标签页，在可配置延迟（默认 **1 秒**，`baklib theme dev --reload-delay <秒>` 或 `BAKLIB_PREVIEW_RELOAD_DELAY_MS`）后使用 **morphdom** 拉取当前 URL 的 HTML 并 morph `body`（尽量保留滚动条与输入焦点）；morphdom 不可用时回退为 `location.reload()`。
- 门户 **`/-/theme-assets/{token}--{sig}/…`**（token 内 JSON 的 `path` 相对 `assets/`）→ 开发服优先读本地 **`assets/{path}`**，缺失时再向门户回源；  
- 外链 **`https://…`**（含协议相对 **`//…`**）→ 若路径为 **`/assets/…`** 则同样走 **`/__theme_asset/`**；否则走同源 **`/__baklib_proxy?url=<编码后的 https URL>`**，由开发服务器代拉取，减轻浏览器跨域与防盗链问题。代理仅允许 **GET**、**https**、无凭据 URL，并对目标主机做 **DNS 解析校验（禁止解析到私网/本地地址）**，超时与响应体大小有上限（见 `theme-preview/server/upstream-proxy.js`）。

## 前置条件

1. **Open API 凭据**（与 `theme pull` 等相同）  
   - `baklib config set-token "<key:secret>"`  
   - `baklib config set-api-base "https://<你的 Open 域名>"`（主机根，CLI 会自动拼 `/api/v1`）  
   - 或环境变量：`BAKLIB_TOKEN`、`BAKLIB_API_BASE`

2. **服务端**已部署主题预览 API（`POST /api/v1/theme_preview/sessions` 等），且 **`Rails.cache` 在多进程/多机之间可共享**（见下文「故障排查」）。

3. 本地主题目录结构需符合 Baklib 主题约定（`templates/`、`layout/`、`snippets/`、`locales/`、`config/settings_schema.json` 等）；CLI 会按 Liquid 依赖与当前语言组包，**单次最多 20 个文件**，单文件 **≤ 2MB**，会话 **15 分钟** TTL（与服务器一致）。

## 命令说明

### 单次：`theme push`

在本地解析入口模板的 `layout` / `render` / `include` / `section` 依赖，合并当前语言的 `locales/<locale>.json`（及可选 `.schema.json`）、`config/settings_schema.json`（若存在），然后：

1. `POST /theme_preview/sessions` 创建会话  
2. `POST /theme_preview/sessions/:id/sync` 上传文件  
3. 若同时传入 `--site-id` 与 `--page-id`，先 `GET /sites/:site_id/pages/:page_id` 取 **`full_path`**，再 **`POST .../preview_render`**（仅输出 `html_length`）  
4. 默认 **`DELETE` 会话**；加 **`--keep-session`** 则保留，便于接着调试

```bash
cd /path/to/your-theme

# 基本用法（语言可省略，则从 LANG/LC_ALL 推导，默认倾向 zh-CN）
baklib theme push --theme-dir . --entry templates/index.liquid --locale zh-CN

# 需要服务端 HTML 长度校验时（`--site-id` / `--page-id` 与 Open API 资源 id 一致，数字主键或 hashid 均可）
baklib theme push --theme-dir . --entry templates/index.liquid --locale zh-CN \
  --site-id <SITE_HASHID> --page-id <PAGE_HASHID>

# 保留会话（不 DELETE）
baklib theme push --theme-dir . --keep-session
```

### 开发服务器：`theme dev`

- **Open API 凭据**：与 `theme pull` 等相同；`theme dev` 会读 `baklib config` 或环境变量。  
- **预览会话**：默认**不会**自动创建；在管理面板右侧打开「**同步模版到预览**」后创建会话、上传主题并监听文件变更（防抖再同步）；关闭开关会删除会话。进程退出时也会尝试删除活跃会话。  
- **站点 / 门户回源**：在 **`/!admin`** 中选择站点；指纹资源等回源使用所选站点的 `portal_url`，或环境变量 **`BAKLIB_PORTAL_ORIGIN`**。  
- **首次同步组包**：入口固定为 **`templates/index.liquid`**；`locales` 语言在未在面板中指定时，与 `theme push` 一致从 **`LANG` / `LC_ALL`** 推导（见 `src/lib/theme-preview-locale.js`），面板内可再选语言。  
- **路径 HTML 预览**：有预览会话时，除面板与静态资源外的 **GET 路径** 由中间件调用 `preview_render`，并对 HTML 做 **`/__theme_asset/`** 与 **`/__baklib_proxy`** 改写（见上文）。无会话时，根路径 `/` **302** 到管理面板。  
- **静态页路径**：面板 **「静态页面」** 列出主题目录 **`statics/**/*.liquid`** 对应的 **`/s/…`** 预览链接（服务端须支持该路径的 `preview_render` 渲染）。

```bash
cd /path/to/your-theme

baklib theme dev --theme-dir .
```

若本机 `fs.watch(..., { recursive: true })` 不支持，运行日志中会打出说明；开启同步后首次会执行一次完整上传。

## 调试 HTTP

```bash
BAKLIB_CLI_TRACE=1 baklib theme push --theme-dir . --json
```

可看到请求 URL 与 body 摘要（注意勿在公共环境泄露 Token）。

## 故障排查

### 1. `422` 且说明为「预览会话无效或已过期」

含义：`sync` / `preview_render` 在缓存里读不到该 `session_id` 的会话元数据。除多机多进程外，**本地 Rails 开发最常见原因是 `NullStore`**：

| 原因 | 说明 |
|------|------|
| **开发环境 `Rails.cache` 为 `NullStore`** | 默认未执行 `rails dev:cache` 时，`config/environments/development.rb` 使用 **`NullStore`**：`write` 不落库、`read` 恒为 `nil`。表现即「`POST …/sessions` 成功，紧接着 `POST …/sync` 报会话无效」。**自 2026-05 起**：`ThemePreview::DevCache` 在检测到 `NullStore` 时会自动改用**进程内 `MemoryStore`** 存预览键，一般无需再开 dev cache；若你仍希望全站走 Solid Cache，可执行 `bin/rails dev:cache` 并确保存在 `tmp/caching-dev.txt`。 |
| **多进程 / 多实例 + 非共享缓存** | 例如 Puma **多 worker** 且使用 **`MemoryStore`**（非上述 NullStore 回退）：`POST create` 与 `POST sync` 若落在不同 worker，仍会丢会话。可 `WEB_CONCURRENCY=1` 或改用 **Redis / solid_cache** 等全局 `Rails.cache`。 |
| **负载均衡多机** | 无 sticky、缓存又是进程本地时，同样会出现「刚创建就过期」。 |
| **会话已过期** | 默认 TTL **15 分钟**；超时后需重新 `theme push` 或重启 `theme dev`。 |
| **响应里无 `session_id`** | 极少见。可开 `BAKLIB_CLI_TRACE=1` 看 `POST .../sessions` 的 JSON 是否含 `session_id`。 |

### 2. `401` / 鉴权失败

检查 `token` 是否为 Open API 的 **`key:secret`** 形式，且 `apiHost` 指向**当前环境**的 Open 域名（自建与 SaaS 不可混用）。

### 3. `422` 其他说明（路径不允许、非 UTF-8、超过 20 个文件等）

服务端会按 `ThemeEngine::FileInfo` 与 UTF-8 / 空字节规则校验；请按报错调整文件路径或减小依赖闭包。

## 相关代码（仓库内）

- CLI：`src/commands/theme-cmd.js`（`push` / `dev`）、`theme-preview/vite-plugin-preview.js`、`theme-preview/server/preview-sync-runtime.js`、`theme-preview/server/html-rewrite.js`、`theme-preview/server/upstream-proxy.js`、`src/lib/theme-preview-liquid-deps.js`、`src/api/ops-theme-preview.js`
- 服务端：`ThemePreview::DevCache`、`ThemePreview::SyncPathValidator`、`ThemePreview::PreviewRender`、`Api::ThemePreview::SessionsController`
