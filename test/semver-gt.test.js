import test from "node:test";
import assert from "node:assert/strict";
import { semverGt } from "../src/lib/semverGt.js";

test("semverGt compares major.minor.patch", () => {
  assert.equal(semverGt("1.2.3", "1.2.2"), true);
  assert.equal(semverGt("1.2.2", "1.2.3"), false);
  assert.equal(semverGt("2.0.0", "1.9.9"), true);
  assert.equal(semverGt("1.0.0", "1.0.0"), false);
});

test("semverGt pads missing segments with zero", () => {
  assert.equal(semverGt("1.1", "1.0.9"), true);
  assert.equal(semverGt("1", "0.9.9"), true);
});
