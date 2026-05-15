import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";

const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 15_000;

export function cacheRootDir() {
  const envDir = process.env.BAKLIB_PREVIEW_ASSET_CACHE_DIR;
  if (envDir) return path.resolve(envDir);
  const seed = process.env.BAKLIB_THEME_DIR || process.cwd();
  const h = crypto.createHash("sha256").update(seed).digest("hex").slice(0, 16);
  return path.join(os.tmpdir(), "baklib-cli-theme-preview-assets", h);
}

/**
 * GET 指定 URL，按完整 URL（sha256）落盘缓存；命中且未过期则直读磁盘。
 * @param {string} absoluteUrl
 * @returns {Promise<{ ok: true; buffer: Buffer; contentType: string; cache: "hit" | "miss" } | { ok: false; status: number }>}
 */
export async function fetchUrlWithDiskCache(absoluteUrl) {
  const maxBytes = Number(process.env.BAKLIB_PREVIEW_ASSET_MAX_BYTES || DEFAULT_MAX_BYTES);
  const maxAge = Number(process.env.BAKLIB_PREVIEW_ASSET_CACHE_MAX_AGE_MS || DEFAULT_MAX_AGE_MS);
  const dir = cacheRootDir();
  await fs.mkdir(dir, { recursive: true });
  const key = crypto.createHash("sha256").update(absoluteUrl).digest("hex");
  const binPath = path.join(dir, `${key}.bin`);
  const metaPath = path.join(dir, `${key}.json`);

  try {
    const [bin, metaText] = await Promise.all([
      fs.readFile(binPath).catch(() => null),
      fs.readFile(metaPath, "utf8").catch(() => null),
    ]);
    if (bin && metaText) {
      const meta = JSON.parse(metaText);
      if (typeof meta.savedAt === "number" && Date.now() - meta.savedAt < maxAge) {
        return {
          ok: true,
          buffer: bin,
          contentType: typeof meta.contentType === "string" ? meta.contentType : "application/octet-stream",
          cache: "hit",
        };
      }
    }
  } catch {
    /* ignore corrupt */
  }

  const controller = new AbortController();
  const timeoutMs = Number(process.env.BAKLIB_PREVIEW_ASSET_FETCH_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const upstream = await fetch(absoluteUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "baklib-cli-theme-preview-asset/1",
        Accept: "*/*",
      },
    });
    if (!upstream.ok) {
      return { ok: false, status: upstream.status };
    }
    const len = upstream.headers.get("content-length");
    if (len && Number(len) > maxBytes) return { ok: false, status: 413 };
    const ab = await upstream.arrayBuffer();
    const buffer = Buffer.from(ab);
    if (buffer.length > maxBytes) return { ok: false, status: 413 };
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    await fs.writeFile(binPath, buffer);
    await fs.writeFile(metaPath, JSON.stringify({ contentType, savedAt: Date.now() }));
    return { ok: true, buffer, contentType, cache: "miss" };
  } catch {
    return { ok: false, status: 502 };
  } finally {
    clearTimeout(t);
  }
}
