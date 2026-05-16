/** 与 baklib ThemePreview::DevCache 对齐，供 CLI 预估与报错 */
export const THEME_PREVIEW_MAX_FILES = 20;
export const THEME_PREVIEW_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const THEME_PREVIEW_MAX_TOTAL_BYTES = 20 * 1024 * 1024;

/** `baklib theme dev` 内置控制面板 URL 路径（须与 theme-preview 中间件一致） */
export const THEME_PREVIEW_ADMIN_PANEL_PATH = "/!admin";

/** 预览页模板同步后热更新默认延迟（毫秒）；可用 `--reload-delay` 或 `BAKLIB_PREVIEW_RELOAD_DELAY_MS` 覆盖 */
export const DEFAULT_PREVIEW_RELOAD_DELAY_MS = 1000;
