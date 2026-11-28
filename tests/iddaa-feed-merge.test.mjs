import test from "node:test";
import assert from "node:assert/strict";
import { extractIddaaEvents, mergeIddaaEventFeeds } from "../scripts/iddaa/merge-feeds.ts";

test("extracts event rows from grouped and flat Iddaa response shapes", () => {
  const grouped = { data: [{ events: [{ i: 1, sid: 1 }, { i: 2, sid: 1 }] }] };
  const flat = { data: [{ i: 3, sid: 1 }, { i: 4, sid: 2 }] };
  assert.deepEqual(extractIddaaEvents(grouped).map(row => row.i), [1, 2]);
  assert.deepEqual(extractIddaaEvents(flat).map(row => row.i), [3, 4]);
});

test("merges type feeds by event id and keeps the richest markets and live state", () => {
  const preMatch = {
    data: [{ events: [
      { i: 100, sid: 1, s: 0, d: 1000, m: [{ st: 1 }, { st: 2 }] },
      { i: 200, sid: 1, s: 0, d: 2000, m: [{ st: 1 }] },
      { i: 900, sid: 2, s: 0, d: 3000, m: [] }
    ] }]
  };
  const live = {
    data: {
      events: [
        { i: 100, sid: 1, s: 1, d: 1000, m: [] },
        { i: 300, sid: 1, s: 1, d: 0, m: [] }
      ],
      sc: {
        "100": { s: 3, ht: { c: 2 }, at: { c: 1 }, min: 65 }
      }
    }
  };
  const extended = {
    data: {
      events: [
        { i: 300, sid: 1, s: 0, d: 4000, m: [{ st: 88 }] },
        { i: 400, sid: 1, s: 0, d: 5000, m: [{ st: 1 }] }
      ]
    }
  };

  const merged = mergeIddaaEventFeeds([preMatch, live, extended]);
  const byId = new Map(merged.map(row => [String(row.i), row]));

  assert.equal(merged.length, 5);
  assert.equal(byId.get("100").s, 1);
  assert.equal(byId.get("100").m.length, 2);
  assert.equal(byId.get("100").liveScore.min, 65);
  assert.equal(byId.get("300").s, 1);
  assert.equal(byId.get("300").d, 4000);
  assert.equal(byId.get("300").m[0].st, 88);
  assert.equal(byId.get("400").sid, 1);
  assert.equal(byId.get("900").sid, 2);
});

test("keeps a valid date when a later feed has no event timestamp", () => {
  const merged = mergeIddaaEventFeeds([
    { data: { events: [{ i: 1, sid: 1, s: 0, d: 1234, m: [] }] } },
    { data: { events: [{ i: 1, sid: 1, s: 0, d: 0, m: [] }] } }
  ]);
  assert.equal(merged[0].d, 1234);
});


test("authoritative bulletin rejects type-2-only fixtures but accepts live-only events", () => {
  const primary = {
    data: [{ events: [{ i: 10, sid: 1, s: 0, d: 1000, m: [{ st: 1 }] }] }]
  };
  const live = {
    data: { events: [
      { i: 20, sid: 1, s: 1, d: 2000, m: [] },
      { i: 21, sid: 1, s: 0, d: 2100, m: [] },
    ] },
  };
  const enrichment = {
    data: { events: [
      { i: 10, sid: 1, s: 0, d: 1000, m: [{ st: 1 }, { st: 88 }] },
      { i: 30, sid: 1, s: 0, d: 3000, m: [{ st: 1 }] },
    ] },
  };

  const merged = mergeIddaaEventFeeds([primary, live, enrichment], {
    includeNewFromFeedIndexes: [1],
    onlyLiveNewFromFeedIndexes: [1],
  });
  const byId = new Map(merged.map(row => [String(row.i), row]));

  assert.deepEqual([...byId.keys()].sort(), ["10", "20"]);
  assert.equal(byId.get("10").m.length, 2);
  assert.equal(byId.get("20").s, 1);
});

test("football programme uses only type-0 football fixtures; other feeds only enrich existing rows", () => {
  const primary = {
    data: [{ events: [
      { i: 1, sid: 1, s: 0, d: 1000, m: [{ st: 1 }] },
      { i: 2, sid: 2, s: 0, d: 2000, m: [{ st: 1 }] },
    ] }],
  };
  const live = {
    data: { events: [
      { i: 1, sid: 1, s: 1, d: 1000, m: [{ st: 1 }, { st: 2 }] },
      { i: 3, sid: 1, s: 1, d: 3000, m: [] },
    ] },
  };
  const extended = {
    data: { events: [{ i: 4, sid: 1, s: 0, d: 4000, m: [] }] },
  };

  const football = mergeIddaaEventFeeds([primary, live, extended], {
    includeNewFromFeedIndexes: [],
  }).filter(row => Number(row.sid) === 1);

  assert.deepEqual(football.map(row => String(row.i)), ["1"]);
  assert.equal(football[0].s, 1);
  assert.equal(football[0].m.length, 2);
});
