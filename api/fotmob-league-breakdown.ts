export const config = { maxDuration: 60 };

type Req = { method?: string; query: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): Res };

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36";
const headers = { Accept: "application/json", "User-Agent": UA, Referer: "https://www.fotmob.com/" };

async function getJson(url: string) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!response.ok || !(response.headers.get("content-type") || "").includes("json")) throw new Error(`FotMob HTTP ${response.status}`);
  return response.json();
}
async function mapLimit<T, R>(items: T[], limit: number, callback: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try { output[index] = await callback(items[index]); }
      catch { output[index] = null as R; }
    }
  }));
  return output;
}
function catalogRows(data: any) {
  const rows = new Map<number, { id: number; name: string; country: string }>();
  const add = (item: any, country = "") => {
    const id = Number(item?.id);
    if (id && item?.name) rows.set(id, { id, name: String(item.name), country: String(item.ccode || country || "Uluslararası") });
  };
  for (const item of data?.popular || []) add(item);
  const groups = Array.isArray(data?.international) ? data.international : data?.international ? [data.international] : [];
  for (const group of groups) {
    const nested = Array.isArray(group?.leagues) ? group.leagues : group?.id ? [group] : [];
    for (const item of nested) add(item, "Uluslararası");
  }
  for (const country of data?.countries || []) for (const item of country?.leagues || []) add(item, country?.ccode || country?.name || "");
  return [...rows.values()].sort((a, b) => a.country.localeCompare(b.country, "tr") || a.name.localeCompare(b.name, "tr"));
}
function scoreOf(match: any) {
  const h = Number(match?.home?.score ?? match?.homeScore);
  const a = Number(match?.away?.score ?? match?.awayScore);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  return { home: h, away: a };
}
function isFirstHalf(event: any) {
  const period = String(event?.period || "").toLowerCase();
  if (period.includes("firsthalf") || period === "1h") return true;
  if (period.includes("secondhalf") || period.includes("extrahalf")) return false;
  const label = String(event?.timeStr || event?.time || "");
  const plus = label.match(/^(\d+)\s*\+/);
  if (plus) return Number(plus[1]) <= 45;
  const minute = Number(event?.time);
  return Number.isFinite(minute) && minute <= 45;
}
function halfTimeScore(events: any[], full: { home: number; away: number }) {
  if (!Array.isArray(events)) return null;
  if (events.length === 0 && full.home + full.away > 0) return null;
  let home = 0, away = 0;
  const goals = events.filter(event => String(event?.type || "").toLowerCase() === "goal" && !event?.isPenaltyShootoutEvent)
    .sort((a, b) => Number(a?.time || 0) - Number(b?.time || 0));
  for (const event of goals) {
    if (!isFirstHalf(event)) continue;
    const homeScoring = Boolean(event?.isHome) !== Boolean(event?.ownGoal);
    if (homeScoring) home++;
    else away++;
  }
  if (home > full.home || away > full.away) return null;
  return { home, away };
}
function resultCode(home: number, away: number) {
  return home > away ? "1" : home < away ? "2" : "0";
}
function market(title: string, values: string[], total: number, maxItems = 0) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr"));
  const selected = maxItems ? sorted.slice(0, maxItems) : sorted;
  return {
    title, matches: total,
    items: selected.map(([label, count]) => ({ label, count, percent: total ? count / total * 100 : 0 }))
  };
}
export default async function handler(req: Req, res: Res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const read = (key: string) => {
    const value = req.query[key];
    return Array.isArray(value) ? value[0] : value;
  };
  try {
    if (read("catalog") === "1") {
      const catalog = await getJson("https://www.fotmob.com/api/data/allLeagues?locale=en");
      return res.status(200).json({ leagues: catalogRows(catalog) });
    }
    const leagueId = Number(read("leagueId") || 71);
    const season = String(read("season") || "");
    const selectedRound = String(read("round") || "all");
    if (!Number.isInteger(leagueId) || leagueId <= 0) return res.status(400).json({ error: "Geçersiz lig." });
    const suffix = season ? `&season=${encodeURIComponent(season)}` : "";
    const data = await getJson(`https://www.fotmob.com/api/data/leagues?id=${leagueId}${suffix}`);
    const details = data?.details || {};
    const seasons = Array.isArray(data?.allAvailableSeasons) ? data.allAvailableSeasons.map((item: unknown) => String(item)) : [];
    const activeSeason = String(details.selectedSeason || season || seasons[0] || "");
    const rawFixtures = Array.isArray(data?.fixtures?.allMatches) ? data.fixtures.allMatches : [];
    const fixtures = rawFixtures.filter((match: any) => match?.status?.finished === true && !match?.status?.cancelled && scoreOf(match));
    const roundOf = (match: any) => String(match?.roundName ?? match?.matchRound ?? match?.round ?? match?.tournamentStage ?? match?.status?.roundName ?? "").trim();
    const rounds = [...new Set(rawFixtures.map(roundOf).filter(Boolean))].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b, "tr"));
    const selectedFixtures = selectedRound === "all" ? fixtures : fixtures.filter((match: any) => roundOf(match) === selectedRound);
    const detailRows = await mapLimit(selectedFixtures, 6, async (match: any) => {
      const id = String(match?.id || match?.matchId || "");
      if (!id) return null;
      const detail = await getJson(`https://www.fotmob.com/api/data/matchDetails?matchId=${encodeURIComponent(id)}`);
      const events = detail?.content?.matchFacts?.events?.events;
      const finalScore = scoreOf(match);
      if (!finalScore || !Array.isArray(events)) return null;
      const half = halfTimeScore(events, finalScore);
      return { id, finalScore, half };
    });
    const byId = new Map<string, { finalScore: { home: number; away: number }; half: { home: number; away: number } | null }>();
    for (const row of detailRows.filter(Boolean) as Array<{ id: string; finalScore: { home: number; away: number }; half: { home: number; away: number } | null }>) byId.set(row.id, row);
    const finalScores = selectedFixtures.map((match: any) => scoreOf(match)).filter(Boolean) as Array<{ home: number; away: number }>;
    const verifiedPairs = selectedFixtures.map((match: any) => {
      const full = scoreOf(match);
      const detail = byId.get(String(match?.id || match?.matchId || ""));
      return full && detail?.half ? { full, half: detail.half } : null;
    }).filter(Boolean) as Array<{ full: { home: number; away: number }; half: { home: number; away: number } }>;
    const fullTime = finalScores;
    const halfTime = verifiedPairs.map(pair => pair.half);
    const secondHalf = verifiedPairs.map(({ full, half }) => ({
      home: full.home - half.home,
      away: full.away - half.away
    }));
    const fullScores = fullTime.map(score => `${score.home}-${score.away}`);
    const halfScores = halfTime.map(score => `${score.home}-${score.away}`);
    const htft = verifiedPairs.map(({ full, half }) => `${resultCode(half.home, half.away)}/${resultCode(full.home, full.away)}`);
    const firstSecondBtts = verifiedPairs.map(({ half }, index) => {
      const second = secondHalf[index];
      return `${half.home > 0 && half.away > 0 ? "Evet" : "Hayır"}/${second.home > 0 && second.away > 0 ? "Evet" : "Hayır"}`;
    });
    const markets = [
      market("Maç Sonucu", fullTime.map(score => resultCode(score.home, score.away)), fullTime.length),
      market("İlk Yarı Sonucu", halfTime.map(score => resultCode(score.home, score.away)), halfTime.length),
      market("2.5 Alt/Üst", fullTime.map(score => score.home + score.away >= 3 ? "Üst" : "Alt"), fullTime.length),
      market("Toplam Gol", fullTime.map(score => {
        const total = score.home + score.away;
        return total <= 1 ? "0-1" : total <= 3 ? "2-3" : total <= 5 ? "4-5" : "6+";
      }), fullTime.length),
      market("İlk Yarı / Maç Sonucu", htft, htft.length),
      market("Maç Skoru", fullScores, fullScores.length, 20),
      market("İlk Yarı Skoru", halfScores, halfScores.length, 20),
      market("Karşılıklı Gol", fullTime.map(score => score.home > 0 && score.away > 0 ? "Var" : "Yok"), fullTime.length),
      market("1. Yarı / 2. Yarı Karşılıklı Gol", firstSecondBtts, firstSecondBtts.length)
    ];
    return res.status(200).json({
      league: { id: leagueId, name: String(data?.name || details?.name || "Lig"), country: String(data?.ccode || details?.country || "") },
      season: activeSeason, seasons, selectedRound,
      rounds, totalFixtures: rawFixtures.length, matches: selectedFixtures.length,
      verifiedHalfTimeMatches: halfTime.length, markets
    });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "FotMob lig istatistikleri alınamadı." });
  }
}
