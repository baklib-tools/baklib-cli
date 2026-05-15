/**
 * 开发预览：将远端 https 资源经本地同源路径代理，避免浏览器跨域 / 防盗链问题。
 * GET /__baklib_proxy?url=<percent-encoded https URL>
 *
 * @import { IncomingMessage, ServerResponse } from "node:http"
 */
import dns from "node:dns/promises";
import net from "node:net";
import { fetchUrlWithDiskCache } from "./remote-asset-cache.js";

const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0", "metadata.google.internal", "metadata.goog"]);

/**
 * @param {string} host
 */
export function isBlockedHostname(host) {
  const h = String(host || "").toLowerCase().trim();
  if (!h) return true;
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h === "metadata" || h.endsWith(".internal")) return true;
  if (h.includes("169.254.169.254")) return true;
  return false;
}

/**
 * @param {string} ip
 */
export function isPrivateOrLocalIpv4(ip) {
  if (!net.isIPv4(ip)) return false;
  const parts = ip.split(".").map((x) => Number(x));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/**
 * @param {string} ip
 */
export function isPrivateOrLocalIpv6(ip) {
  if (!net.isIPv6(ip)) return false;
  const x = ip.toLowerCase();
  if (x === "::1") return true;
  if (x.startsWith("fc") || x.startsWith("fd")) return true;
  if (x.startsWith("fe80:")) return true;
  if (x.startsWith("ff")) return true;
  return false;
}

/**
 * @param {string} address
 */
function addressIsPrivate(address) {
  const fam = address.family;
  const ip = fam === "IPv6" ? address.address : address.address;
  if (fam === "IPv4" || net.isIPv4(ip)) return isPrivateOrLocalIpv4(ip);
  return isPrivateOrLocalIpv6(ip);
}

/**
 * @param {string} hostname
 * @returns {Promise<void>}
 */
export async function assertResolvableHostIsPublic(hostname) {
  const h = String(hostname || "").trim();
  if (!h || isBlockedHostname(h)) {
    throw new Error("blocked host");
  }
  if (net.isIPv4(h)) {
    if (isPrivateOrLocalIpv4(h)) throw new Error("private ipv4");
    return;
  }
  if (net.isIPv6(h)) {
    if (isPrivateOrLocalIpv6(h)) throw new Error("private ipv6");
    return;
  }
  const results = await dns.lookup(h, { all: true, verbatim: true });
  if (!results.length) throw new Error("dns empty");
  for (const r of results) {
    if (addressIsPrivate(r)) throw new Error("dns resolved to private address");
  }
}

/**
 * @param {string} raw
 * @returns {URL}
 */
export function parseProxyTargetUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) throw new Error("missing url");
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new Error("invalid url");
  }
  if (u.protocol !== "https:") throw new Error("only https");
  if (!u.hostname) throw new Error("missing host");
  if (u.username || u.password) throw new Error("credentials not allowed");
  return u;
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} rawUrl
 */
export async function handleBaklibProxyRequest(req, res, rawUrl) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method Not Allowed");
    return;
  }
  const q = new URL(rawUrl, "http://vite.local").searchParams.get("url");
  let target;
  try {
    target = parseProxyTargetUrl(q || "");
    await assertResolvableHostIsPublic(target.hostname);
  } catch (e) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(String(e?.message || e));
    return;
  }

  try {
    const result = await fetchUrlWithDiskCache(target.href);
    if (!result.ok) {
      res.statusCode = result.status;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      if (result.status === 413) res.end("Payload Too Large");
      else if (result.status === 404) res.end("Not Found");
      else res.end("Bad Gateway");
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.end(result.buffer);
  } catch (e) {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(String(e?.message || e));
    }
  }
}
