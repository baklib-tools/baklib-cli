import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** 用户级缓存根：默认 ~/.cache/baklib-cli；可用 XDG_CACHE_HOME 覆盖前半段 */
export function getBaklibCacheDir() {
  const home = os.homedir();
  const xdgCache = process.env.XDG_CACHE_HOME || path.join(home, ".cache");
  return path.join(xdgCache, "baklib-cli");
}

export function ensureBaklibCacheDir() {
  const dir = getBaklibCacheDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getVersionCheckStatePath() {
  return path.join(getBaklibCacheDir(), "version-check-state.json");
}
