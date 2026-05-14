/**
 * 根命令 `--help` 前的横幅：使用 **cfonts**（依赖包，运行时从 node_modules 加载；见该包许可证）。
 */
import cfonts from "cfonts";

const { render } = cfonts;

const CFONTS_OPTIONS = {
  font: "block",
  colors: ["cyan", "white"],
  env: "node",
  spaceless: true,
};

const ANSI_RE = /\u001b\[[\d;]*m/g;

function stripAnsi(s) {
  return s.replace(ANSI_RE, "");
}

function renderBannerColored() {
  const out = render("Baklib", CFONTS_OPTIONS, false, 0);
  if (!out || !out.string) {
    return "";
  }
  return out.string;
}

let _cachedColored;
let _cachedPlain;

function getBannerColored() {
  if (_cachedColored === undefined) {
    _cachedColored = renderBannerColored();
  }
  return _cachedColored;
}

function getBannerPlainText() {
  if (_cachedPlain === undefined) {
    _cachedPlain = stripAnsi(getBannerColored());
  }
  return _cachedPlain;
}

/**
 * `BAKLIB_NO_BANNER=1` 时关闭。
 * 非 TTY（管道/重定向）时去掉 ANSI，避免日志里全是转义序列。
 */
export function getHelpBanner() {
  if (process.env.BAKLIB_NO_BANNER === "1") {
    return "";
  }
  const body = process.stdout.isTTY ? getBannerColored() : getBannerPlainText();
  if (!body) {
    return "";
  }
  return `\n${body}\n`;
}

/** 无 ANSI，供测试或需纯文本场景 */
export function getHelpBannerPlain() {
  if (process.env.BAKLIB_NO_BANNER === "1") {
    return "";
  }
  const body = getBannerPlainText();
  if (!body) {
    return "";
  }
  return `\n${body}\n`;
}
