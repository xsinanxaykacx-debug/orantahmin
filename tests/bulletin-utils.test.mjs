import test from "node:test";
import assert from "node:assert/strict";
import {
  dedupeByMatchId,
  hasMarketOdds,
  isUnverifiedHandicap,
  isValidOdds,
  uniqueOdds
} from "../src/utils/bulletinUtils.ts";

test("missing and invalid odds are not treated as usable values", () => {
  for (const value of [null, undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, "1.85"]) {
    assert.equal(isValidOdds(value), false);
  }
  assert.equal(isValidOdds(1.85), true);
});

test("an empty market or a market with only missing odds is unavailable", () => {
  assert.equal(hasMarketOdds([]), false);
  assert.equal(hasMarketOdds([null, undefined, Number.NaN, 0]), false);
  assert.equal(hasMarketOdds([null, 2.15]), true);
});

test("unique odds remove duplicates and invalid numeric values", () => {
  assert.deepEqual(uniqueOdds([1.85, 1.85, null, Number.NaN, 2.1, 0]), [1.85, 2.1]);
});

test("duplicate match IDs become one display item while source records are preserved", () => {
  const records = [
    { matchId: "42", sourceIndex: 1, odds: 1.45 },
    { matchId: "42", sourceIndex: 2, odds: 1.62 },
    { matchId: "43", sourceIndex: 3, odds: null }
  ];
  const result = dedupeByMatchId(records);
  assert.equal(result.length, 2);
  assert.equal(result[0].sourceRecords.length, 2);
  assert.deepEqual(result[0].sourceRecords.map((item) => item.odds), [1.45, 1.62]);
});

test("handicap with market ID but without verified line odds is flagged", () => {
  assert.equal(isUnverifiedHandicap({ marketHandicapMs: "123", handicapMs1: null, handicapMsX: null, handicapMs2: null }), true);
  assert.equal(isUnverifiedHandicap({ marketHandicapMs: "123", handicapMs1: 1.9, handicapMsX: null, handicapMs2: null }), false);
  assert.equal(isUnverifiedHandicap({ marketHandicapMs: null, handicapMs1: null, handicapMsX: null, handicapMs2: null }), false);
});
