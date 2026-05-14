import path from "path";
import fs from "fs";
import { buildPreviewAssigns } from "./server/fetch-fixture.js";
import { renderThemeTemplate } from "./server/render-theme.js";

function parseQuery(url) {
  const u = new URL(url, "http://vite.local");
  return Object.fromEntries(u.searchParams.entries());
}

function safeThemeFile(themeDir, rel) {
  const root = path.resolve(themeDir);
  const full = path.resolve(root, rel.split("?")[0]);
  if (!full.startsWith(root + path.sep) && full !== root) {
    return null;
  }
  return full;
}

export function baklibPreviewPlugin() {
  return {
    name: "baklib-preview",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const url = req.url || "";
          if (url.startsWith("/__theme_asset/")) {
            const themeDir = process.env.BAKLIB_THEME_DIR;
            if (!themeDir) {
              res.statusCode = 500;
              res.end("BAKLIB_THEME_DIR missing");
              return;
            }
            const rel = decodeURIComponent(url.slice("/__theme_asset/".length));
            const file = safeThemeFile(themeDir, rel);
            if (!file || !fs.existsSync(file)) {
              res.statusCode = 404;
              res.end("Not found");
              return;
            }
            res.setHeader("Content-Type", guessMime(file));
            fs.createReadStream(file).pipe(res);
            return;
          }
          if (url.startsWith("/api/baklib/fixture")) {
            const siteId = process.env.BAKLIB_PREVIEW_SITE_ID;
            if (!siteId) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "BAKLIB_PREVIEW_SITE_ID missing" }));
              return;
            }
            const q = parseQuery(url);
            const assigns = await buildPreviewAssigns(siteId, q.page_id);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ assigns }));
            return;
          }
          if (url.startsWith("/api/baklib/render")) {
            const siteId = process.env.BAKLIB_PREVIEW_SITE_ID;
            const themeDir = process.env.BAKLIB_THEME_DIR;
            if (!siteId || !themeDir) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "site or theme dir missing" }));
              return;
            }
            const q = parseQuery(url);
            const assigns = await buildPreviewAssigns(siteId, q.page_id);
            const templateRel = q.template || "templates/page.liquid";
            const html = await renderThemeTemplate({
              themeRoot: path.resolve(themeDir),
              templateRel,
              assigns,
            });
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(html);
            return;
          }
        } catch (e) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: String(e?.message || e) }));
          return;
        }
        next();
      });
    },
  };
}

function guessMime(file) {
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".js")) return "application/javascript";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg")) return "image/jpeg";
  if (file.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}
