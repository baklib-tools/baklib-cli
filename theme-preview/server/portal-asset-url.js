/**
 * 将预览页中的静态路径解析为门户绝对 URL（用于回源拉取并缓存）。
 *
 * @param {string} portalRaw 站点 portal_url（含 path 时作为相对资源的基础）
 * @param {{ rel?: string; pathname?: string; search?: string }} spec
 * @returns {string | null}
 */
export function resolvePortalAssetUrl(portalRaw, spec) {
  const raw = String(portalRaw || "").trim();
  if (!raw || !spec) return null;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname || u.username || u.password) return null;

  const originSlash = `${u.origin}/`;
  const baseForRelative = u.pathname.endsWith("/") ? u.href : new URL(`${u.pathname}/`, u.origin).href;

  if (spec.rel) {
    const r = String(spec.rel).split("?")[0].replace(/\\/g, "/");
    if (!r || r.startsWith("/") || r.includes("..")) return null;
    try {
      const out = new URL(r, baseForRelative).href;
      if (out.includes("/../") || out.endsWith("/..")) return null;
      return out;
    } catch {
      return null;
    }
  }

  if (spec.pathname !== undefined && spec.pathname !== null) {
    const p = String(spec.pathname);
    if (!p.startsWith("/") || p.includes("..")) return null;
    const search = typeof spec.search === "string" ? spec.search : "";
    try {
      return new URL(`${p}${search}`, originSlash).href;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * @param {string} devId
 * @param {(id: string) => any} getDevState
 */
export function getPortalRawForDev(devId, getDevState) {
  const st = getDevState(devId);
  const fromState = typeof st?.portalUrl === "string" ? st.portalUrl.trim() : "";
  const fromEnv = typeof process.env.BAKLIB_PORTAL_ORIGIN === "string" ? process.env.BAKLIB_PORTAL_ORIGIN.trim() : "";
  return fromState || fromEnv || "";
}
