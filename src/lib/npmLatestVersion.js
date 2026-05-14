/** 查询 npm registry 上包的 latest 版本（失败抛错） */
export async function fetchNpmLatestVersion(packageName = "baklib-cli") {
  const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`registry 响应 ${res.status}`);
  }
  const data = await res.json();
  const v = data?.version;
  if (!v || typeof v !== "string") {
    throw new Error("registry 返回无 version 字段");
  }
  return v;
}
