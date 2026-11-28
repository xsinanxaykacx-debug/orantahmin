import test from "node:test";
import assert from "node:assert/strict";
import { filterIddaaEventsForDate, getIstanbulDateKey, getIstanbulDateKeyFromEpoch } from "../scripts/iddaa/date-filter.ts";

const epoch = (value) => Math.floor(new Date(value).getTime() / 1000);

test("event timestamps are grouped by the Europe/Istanbul calendar date", () => {
  assert.equal(getIstanbulDateKeyFromEpoch(epoch("2026-11-27T21:30:00Z")), "2026-11-28");
  assert.equal(getIstanbulDateKeyFromEpoch(epoch("2026-11-28T20:59:00Z")), "2026-11-28");
  assert.equal(getIstanbulDateKeyFromEpoch(epoch("2026-11-28T21:00:00Z")), "2026-11-29");
});

test("daily filter keeps only selected-day football events and leaves other sports untouched", () => {
  const events = [
    { i: 1, sid: 1, d: epoch("2026-11-27T20:59:00Z") },
    { i: 2, sid: 1, d: epoch("2026-11-28T12:00:00Z") },
    { i: 3, sid: 1, d: epoch("2026-11-29T12:00:00Z") },
    { i: 4, sid: 2, d: epoch("2026-11-29T12:00:00Z") },
  ];
  assert.deepEqual(filterIddaaEventsForDate(events, "2026-11-28").map((event) => event.i), [2, 4]);
});

test("invalid target dates are rejected", () => {
  assert.throws(() => filterIddaaEventsForDate([], "28.11.2026"), /Geçersiz Türkiye tarihi/);
});

test("current Istanbul date uses the supplied instant", () => {
  assert.equal(getIstanbulDateKey(new Date("2026-11-27T21:01:00Z")), "2026-11-28");
});
