import assert from "node:assert/strict";
import test from "node:test";
import { readOutputTokenLimit, outputTokenOptions } from "../lib/finance/ai-output-limit.ts";

test("uncapped policy omits the provider output-token parameter", () => {
  assert.equal(readOutputTokenLimit({ max_output_tokens: 0 }), 0);
  assert.deepEqual(outputTokenOptions(0), {});
  assert.equal(JSON.stringify({ model: "test", ...outputTokenOptions(0) }), '{"model":"test"}');
});
test("bounded policies retain their provider output-token parameter", () => {
  assert.equal(readOutputTokenLimit({ max_output_tokens: 1200 }), 1200);
  assert.deepEqual(outputTokenOptions(1200), { max_output_tokens: 1200 });
});
test("malformed reservations never become unlimited requests", () => {
  for (const invalid of [null, undefined, {}, [], { max_output_tokens: null }, { max_output_tokens: "0" }, { max_output_tokens: -1 }, { max_output_tokens: 1.5 }, { max_output_tokens: Infinity }]) {
    assert.equal(readOutputTokenLimit(invalid), null);
  }
  for (const invalid of [-1, 1.5, NaN, Infinity]) assert.throws(() => outputTokenOptions(invalid));
});
