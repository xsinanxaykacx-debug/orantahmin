export const config = { maxDuration: 60 };

type Req = { method?: string; query: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): Res };

type Fixture = {
  id?: string | number;
  home?: { id?: string | number; name?: string; score?: number | string };
  away?: { id?: string | number; name?: string; score?: number | string };
  status?: { finished?: boolean; cancelled?: boolean; awarded?: boolean; scoreStr?: string };
};
type Outcome = { home: number; away: number; homeId: number; awayId: number; homeName: string; awayName: string };
type MetricValue = { value: number | null; label: string; detail: string };
type Stats = Record<string, MetricValue>;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36";
const jsonHeaders = { Accept: "application/json", "User-Agent": UA, Referer: "https://www.fotmob.com/" };

function parseScore(fixture: Fixture): { home: number; away: number } | null {
  const home = fixture.home?.score;
  const away = fixture.away?.score;
  if (home !== undefined && away !== undefined && Number.isFinite(Number(home)) && Number.isFinite(Number(away))) {
    return { home: Number(home), away: Number(away) };
  }
  const match = String(fixture.status?.scoreStr || "").match(/(\d+)\s*[-–:]\s*(\d+)/);
  return match ? { home: Number(match[1]), away: Number(match[2]) } : null;
}
function percent(count: number, total: number) {
  return total ? count / total * 100 : null;
}
function mode(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;
}
function makeMetrics(matches: Outcome[], xg?: { value: number; matches: number }, teamScope = false): Stats {
  const count = matches.length;
  const goals = matches.map(match => match.home + match.away);
  const totalGoals = goals.reduce((sum, value) => sum + value, 0);
  const homeWins = matches.filter(match => match.home > match.away).length;
  const draws = matches.filter(match => match.home === match.away).length;
  const awayWins = matches.filter(match => match.home < match.away).length;
  const over25 = goals.filter(value => value >= 3).length;
  const btts = matches.filter(match => match.home > 0 && match.away > 0).length;
  const scoreMode = mode(matches.map(match => `${match.home}-${match.away}`));
  const unavailable = (label: string): MetricValue => ({ value: null, label, detail: "Bu ölçüm için maç bazlı devre verisi gerekiyor." });
  return {
    xg: xg && xg.matches > 0
      ? { value: xg.value / xg.matches, label: teamScope ? "xG / takım-maç" : "xG / maç", detail: `${xg.matches} takım-maçından hesaplandı` }
      : unavailable("xG"),
    "total-goals": count
      ? { value: totalGoals / count, label: "Gol / maç", detail: `${totalGoals} toplam gol · ${count} maç` }
      : { value: null, label: "Gol / maç", detail: "Tamamlanmış maç verisi yok." },
    "match-result": count
      ? { value: Math.max(homeWins, draws, awayWins) / count * 100, label: teamScope
        ? homeWins >= draws && homeWins >= awayWins ? "Galibiyet" : draws >= awayWins ? "Beraberlik" : "Mağlubiyet"
        : homeWins >= draws && homeWins >= awayWins ? "Ev sahibi" : draws >= awayWins ? "Beraberlik" : "Deplasman",
        detail: teamScope
          ? `Galibiyet: ${percent(homeWins, count)!.toFixed(1)}% · Beraberlik: ${percent(draws, count)!.toFixed(1)}% · Mağlubiyet: ${percent(awayWins, count)!.toFixed(1)}%`
          : `1: ${percent(homeWins, count)!.toFixed(1)}% · X: ${percent(draws, count)!.toFixed(1)}% · 2: ${percent(awayWins, count)!.toFixed(1)}%` }
      : { value: null, label: "Maç sonucu", detail: "Tamamlanmış maç verisi yok." },
    "goals-25": count
      ? { value: percent(over25, count), label: "Üst 2,5", detail: `Alt 2,5: ${percent(count - over25, count)!.toFixed(1)}% · Üst 2,5: ${percent(over25, count)!.toFixed(1)}%` }
      : { value: null, label: "2,5 Alt/Üst", detail: "Tamamlanmış maç verisi yok." },
    btts: count
      ? { value: percent(btts, count), label: "KG Var", detail: `Var: ${percent(btts, count)!.toFixed(1)}% · Yok: ${percent(count - btts, count)!.toFixed(1)}%` }
      : { value: null, label: "Karşılıklı gol", detail: "Tamamlanmış maç verisi yok." },
    "correct-score": scoreMode
      ? { value: percent(scoreMode[1], count), label: scoreMode[0], detail: `${scoreMode[1]} maçta tekrarlandı` }
      : { value: null, label: "En sık skor", detail: "Tamamlanmış maç verisi yok." },
    under: count
      ? { value: percent(count - over25, count), label: "Alt 2,5", detail: `${count - over25} / ${count} maç` }
      : { value: null, label: "Alt 2,5", detail: "Tamamlanmış maç verisi yok." },
    over: count
      ? { value: percent(over25, count), label: "Üst 2,5", detail: `${over25} / ${count} maç` }
      : { value: null, label: "Üst 2,5", detail: "Tamamlanmış maç verisi yok." },
    "ht-ft": unavailable("İY / MS"),
    "half-time": unavailable("İlk yarı"),
    "first-second-btts": unavailable("1Y / 2Y KG"),
    "half-time-score": unavailable("İY skoru")
  };
}
function toOutcome(fixture: Fixture): Outcome | null {
  if (fixture.status?.finished !== true || fixture.status?.cancelled) return null;
  const score = parseScore(fixture);
  const homeId = Number(fixture.home?.id);
  const awayId = Number(fixture.away?.id);
  if (!score || !homeId || !awayId) return null;
  return {
    ...score, homeId, awayId,
    homeName: String(fixture.home?.name || "Takım"),
    awayName: String(fixture.away?.name || "Takım")
  };
}
async function getJson(url: string) {
  const response = await fetch(url, { headers: jsonHeaders, signal: AbortSignal.timeout(12000) });
  if (!response.ok || !(response.headers.get("content-type") || "").includes("json")) {
    throw new Error(`FotMob HTTP ${response.status}`);
  }
  return response.json();
}
async function mapLimit<T, R>(items: T[], limit: number, callback: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try { output[index] = await callback(items[index]); }
      catch { output[index] = null as R; }
    }
  });
  await Promise.all(workers);
  return output;
}
export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const read = (key: string) => {
    const value = req.query[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const offset = Math.max(0, Number(read("offset") || 0));
  const limit = Math.max(1, Math.min(20, Number(read("limit") || 20)));
  const season = read("season") || "current";
  if (!Number.isInteger(offset) || !Number.isInteger(limit)) return res.status(400).json({ error: "Geçersiz sayfalama parametresi." });
  if (season !== "current") return res.status(400).json({ error: "Tüm sezonlar taraması henüz etkin değil. Bu sürüm seçili güncel sezonu tarar." });
  try {
    const catalog = await getJson("https://www.fotmob.com/api/data/allLeagues?locale=en");
    const directory = new Map<number, { id: number; name: string; country: string | null }>();
    const add = (item: any, country: string | null = null) => {
      const id = Number(item?.id);
      if (id && item?.name) directory.set(id, { id, name: String(item.name), country: item.ccode || country || null });
    };
    for (const item of catalog?.popular || []) add(item);
    const groups = Array.isArray(catalog?.international) ? catalog.international : catalog?.international ? [catalog.international] : [];
    for (const group of groups) {
      const nested = Array.isArray(group?.leagues) ? group.leagues : group?.id ? [group] : [];
      for (const item of nested) add(item, "Uluslararası");
    }
    for (const country of catalog?.countries || []) for (const item of country?.leagues || []) add(item, country?.ccode || country?.name || null);
    const all = [...directory.values()].sort((a, b) => String(a.country || "").localeCompare(String(b.country || ""), "tr") || a.name.localeCompare(b.name, "tr"));
    const page = all.slice(offset, offset + limit);
    const processed = await mapLimit(page, 5, async league => {
      const data = await getJson(`https://www.fotmob.com/api/data/leagues?id=${league.id}`);
      const selectedSeason = String(data?.details?.selectedSeason || "");
      const fixtureRows: Outcome[] = (Array.isArray(data?.fixtures?.allMatches) ? data.fixtures.allMatches : [])
        .map(toOutcome).filter(Boolean) as Outcome[];
      const teamMatches = new Map<number, { name: string; matches: Outcome[] }>();
      for (const match of fixtureRows) {
        const home = teamMatches.get(match.homeId) || { name: match.homeName, matches: [] };
        home.matches.push({ ...match, away: match.away, home: match.home });
        teamMatches.set(match.homeId, home);
        const away = teamMatches.get(match.awayId) || { name: match.awayName, matches: [] };
        away.matches.push({ ...match, home: match.away, away: match.home });
        teamMatches.set(match.awayId, away);
      }
      const xgEntry = (data?.stats?.teams || []).find((item: any) => item?.participant?.stat?.name === "expected_goals_team");
      let xgRows: any[] = [];
      if (xgEntry?.fetchAllUrl) {
        try {
          const xgUrl = new URL(String(xgEntry.fetchAllUrl), "https://data.fotmob.com/").toString();
          const xgData = await getJson(xgUrl);
          xgRows = Array.isArray(xgData?.TopLists?.[0]?.StatList) ? xgData.TopLists[0].StatList : [];
        } catch {
          // xG may be unavailable for a competition; keep its verified score-based metrics.
          xgRows = [];
        }
      }
      const xgByTeam = new Map<number, { value: number; matches: number }>();
      for (const row of xgRows) {
        const id = Number(row?.TeamId);
        const value = Number(row?.StatValue);
        const matches = Number(row?.MatchesPlayed);
        if (id && Number.isFinite(value) && matches > 0) xgByTeam.set(id, { value, matches });
      }
      const teamRows = [...teamMatches.entries()].map(([id, item]) => {
        const xg = xgByTeam.get(id);
        return {
          id, name: item.name, leagueId: league.id, leagueName: league.name, country: league.country,
          matches: item.matches.length,
          metrics: makeMetrics(item.matches, xg, true)
        };
      });
      // FotMob's xG leaderboard also includes teams with few or no fixture rows in allMatches.
      for (const [id, xg] of xgByTeam) {
        if (teamRows.some(row => row.id === id)) continue;
        const statRow = xgRows.find((row: any) => Number(row?.TeamId) === id);
        teamRows.push({
          id, name: String(statRow?.ParticipantName || "Takım"), leagueId: league.id, leagueName: league.name, country: league.country,
          matches: xg.matches, metrics: makeMetrics([], xg, true)
        });
      }
      const xgValues = [...xgByTeam.values()];
      const xgTotal = xgValues.reduce((sum, item) => sum + item.value, 0);
      const xgMatches = xgValues.reduce((sum, item) => sum + item.matches, 0);
      const leagueXg = xgMatches > 0 ? { value: xgTotal * 2, matches: xgMatches } : undefined;
      const metrics = makeMetrics(fixtureRows, leagueXg);
      return {
        league: { id: league.id, name: league.name, country: league.country, matches: fixtureRows.length, season: selectedSeason, metrics },
        teams: teamRows,
        matchCount: fixtureRows.length
      };
    });
    const valid = processed.filter(Boolean) as Array<{ league: any; teams: any[]; matchCount: number }>;
    return res.status(200).json({
      source: "FotMob league season fixtures + team expected-goals leaderboard",
      season: "current",
      totalLeagues: all.length,
      offset, limit,
      scannedLeagues: valid.length,
      scannedMatches: valid.reduce((sum, item) => sum + item.matchCount, 0),
      leagues: valid.map(item => item.league),
      teams: valid.flatMap(item => item.teams)
    });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "FotMob istatistikleri alınamadı." });
  }
}
