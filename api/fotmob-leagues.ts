type Req = { method?: string; query: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): Res };
type BulletinMatch = { matchId: string | number; homeName?: string | null; awayName?: string | null; date: string; time?: string; fields?: { leagueCode?: string | null } };
type FotMobFixture = { id: number; home?: { name?: string; score?: number }; away?: { name?: string; score?: number }; status?: any; time?: string; leagueId: number; leagueName: string; country: string | null };

const headers = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36",
  Referer: "https://www.fotmob.com/"
};
const norm = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
function similarity(a: string, b: string) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.startsWith(y) || y.startsWith(x)) return Math.min(x.length, y.length) / Math.max(x.length, y.length) * 0.18 + 0.78;
  const aa = x.split(" "), bb = y.split(" ");
  const token = aa.filter(token => bb.includes(token)).length / Math.max(aa.length, bb.length);
  const previous = Array.from({ length: y.length + 1 }, (_, index) => index);
  for (let i = 1; i <= x.length; i++) {
    const current = [i];
    for (let j = 1; j <= y.length; j++) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    for (let j = 0; j <= y.length; j++) previous[j] = current[j];
  }
  const edit = 1 - previous[y.length] / Math.max(x.length, y.length);
  return Math.max(edit, token * 0.88);
}
function shiftDate(date: string, days: number) {
  const value = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)) + days));
  return value.toISOString().slice(0, 10).replace(/-/g, "");
}
function dateKey(value: string) {
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return match ? `${match[3]}${match[2]}${match[1]}` : null;
}
async function jsonFetch(url: string) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("json")) throw new Error(`FotMob yanıtı alınamadı (HTTP ${response.status}).`);
  return response.json();
}
function ageMarkers(value: string) {
  return (value.match(/\bU(?:17|18|19|20|21|23)\b/gi) || []).map(item => item.toUpperCase());
}
export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=1800");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const [allLeaguesPayload, bulletinResponse] = await Promise.all([
      jsonFetch("https://www.fotmob.com/api/data/allLeagues?locale=en"),
      fetch("https://raw.githubusercontent.com/xsinanxaykacx-debug/orantahmin/main/public/data/mackolik-bulletin.json", {
        headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000)
      })
    ]);
    if (!bulletinResponse.ok) throw new Error(`Maç bülteni alınamadı (HTTP ${bulletinResponse.status}).`);
    const bulletin = JSON.parse(await bulletinResponse.text());
    const rows: BulletinMatch[] = (bulletin.matches || []).filter((item: BulletinMatch) => item.homeName && item.awayName);
    const baseDates = [...new Set(rows.map(row => dateKey(row.date)).filter(Boolean))] as string[];
    const dates = [...new Set(baseDates.flatMap(date => [-1, 0, 1].map(offset => shiftDate(date, offset))))];
    const dailyPayloads = await Promise.all(dates.map(date => jsonFetch(`https://www.fotmob.com/api/data/matches?date=${date}`)));
    const fixtures: FotMobFixture[] = [];
    for (const payload of dailyPayloads) {
      for (const league of payload?.leagues || []) {
        const leagueId = Number(league.id || league.primaryId);
        if (!leagueId) continue;
        for (const match of league.matches || []) fixtures.push({
          id: Number(match.id), home: match.home, away: match.away, status: match.status,
          time: match.time, leagueId, leagueName: league.name || "Lig",
          country: league.ccode || league.ccode3 || null
        });
      }
    }
    const uniqueFixtures = [...new Map(fixtures.filter(item => item.id).map(item => [item.id, item])).values()];
    const usedFixtureIds = new Set<number>();
    const matchedLeagueMap = new Map<number, any>();
    let matchedCount = 0;
    for (const row of rows) {
      const sourceHome = row.homeName || "";
      const sourceAway = row.awayName || "";
      const sourceNames = `${sourceHome} ${sourceAway}`;
      const sourceAges = [...ageMarkers(sourceHome), ...ageMarkers(sourceAway)];
      const youth = row.fields?.leagueCode === "UEGL" || /\\bU(?:19|21|23)\\b/i.test(sourceNames);
      const ranked = uniqueFixtures.filter(fixture => {
        if (usedFixtureIds.has(fixture.id)) return false;
        if (youth && !/youth|U19|U21|U23/i.test(fixture.leagueName)) return false;
        const candidateAges = [...ageMarkers(fixture.home?.name || ""), ...ageMarkers(fixture.away?.name || "")];
        if (sourceAges.length && sourceAges.some(age => !candidateAges.includes(age))) return false;
        return true;
      }).map(fixture => {
        const homeScore = similarity(sourceHome, fixture.home?.name || "");
        const awayScore = similarity(sourceAway, fixture.away?.name || "");
        return { fixture, homeScore, awayScore, score: (homeScore + awayScore) / 2 };
      }).filter(item => item.homeScore >= 0.58 && item.awayScore >= 0.58).sort((a, b) => b.score - a.score);
      const best = ranked[0], second = ranked[1];
      if (!best || best.score < 0.76 || (second && best.score - second.score < 0.055)) continue;
      const fixture = best.fixture;
      usedFixtureIds.add(fixture.id);
      matchedCount++;
      const match = {
        mackolikMatchId: String(row.matchId), fotmobMatchId: fixture.id, date: row.date,
        time: row.time || fixture.time || "", home: fixture.home?.name || sourceHome,
        away: fixture.away?.name || sourceAway, homeScore: fixture.home?.score ?? null,
        awayScore: fixture.away?.score ?? null, status: fixture.status?.reason?.short || fixture.status?.utcTime || null,
        started: !!fixture.status?.started, finished: !!fixture.status?.finished
      };
      const existing = matchedLeagueMap.get(fixture.leagueId);
      if (existing) existing.matches.push(match);
      else matchedLeagueMap.set(fixture.leagueId, {
        id: fixture.leagueId, name: fixture.leagueName, country: fixture.country,
        logo: `https://images.fotmob.com/image_resources/logo/leaguelogo/${fixture.leagueId}.png`,
        matches: [match]
      });
    }

    // FotMob'un ana lig kataloğu: popüler, uluslararası ve ülke bazlı tüm organizasyonlar.
    const directory = new Map<number, any>();
    const addLeague = (item: any, country: string | null = null) => {
      const id = Number(item?.id);
      if (!id || !item?.name) return;
      const previous = directory.get(id);
      directory.set(id, {
        id, name: item.name, country: item.ccode || country || previous?.country || null,
        logo: `https://images.fotmob.com/image_resources/logo/leaguelogo/${id}.png`,
        matches: [], matchCount: 0
      });
    };
    for (const item of allLeaguesPayload?.popular || []) addLeague(item);
    const international = allLeaguesPayload?.international;
    const internationalLeagues = Array.isArray(international) ? international : international?.leagues || [];
    for (const item of internationalLeagues) addLeague(item, "Uluslararası");
    for (const country of allLeaguesPayload?.countries || []) {
      for (const item of country.leagues || []) addLeague(item, country.ccode || country.name || null);
    }

    // Günlük bültende bulunan ama katalogda ayrı bir aşama ID'siyle gelen ligleri de kaybetme.
    for (const [id, matched] of matchedLeagueMap) {
      const catalogLeague = directory.get(id);
      if (catalogLeague) {
        catalogLeague.matches = matched.matches;
        catalogLeague.matchCount = matched.matches.length;
        if (!catalogLeague.country) catalogLeague.country = matched.country;
      } else {
        directory.set(id, { ...matched, matchCount: matched.matches.length });
      }
    }
    const leagues = [...directory.values()].map(league => ({
      ...league,
      matches: league.matches.sort((a: any, b: any) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    })).sort((a, b) => {
      const countryCompare = String(a.country || "").localeCompare(String(b.country || ""), "tr");
      return countryCompare || a.name.localeCompare(b.name, "tr");
    });
    return res.status(200).json({
      source: "FotMob allLeagues + Mackolik daily bulletin",
      generatedAt: new Date().toISOString(),
      bulletinMatchCount: rows.length,
      matchedMatchCount: matchedCount,
      leagueCount: leagues.length,
      activeLeagueCount: leagues.filter(league => league.matchCount > 0).length,
      matchCount: matchedCount,
      leagues
    });
  } catch (error) {
    return res.status(502).json({ source: "FotMob", error: error instanceof Error ? error.message : "Lig listesi alınamadı." });
  }
}
