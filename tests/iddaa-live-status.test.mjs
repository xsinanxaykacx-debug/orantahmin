import test from "node:test";
import assert from "node:assert/strict";
import { transformIddaaEvent } from "../scripts/iddaa/transform.ts";

test("Iddaa in-play event transforms live state, zero scores and minute", () => {
  const match = transformIddaaEvent({
    i: 123456,
    sid: 1,
    s: 1,
    il: true,
    hn: "Home FC",
    an: "Away FC",
    d: 1795890000,
    m: [],
    liveScore: {
      s: 4,
      ht: { c: 0 },
      at: { c: 1 },
      min: 45
    }
  }, 0);

  assert.equal(match?.status, 1);
  assert.equal(match?.fields.scoreHome, 0);
  assert.equal(match?.fields.scoreAway, 1);
  assert.equal(match?.liveMinute, "HT");
  assert.equal(match?.fields.iddaaLiveState, 4);
});

test("Iddaa scheduled event remains not started", () => {
  const match = transformIddaaEvent({
    i: 123457, sid: 1, s: 0, hn: "Home FC", an: "Away FC", d: 1795890000, m: []
  }, 0);
  assert.equal(match?.status, 0);
  assert.equal(match?.fields.scoreHome, undefined);
});
