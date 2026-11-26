import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/iddaa-lineups.ts";

function responseRecorder() {
  return {
    code: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test("iddaa lineup endpoint normalizes probable starters, substitutes and formation", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url, "https://statisticsv2.iddaa.com/statistics/soccer/lineup/3326581");
    return new Response(JSON.stringify({
      isSuccess: true,
      data: {
        ei: 3326581,
        src: "Mixed",
        h: { n: "Beşiktaş", lu: "https://img.example/home.png", f: "4-3-3", p: [
          { n: "Kaleci", j: 1, p: "Kaleci", r: false, ps: "Merkez", px: "50", py: "12" },
          { n: "Yedek", j: 80, p: "Kaleci", r: true }
        ] },
        a: { n: "Hapoel Beer Sheva", f: "4-3-3", p: [
          { n: "Deplasman Oyuncusu", j: 9, p: "Forvet", r: false }
        ] }
      }
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const res = responseRecorder();
    await handler({ method: "GET", query: { eventId: "3326581" } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.source, "iddaa.com");
    assert.equal(res.body.lineupType, "Muhtemel 11");
    assert.equal(res.body.home.name, "Beşiktaş");
    assert.equal(res.body.home.formation, "4-3-3");
    assert.equal(res.body.home.starters.length, 1);
    assert.equal(res.body.home.starters[0].x, 50);
    assert.equal(res.body.home.substitutes[0].name, "Yedek");
    assert.equal(res.body.away.starters[0].role, "Forvet");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("iddaa lineup endpoint rejects malformed event ids without upstream request", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("fetch must not be called"); };
  try {
    const res = responseRecorder();
    await handler({ method: "GET", query: { eventId: "3326581abc" } }, res);
    assert.equal(res.code, 400);
    assert.match(res.body.error, /maç numarası/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
