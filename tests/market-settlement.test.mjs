import test from "node:test";
import assert from "node:assert/strict";
import { settleMarketOutcome } from "../src/utils/marketSettlement.ts";

const fullTime = { home: 1, away: 1, finished: true, firstHalf: { home: 0, away: 1 } };

test("first-half 1.5 under/over uses decimal comma threshold", () => {
  assert.equal(settleMarketOutcome("1. Yarı 1,5 Alt/Üst", "Alt", fullTime), "won");
  assert.equal(settleMarketOutcome("1. Yarı 1,5 Alt/Üst", "Üst", fullTime), "lost");
});

test("second-half result is derived from full-time minus half-time score", () => {
  assert.equal(settleMarketOutcome("2. Yarı Sonucu", "1", fullTime), "won");
  assert.equal(settleMarketOutcome("2. Yarı Sonucu", "X", fullTime), "lost");
  assert.equal(settleMarketOutcome("2. Yarı Sonucu", "2", fullTime), "lost");
});

test("goal range supports six or more", () => {
  const result = { home: 4, away: 2, finished: true };
  assert.equal(settleMarketOutcome("Toplam Gol Aralığı", "6+ Gol", result), "won");
  assert.equal(settleMarketOutcome("Toplam Gol Aralığı", "6+ Gol", { ...result, home: 1, away: 4 }), "lost");
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
  assert.equal(settleMarketOutcome("Daha Çok Gol Olacak Yarı", "Eşit", fullTime), "won");
  assert.equal(settleMarketOutcome("Daha Çok Gol Olacak Yarı", "1.Y", fullTime), "lost");
  assert.equal(settleMarketOutcome("Daha Çok Gol Olacak Yarı", "2.Y", fullTime), "lost");
  assert.equal(settleMarketOutcome("Evsahibi İki Yarıda da Gol", "Atamaz", fullTime), "won");
  assert.equal(settleMarketOutcome("Deplasman İki Yarıda da Gol", "Atar", fullTime), "lost");
});

const eventResult = {
  home: 1, away: 4, finished: true, firstHalf: { home: 0, away: 1 },
  corners: { home: 5, away: 7, firstHalfHome: 2, firstHalfAway: 3 },
  cards: { yellow: 3, red: 1, total: 4 },
  firstGoal: "away"
};

test("first goal markets settle from the verified first scoring event", () => {
  assert.equal(settleMarketOutcome("İlk Gol", "2", eventResult), "won");
  assert.equal(settleMarketOutcome("İlk Gol", "1", eventResult), "lost");
  assert.equal(settleMarketOutcome("İlk Gol", "Olmaz", eventResult), "lost");
  assert.equal(settleMarketOutcome("İlk Gol", "Olmaz", { ...eventResult, firstGoal: "none" }), "won");
});

test("red card markets settle independently from total cards", () => {
  assert.equal(settleMarketOutcome("Kırmızı Kart", "Var", eventResult), "won");
  assert.equal(settleMarketOutcome("Kırmızı Kart", "Yok", eventResult), "lost");
  assert.equal(settleMarketOutcome("(3,5) Kart Alt/Üst", "Üst", eventResult), "won");
  assert.equal(settleMarketOutcome("(4,5) Kart Alt/Üst", "Alt", eventResult), "won");
  assert.equal(settleMarketOutcome("Kırmızı Kart", "Var", { ...eventResult, cards: null }), "unknown");
});

test("corner totals, first-half corners, ranges and most-corners markets settle", () => {
  assert.equal(settleMarketOutcome("(11,5) Korner Alt/Üst", "Üst", eventResult), "won");
  assert.equal(settleMarketOutcome("1.Yarı (4,5) Korner Alt/Üst", "Üst", eventResult), "won");
  assert.equal(settleMarketOutcome("En Çok Korner", "2", eventResult), "won");
  assert.equal(settleMarketOutcome("1. Yarı En Çok Korner", "X", eventResult), "lost");
  assert.equal(settleMarketOutcome("Toplam Korner Aralığı", "12+", eventResult), "won");
  assert.equal(settleMarketOutcome("Korner Tek/Çift", "Çift", eventResult), "won");
  assert.equal(settleMarketOutcome("(8,5) Korner Alt/Üst", "Alt", { ...eventResult, corners: null }), "unknown");
});

test("first-half/full-time combo uses both verified scores", () => {
  assert.equal(settleMarketOutcome("İlk Yarı/Maç Sonucu", "2/2", eventResult), "won");
  assert.equal(settleMarketOutcome("İlk Yarı/Maç Sonucu", "1/2", eventResult), "lost");
});
