import test from "node:test";
import assert from "node:assert/strict";
import { normalizeIddaaLiveResults } from "../scripts/iddaa/live-status.ts";

test("Iddaa in-play statuses map to live and retain scores/minute", () => {
  const rows = normalizeIddaaLiveResults({
    isSuccess: true,
    data: { sc: {
      "101": { s: 2, ht: { c: 1 }, at: { c: 0 }, min: 19 },
      "102": { s: 3, ht: { c: 2 }, at: { c: 2 }, min: 103 },
      "103": { s: 4, ht: { c: 0 }, at: { c: 0 }, min: 45 },
      "104": { s: 11, ht: { c: 1 }, at: { c: 0 }, min: 93 },
      "105": { s: 12, ht: { c: 2 }, at: { c: 2 } },
      "106": { s: 49, ht: { c: 0 }, at: { c: 1 }, min: 45 },
      "107": { s: 6, ht: { c: 3 }, at: { c: 1 }, min: 90 },
      "108": { s: 0, ht: { c: 0 }, at: { c: 0 } }
    } }
  });
  assert.equal(rows.length, 7);
  assert.equal(rows.find(row => row.eventId === "101")?.status, 1);
  assert.equal(rows.find(row => row.eventId === "101")?.homeScore, "1");
  assert.equal(rows.find(row => row.eventId === "101")?.minute, "19'");
  assert.equal(rows.find(row => row.eventId === "107")?.status, 4);
  assert.equal(rows.find(row => row.eventId === "107")?.awayScore, "1");
  assert.equal(rows.some(row => row.eventId === "108"), false);
});

test("invalid live-results payload is rejected", () => {
  assert.throws(() => normalizeIddaaLiveResults({ isSuccess: false }), /isSuccess=true/);
});
