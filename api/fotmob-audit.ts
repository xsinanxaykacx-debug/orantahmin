type Req = { method?: string; query: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): Res };

type BulletinMatch = { matchId: string | number; homeName?: string | null; awayName?: string | null; date: string; time?: string };
type FotMatch = { id: number; home?: { name?: string }; away?: { name?: string }; status?: unknown; time?: unknown; league?: string };

const headers = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36",
  Referer: "https://www.fotmob.com/"
};
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
function similarity(a: string, b: string) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.startsWith(y) || y.startsWith(x)) return Math.min(x.length, y.length) / Math.max(x.length, y.length) * 0.18 + 0.78;
  const aa = x.split(" "), bb = y.split(" ");
  const token = aa.filter(t => bb.includes(t)).length / Math.max(aa.length, bb.length);
  const prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    for (let j = 0; j <= y.length; j++) prev[j] = cur[j];
  }
  const edit = 1 - prev[y.length] / Math.max(x.length, y.length);
  return Math.max(edit, token * 0.88);
}
async function jsonFetch(url: string) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
  const type = r.headers.get("content-type") || "";
  if (!r.ok || !type.includes("json")) throw new Error("HTTP " + r.status + " (" + type + ")");
  return r.json();
}
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) { const i = next++; if (i >= items.length) return; out[i] = await fn(items[i]); }
  }));
  return out;
}
export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const one = (k: string) => { const v = req.query[k]; return Array.isArray(v) ? v[0] : v; };
  const requestedDate = one("date");
  const includeDetails = one("details") === "1";
  if (requestedDate && !/^\d{8}$/.test(requestedDate)) return res.status(400).json({ error: "date must be YYYYMMDD" });
  try {
    const rawUrl = "https://raw.githubusercontent.com/xsinanxaykacx-debug/orantahmin/feature/sofascore-lineups/public/data/mackolik-bulletin.json";
    const rawResponse = await fetch(rawUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    if (!rawResponse.ok) throw new Error("Bulletin HTTP " + rawResponse.status);
    const bulletin = JSON.parse(await rawResponse.text());
    const rows: BulletinMatch[] = (bulletin.matches || []).filter((m: BulletinMatch) => {
      const d = (m.date || "").split(".").reverse().join("");
      return !requestedDate || d === requestedDate;
    });
    const dates = [...new Set(rows.map(m => m.date.split(".").reverse().join("")))];
    const fixtureSets = await Promise.all(dates.map(async date => {
      const data = await jsonFetch("https://www.fotmob.com/api/data/matches?date=" + date);
      return (data?.leagues || []).flatMap((league: any) => (league.matches || []).map((m: any) => ({
        id: Number(m.id), home: m.home?.name, away: m.away?.name, status: m.status, time: m.time, league: league.name
      })));
    }));
    const fixtures: FotMatch[] = fixtureSets.flat();
    const results = rows.map(row => {
      if (!row.homeName || !row.awayName) return { bulletinId: String(row.matchId), home: row.homeName || null, away: row.awayName || null, date: row.date, time: row.time, match: null, confidence: 0, state: "invalid_bulletin_team" };
      const ranked = fixtures.map(f => {
        const hs = similarity(row.homeName!, f.home || ""), as = similarity(row.awayName!, f.away || "");
        return { f, hs, as, score: (hs + as) / 2 };
      }).filter(x => x.hs >= 0.62 && x.as >= 0.62).sort((a, b) => b.score - a.score);
      const best = ranked[0], second = ranked[1];
      if (!best || best.score < 0.76) return { bulletinId: String(row.matchId), home: row.homeName, away: row.awayName, date: row.date, time: row.time, match: null, confidence: best ? Number(best.score.toFixed(3)) : 0, state: "unmatched", candidate: best ? { home: best.f.home, away: best.f.away, id: best.f.id } : null };
      if (second && best.score - second.score < 0.055) return { bulletinId: String(row.matchId), home: row.homeName, away: row.awayName, date: row.date, time: row.time, match: null, confidence: Number(best.score.toFixed(3)), state: "ambiguous", candidates: ranked.slice(0, 2).map(x => ({ id: x.f.id, home: x.f.home, away: x.f.away, score: Number(x.score.toFixed(3)) })) };
      return { bulletinId: String(row.matchId), home: row.homeName, away: row.awayName, date: row.date, time: row.time, match: { id: best.f.id, home: best.f.home, away: best.f.away, league: best.f.league, status: best.f.status }, confidence: Number(best.score.toFixed(3)), state: "matched" };
    });
    const matched = results.filter(x => x.state === "matched");
    let lineupResults: any[] = [];
    if (includeDetails) {
      const ids = [...new Set(matched.map(x => x.match!.id))];
      lineupResults = await mapLimit(ids, 4, async id => {
        try {
          const d = await jsonFetch("https://www.fotmob.com/api/data/matchDetails?matchId=" + id);
          const l = d?.content?.lineup;
          const h = l?.homeTeam, a = l?.awayTeam;
          const count = (t: any, k: string[]) => k.reduce((n, key) => n + (Array.isArray(t?.[key]) ? t[key].length : 0), 0);
          return { id, hasLineup: !!l, lineupType: l?.lineupType || null, source: l?.source || null,
            home: h ? { name: h.name, formation: h.formation, starters: count(h, ["starters"]), bench: count(h, ["subs", "substitutes", "bench"]), unavailable: count(h, ["unavailable"]) } : null,
            away: a ? { name: a.name, formation: a.formation, starters: count(a, ["starters"]), bench: count(a, ["subs", "substitutes", "bench"]), unavailable: count(a, ["unavailable"]) } : null,
            error: null };
        } catch (e) { return { id, hasLineup: false, error: e instanceof Error ? e.message : "detail_fetch_failed" }; }
      });
    }
    const lineupById = new Map(lineupResults.map(x => [x.id, x]));
    const mapped = results.map(x => x.state === "matched" && includeDetails ? { ...x, lineup: lineupById.get(x.match!.id) || null } : x);
    const counts = {
      bulletinRows: rows.length, uniqueBulletinIds: new Set(rows.map(x => String(x.matchId))).size,
      duplicateRows: rows.length - new Set(rows.map(x => String(x.matchId))).size,
      fixtureRows: fixtures.length, matched: matched.length,
      unmatched: results.filter(x => x.state === "unmatched").length,
      ambiguous: results.filter(x => x.state === "ambiguous").length,
      invalidBulletinTeam: results.filter(x => x.state === "invalid_bulletin_team").length,
      detailChecked: lineupResults.length, lineupAvailable: lineupResults.filter(x => x.hasLineup).length,
      lineupMissingOrError: lineupResults.filter(x => !x.hasLineup).length,
      bothTeamsStartingXI: lineupResults.filter(x => x.home?.starters === 11 && x.away?.starters === 11).length,
      bothTeamsBench: lineupResults.filter(x => (x.home?.bench || 0) > 0 && (x.away?.bench || 0) > 0).length
    };
    return res.status(200).json({ source: "mackolik+fotmob", date: requestedDate || "all", detailsIncluded: includeDetails, counts, results: mapped });
  } catch (e) {
    return res.status(502).json({ source: "fotmob-audit", error: e instanceof Error ? e.message : "audit_failed" });
  }
}
