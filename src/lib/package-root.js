import path from "node:path";
import { fileURLToPath } from "node:url";

/** npm 包根目录（含 dist、theme-preview、package.json 等） */
export function packageRoot() {
  const d = path.dirname(fileURLToPath(import.meta.url));
  if (path.basename(d) === "dist") return path.join(d, "..");
  return path.resolve(d, "..", "..");
}
