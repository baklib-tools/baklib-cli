import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  getThemePreviewCacheBaseDir,
  safeVersionDirSegment,
  themePreviewWorkspaceFingerprint,
} from "../src/lib/theme-preview-workdir.js";

test("safeVersionDirSegment sanitizes unsafe chars", () => {
  assert.equal(safeVersionDirSegment("1.2.3-beta+build"), "1.2.3-beta+build");
  assert.equal(safeVersionDirSegment("0.1.0/foo"), "0.1.0_foo");
});

test("getThemePreviewCacheBaseDir respects XDG_CACHE_HOME", async (t) => {
  const prev = process.env.XDG_CACHE_HOME;
  const dir = await mkdtemp(path.join(tmpdir(), "baklib-xdg-"));
  t.after(async () => {
    if (prev === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = prev;
    await rm(dir, { recursive: true, force: true });
  });
  process.env.XDG_CACHE_HOME = dir;
  assert.equal(getThemePreviewCacheBaseDir(), path.join(dir, "baklib-cli"));
});

test("themePreviewWorkspaceFingerprint is stable for same tree", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "baklib-fp-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "theme-preview", "a"), { recursive: true });
  await writeFile(path.join(root, "theme-preview", "a", "x.txt"), "hi", "utf8");
  await mkdir(path.join(root, "src", "lib"), { recursive: true });
  await writeFile(path.join(root, "src", "lib", "c.js"), "export const x=1", "utf8");
  await mkdir(path.join(root, "src", "api"), { recursive: true });
  await writeFile(path.join(root, "src", "api", "i.js"), "export {}", "utf8");
  const a = await themePreviewWorkspaceFingerprint(root);
  const b = await themePreviewWorkspaceFingerprint(root);
  assert.equal(a, b);
  assert.equal(a.length, 64);
});
