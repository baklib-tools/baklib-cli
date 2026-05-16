import test from "node:test";
import assert from "node:assert/strict";
import {
  formatNewVersionMessage,
  shouldSkipVersionCheck,
} from "../src/startup.js";
import { NPM_PUBLISHED_NAME } from "../src/lib/npmLatestVersion.js";

test("formatNewVersionMessage includes versions and install hint", () => {
  const msg = formatNewVersionMessage("0.4.1", "0.5.0");
  assert.match(msg, /0\.5\.0/);
  assert.match(msg, /0\.4\.1/);
  assert.match(msg, new RegExp(NPM_PUBLISHED_NAME.replace("@", "\\@")));
  assert.match(msg, /npm i -g/);
});

test("shouldSkipVersionCheck respects BAKLIB_SKIP_VERSION_CHECK", () => {
  const prev = process.env.BAKLIB_SKIP_VERSION_CHECK;
  process.env.BAKLIB_SKIP_VERSION_CHECK = "1";
  try {
    assert.equal(shouldSkipVersionCheck(["node", "baklib", "config", "show"]), true);
  } finally {
    if (prev === undefined) delete process.env.BAKLIB_SKIP_VERSION_CHECK;
    else process.env.BAKLIB_SKIP_VERSION_CHECK = prev;
  }
});

test("shouldSkipVersionCheck skips only lone --version / -V", () => {
  const prev = process.env.BAKLIB_SKIP_VERSION_CHECK;
  delete process.env.BAKLIB_SKIP_VERSION_CHECK;
  try {
    assert.equal(shouldSkipVersionCheck(["node", "baklib", "--version"]), true);
    assert.equal(shouldSkipVersionCheck(["node", "baklib", "-V"]), true);
    assert.equal(shouldSkipVersionCheck(["node", "baklib", "config", "show"]), false);
    assert.equal(shouldSkipVersionCheck(["node", "baklib"]), false);
  } finally {
    if (prev === undefined) delete process.env.BAKLIB_SKIP_VERSION_CHECK;
    else process.env.BAKLIB_SKIP_VERSION_CHECK = prev;
  }
});
