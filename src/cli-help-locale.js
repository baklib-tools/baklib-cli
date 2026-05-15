import { Command, Help } from "commander";

/** Commander 内置分页参数说明（多处复用，保持一致） */
export const CLI_HELP_PAGE = "页码（从 1 起）";
export const CLI_HELP_PER_PAGE = "每页条数";

/**
 * 将 Commander 默认英文帮助排版译为中文习惯用词。
 * @param {string} text
 */
export function localizeHelpOutput(text) {
  return text
    .replace(/^Usage:/gm, "用法:")
    .replace(/^Arguments:/gm, "参数:")
    .replace(/^Options:/gm, "选项:")
    .replace(/^Global Options:/gm, "全局选项:")
    .replace(/^Commands:/gm, "子命令:")
    .replace(/\(([Dd]efault):\s*/g, "(默认: ");
}

export class BaklibHelp extends Help {
  formatHelp(cmd, helper) {
    return localizeHelpOutput(super.formatHelp(cmd, helper));
  }
}

/**
 * 安装 Baklib CLI 的帮助本地化：中文小节标题、子命令排序；不改变业务逻辑。
 */
export function installBaklibCommanderLocale() {
  Command.prototype.createHelp = function patchedCreateHelp() {
    return Object.assign(new BaklibHelp(), { sortSubcommands: true }, this.configureHelp());
  };
}
