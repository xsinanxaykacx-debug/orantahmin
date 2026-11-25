type Req = { method?: string; query: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): Res };
type Fixture = {
  id: number;
  home?: { score?: number | null };
  away?: { score?: number | null };
  status?: {
    started?: boolean;
    finished?: boolean;
    reason?: { short?: string };
    liveTime?: { short?: string; shortTime?: string };
    utcTime?: string;
  };
};
const headers = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36",
  Referer: "https://www.fotmob.com/"
};
function dateKey(offset: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + offset));
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}
async function getMatches(date: string) {
  const response = await fetch(`https://www.fotmob.com/api/data/matches?date=${date}`, {
    headers, signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`FotMob maç verisi alınamadı (HTTP ${response.status}).`);
  const payload = await response.json();
  const fixtures: Fixture[] = [];
  for (const league of payload?.leagues || []) {
    for (const match of league.matches || []) {
      const id = Number(match.id);
      if (id) fixtures.push({ id, home: match.home, away: match.away, status: match.status });
    }
  }
  return fixtures;
}
export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const rawIds = req.query.ids;
  const ids = String(Array.isArray(rawIds) ? rawIds[0] || "" : rawIds || "")
    .split(",").map(value => Number(value)).filter(value => Number.isSafeInteger(value) && value > 0);
  const requested = [...new Set(ids)].slice(0, 300);
  if (!requested.length) return res.status(200).json({ generatedAt: new Date().toISOString(), matches: [] });
  try {
    const days = [-1, 0, 1].map(dateKey);
    const payloads = await Promise.all(days.map(getMatches));
    const wanted = new Set(requested);
    const found = new Map<number, any>();
    for (const fixtures of payloads) for (const fixture of fixtures) {
      if (!wanted.has(fixture.id)) continue;
      const status = fixture.status || {};
      const liveTime = status.liveTime || {};
      found.set(fixture.id, {
        fotmobMatchId: fixture.id,
        homeScore: fixture.home?.score ?? null,
        awayScore: fixture.away?.score ?? null,
        started: Boolean(status.started),
        finished: Boolean(status.finished),
        status: status.reason?.short || (status.finished ? "MS" : status.started ? "CANLI" : null),
        minute: liveTime.short || liveTime.shortTime || status.reason?.short || null
      });
    }
    return res.status(200).json({
      source: "FotMob",
      generatedAt: new Date().toISOString(),
      matches: [...found.values()]
    });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Canlı skor verisi alınamadı." });
  }
}
