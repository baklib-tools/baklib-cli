/** npm 发布名（与 package.json `name` 一致；供版本检查与提示） */
export const NPM_PUBLISHED_NAME = "@baklib/baklib-cli";

/** 查询 npm registry 上包的 latest 版本（失败抛错） */
export async function fetchNpmLatestVersion(packageName = NPM_PUBLISHED_NAME) {
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
