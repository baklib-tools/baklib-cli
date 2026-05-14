/**
 * 使用 Node http(s) + form-data 多部分上传
 */

import http from "http";
import https from "https";
import { URL } from "url";

/**
 * @param {string} urlString
 * @param {string} authHeader
 * @param {import('form-data').default} form
 */
export function postMultipart(urlString, authHeader, form) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString);
    const isHttps = u.protocol === "https:";
    const lib = isHttps ? https : http;
    const port = u.port || (isHttps ? 443 : 80);
    const opts = {
      method: "POST",
      hostname: u.hostname,
      port,
      path: `${u.pathname}${u.search}`,
      headers: {
        Authorization: authHeader,
        ...form.getHeaders(),
      },
    };

    const req = lib.request(opts, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Baklib API error (${res.statusCode}): ${raw}`));
          return;
        }
        const trimmed = raw.trim();
        if (!trimmed) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(trimmed));
        } catch {
          reject(new Error(`Baklib API returned non-JSON (${res.statusCode}): ${trimmed.slice(0, 500)}`));
        }
      });
    });
    req.on("error", reject);
    form.pipe(req);
  });
}
