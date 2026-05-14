import { useEffect, useMemo, useState } from "react";

const TEMPLATES = ["templates/index.liquid", "templates/page.liquid"];

export default function App() {
  const [assigns, setAssigns] = useState(null);
  const [err, setErr] = useState(null);
  const [pageId, setPageId] = useState("");
  const [template, setTemplate] = useState("templates/page.liquid");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/baklib/fixture?page_id=${encodeURIComponent(pageId)}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || r.statusText);
        if (!cancelled) {
          setAssigns(j.assigns);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr(String(e.message || e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  const pages = assigns?.site?.pages || [];

  const iframeSrc = useMemo(() => {
    const q = new URLSearchParams();
    q.set("template", template);
    if (pageId) q.set("page_id", pageId);
    return `/api/baklib/render?${q.toString()}`;
  }, [template, pageId]);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "1rem" }}>
      <h1 style={{ fontSize: "1.1rem" }}>Baklib 主题预览（本地）</h1>
      {err && <pre style={{ color: "crimson" }}>{err}</pre>}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        <label>
          模板{" "}
          <select value={template} onChange={(e) => setTemplate(e.target.value)}>
            {TEMPLATES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          当前页面{" "}
          <select
            value={pageId}
            onChange={(e) => setPageId(e.target.value)}
            style={{ minWidth: "12rem" }}
          >
            <option value="">（列表首项）</option>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.id}
              </option>
            ))}
          </select>
        </label>
      </div>
      <iframe title="liquid-preview" src={iframeSrc} style={{ width: "100%", height: "72vh", border: "1px solid #ccc" }} />
    </div>
  );
}
