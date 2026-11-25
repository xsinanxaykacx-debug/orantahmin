import test from "node:test";
import assert from "node:assert/strict";
import { settleMarketOutcome } from "../src/utils/marketSettlement.ts";

const fullTime = { home: 1, away: 1, finished: true, firstHalf: { home: 0, away: 1 } };

test("first-half 1.5 under/over uses decimal comma threshold", () => {
  assert.equal(settleMarketOutcome("1. Yarı 1,5 Alt/Üst", "Alt", fullTime), "won");
  assert.equal(settleMarketOutcome("1. Yarı 1,5 Alt/Üst", "Üst", fullTime), "lost");
});

test("second-half result is derived from full-time minus half-time score", () => {
  assert.equal(settleMarketOutcome("2. Yarı Sonucu", "1", fullTime), "lost");
  assert.equal(settleMarketOutcome("2. Yarı Sonucu", "X", fullTime), "lost");
  assert.equal(settleMarketOutcome("2. Yarı Sonucu", "2", fullTime), "won");
});

test("goal range supports six or more", () => {
  const result = { home: 4, away: 2, finished: true };
  assert.equal(settleMarketOutcome("Toplam Gol Aralığı", "6+ Gol", result), "won");
  assert.equal(settleMarketOutcome("Toplam Gol Aralığı", "4-5 Gol", result), "lost");
});

test("combined result and totals require both conditions", () => {
  assert.equal(settleMarketOutcome("Maç Sonucu ve (2,5) Alt/Üst", "X ve Alt", fullTime), "won");
  assert.equal(settleMarketOutcome("Maç Sonucu ve (2,5) Alt/Üst", "1 ve Üst", fullTime), "lost");
});

test("handicap result applies the listed home:away adjustment", () => {
  const result = { home: 1, away: 1, finished: true };
  assert.equal(settleMarketOutcome("Handikaplı Maç Sonucu (0:1)", "2", result), "won");
  assert.equal(settleMarketOutcome("Handikaplı Maç Sonucu (0:1)", "X", result), "lost");
});

test("more goals in a half and team scoring in both halves", () => {
  assert.equal(settleMarketOutcome("Daha Çok Gol Olacak Yarı", "2.Y", fullTime), "won");
  assert.equal(settleMarketOutcome("Daha Çok Gol Olacak Yarı", "1.Y", fullTime), "lost");
  assert.equal(settleMarketOutcome("Evsahibi İki Yarıda da Gol", "Atamaz", fullTime), "won");
  assert.equal(settleMarketOutcome("Deplasman İki Yarıda da Gol", "Atar", fullTime), "won");
});
