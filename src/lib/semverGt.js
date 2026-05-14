/** 简单三段式 semver 比较：a > b */
export function semverGt(a, b) {
  const pa = String(a)
    .split(".")
    .map((x) => Number.parseInt(x, 10) || 0);
  const pb = String(b)
    .split(".")
    .map((x) => Number.parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < n; i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}
