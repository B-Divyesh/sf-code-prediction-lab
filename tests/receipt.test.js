import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("the frontend preserves prediction-before-run semantics", async () => {
  const source = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  assert.match(source, /prediction\.value\.trim\(\)\.length >= 3/);
  assert.match(source, /Prediction \(written before the run\)/);
  assert.match(source, /sb_license:/);
});

test("all bundled exercises disclose runtime and explanation", async () => {
  const exercises = JSON.parse(await readFile(new URL("../src/exercises.json", import.meta.url), "utf8"));
  assert.ok(exercises.length >= 6);
  for (const item of exercises) {
    assert.ok(item.runtime && item.explanation && item.question && item.code);
  }
});
