/**
 * Baklib CLI 配置（惰性读取，与 baklib-mcp-server 优先级一致，不随模块加载退出进程）
 */

import fs from "fs/promises";
import os from "os";
import path from "path";

export const DEFAULT_API_BASE = "https://open.baklib.com/api/v1";

const TOKEN_KEYS = ["BAKLIB_MCP_TOKEN", "BAKLIB_TOKEN"];
const API_BASE_KEYS = ["BAKLIB_MCP_API_BASE", "BAKLIB_API_BASE"];

async function readTextFileIfExists(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    const value = String(text).trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<{ token: string, apiBase: string }>}
 */
export async function loadBaklibConfig() {
  const workspaceRoot = (process.env.BAKLIB_MCP_WORKSPACE || "").trim();
  let workspaceToken = null;
  let workspaceApiBase = null;
  if (workspaceRoot) {
    const wsConfigDir = path.join(path.resolve(workspaceRoot), ".config");
    for (const k of TOKEN_KEYS) {
      const v = await readTextFileIfExists(path.join(wsConfigDir, k));
      if (v) {
        workspaceToken = v;
        break;
      }
    }
    for (const k of API_BASE_KEYS) {
      const v = await readTextFileIfExists(path.join(wsConfigDir, k));
      if (v) {
        workspaceApiBase = v;
        break;
      }
    }
  }

  const userConfigDir = path.join(os.homedir(), ".config");
  let userToken = null;
  let userApiBase = null;
  for (const k of TOKEN_KEYS) {
    const v = await readTextFileIfExists(path.join(userConfigDir, k));
    if (v) {
      userToken = v;
      break;
    }
  }
  for (const k of API_BASE_KEYS) {
    const v = await readTextFileIfExists(path.join(userConfigDir, k));
    if (v) {
      userApiBase = v;
      break;
    }
  }

  const envToken =
    TOKEN_KEYS.map((k) => (process.env[k] || "").trim()).find(Boolean) || "";
  const envApiBase =
    API_BASE_KEYS.map((k) => (process.env[k] || "").trim()).find(Boolean) || "";

  const token = envToken || workspaceToken || userToken || "";
  const apiBase = envApiBase || workspaceApiBase || userApiBase || DEFAULT_API_BASE;

  return { token, apiBase: apiBase.replace(/\/$/, "") };
}

export function requireToken(config) {
  if (!config.token) {
    throw new Error(
      "未配置 Token：请设置环境变量 BAKLIB_MCP_TOKEN（或 BAKLIB_TOKEN），或写入 ~/.config/BAKLIB_MCP_TOKEN；亦支持 BAKLIB_MCP_WORKSPACE/.config/",
    );
  }
}
