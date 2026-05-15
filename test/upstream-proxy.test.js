import test from "node:test";
import assert from "node:assert/strict";
import {
  assertResolvableHostIsPublic,
  isBlockedHostname,
  isPrivateOrLocalIpv4,
  parseProxyTargetUrl,
} from "../theme-preview/server/upstream-proxy.js";

test("parseProxyTargetUrl accepts https without credentials", () => {
  const u = parseProxyTargetUrl("https://example.com/path?q=1");
  assert.equal(u.href, "https://example.com/path?q=1");
});

test("parseProxyTargetUrl rejects non-https", () => {
  assert.throws(() => parseProxyTargetUrl("http://example.com/"), /only https/);
});

test("parseProxyTargetUrl rejects credentials in URL", () => {
  assert.throws(() => parseProxyTargetUrl("https://user:pass@example.com/"), /credentials not allowed/);
});

test("isBlockedHostname", () => {
  assert.equal(isBlockedHostname("localhost"), true);
  assert.equal(isBlockedHostname("example.com"), false);
});

test("isPrivateOrLocalIpv4", () => {
  assert.equal(isPrivateOrLocalIpv4("10.0.0.1"), true);
  assert.equal(isPrivateOrLocalIpv4("127.0.0.1"), true);
  assert.equal(isPrivateOrLocalIpv4("8.8.8.8"), false);
});

test("assertResolvableHostIsPublic rejects loopback ipv4", async () => {
  await assert.rejects(() => assertResolvableHostIsPublic("127.0.0.1"), /private ipv4/);
});

test("assertResolvableHostIsPublic rejects blocked hostname", async () => {
  await assert.rejects(() => assertResolvableHostIsPublic("localhost"), /blocked host/);
});
