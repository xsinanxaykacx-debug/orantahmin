import { parseIddaaMarkets } from "../scripts/iddaa/transform.ts";
import {
  fetchIddaaFeed,
  fetchIddaaUpcomingFixtures,
  IDDAA_SEASON_ID,
  IDDAA_UNIQUE_TOURNAMENT_ID
} from "../lib/iddaaGismo.ts";

type Req = { method?: string; query: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): Res };

const HEADERS = {
  Accept: "application/json, text/plain, */*",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
  Origin: "https://www.iddaa.com",
  Referer: "https://www.iddaa.com/"
};
const SPORTSBOOK = "https://sportsbookv2.iddaa.com/sportsbook";

function queryValue(input: string | string[] | undefined): string {
  return Array.isArray(input) ? input[0] || "" : input || "";
}

async function optionalFeed(feed: string, params: string | number) {
  try { return { data: await fetchIddaaFeed(feed, params), error: null }; }
  catch (error) { return { data: null, error: error instanceof Error ? error.message : String(error) }; }
}

async function getJson(url: string): Promise<any> {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`iddaa HTTP ${response.status}`);
  const payload = await response.json();
  if (payload?.isSuccess !== true) throw new Error("iddaa başarısız yanıt döndürdü.");
  return payload;
}

type IdDaaPlayer = { n?: string; j?: number | string; p?: string; r?: boolean; ps?: string; px?: string | number; py?: string | number };
type IdDaaTeam = { n?: string; lu?: string; f?: string; p?: IdDaaPlayer[] };

function normalizeTeam(team: IdDaaTeam | undefined) {
  const players = Array.isArray(team?.p) ? team.p : [];
  const mapPlayer = (player: IdDaaPlayer) => ({
    name: player.n || "",
    shirtNumber: player.j ?? null,
    role: player.p || null,
    pitchPosition: player.ps || null,
    x: player.px == null ? null : Number(player.px),
    y: player.py == null ? null : Number(player.py)
  });
  return {
    name: team?.n || null,
    logo: team?.lu || null,
    formation: team?.f || null,
    starters: players.filter(player => player.r === false).map(mapPlayer),
    substitutes: players.filter(player => player.r === true).map(mapPlayer)
  };
}

async function handleSuperlig(res: Res) {
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
  const feeds = [
    ["standings", "season_dynamictable", IDDAA_SEASON_ID],
    ["form", "stats_formtable", IDDAA_SEASON_ID],
    ["results", "livescore_season_lastx", IDDAA_SEASON_ID],
    ["goals", "stats_season_topgoals", IDDAA_SEASON_ID],
    ["assists", "stats_season_topassists", IDDAA_SEASON_ID],
    ["cards", "stats_season_topcards", IDDAA_SEASON_ID],
    ["teams", "uniquetournament_teams", IDDAA_UNIQUE_TOURNAMENT_ID],
    ["meta", "stats_season_meta", IDDAA_SEASON_ID]
  ] as const;
  try {
    const values = await Promise.all(feeds.map(async ([key, feed, params]) => [key, await optionalFeed(feed, params)] as const));
    const fixtureResult = await (async () => {
      try { return { data: await fetchIddaaUpcomingFixtures(), error: null }; }
      catch (error) { return { data: null, error: error instanceof Error ? error.message : String(error) }; }
    })();
    const data = Object.fromEntries(values.map(([key, value]) => [key, value.data]));
    data.fixtures = fixtureResult.data;
    const errors = Object.fromEntries(values.filter(([, value]) => value.error).map(([key, value]) => [key, value.error]));
    if (fixtureResult.error) errors.fixtures = fixtureResult.error;
    if (!data.standings) return res.status(502).json({
      source: "iddaa.com / Sportradar",
      error: errors.standings || "Süper Lig puan tablosu alınamadı.",
      feedErrors: errors
    });
    return res.status(200).json({
      source: "iddaa.com",
      league: { id: IDDAA_UNIQUE_TOURNAMENT_ID, name: "Türkiye Süper Lig", country: "Türkiye" },
      season: { id: IDDAA_SEASON_ID, name: "Süper Lig 26/27" },
      fetchedAt: new Date().toISOString(),
      data,
      feedErrors: errors
    });
  } catch (error) {
    return res.status(502).json({ source: "iddaa.com", error: error instanceof Error ? error.message : "Süper Lig verileri alınamadı." });
  }
}

async function handleTeam(req: Req, res: Res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  const teamUid = queryValue(req.query.teamUid);
  if (!/^\d{1,12}$/.test(teamUid)) return res.status(400).json({ error: "Geçersiz takım kimliği." });
  try {
    const [squad, facts, injuries] = await Promise.all([
      fetchIddaaFeed("stats_team_squad", teamUid),
      fetchIddaaFeed("stats_teamplayer_facts", `${teamUid}/${IDDAA_SEASON_ID}`),
      fetchIddaaFeed("stats_season_injuries", IDDAA_SEASON_ID)
    ]);
    const injuryRows = Array.isArray(injuries) ? injuries : [];
    const selectedInjuries = injuryRows.filter((item: any) =>
      String(item?.team?._id ?? item?.team?.id ?? item?.teamUid ?? "") === teamUid
    );
    return res.status(200).json({
      source: "iddaa.com", teamUid, seasonId: IDDAA_SEASON_ID,
      team: squad?.team || null,
      players: Array.isArray(squad?.players) ? squad.players : [],
      squadInfo: squad?.squadinfo || null, roles: squad?.roles || null,
      managers: squad?.managers || [], facts: facts || {}, injuries: selectedInjuries,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(502).json({ source: "iddaa.com", teamUid, error: error instanceof Error ? error.message : "Takım kadrosu alınamadı." });
  }
}

async function handleLineups(req: Req, res: Res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  const eventId = queryValue(req.query.eventId);
  if (!/^\d{1,12}$/.test(eventId)) return res.status(400).json({ source: "iddaa.com", error: "Geçerli iddaa maç numarası gerekli." });
  try {
    const response = await fetch(`https://statisticsv2.iddaa.com/statistics/soccer/lineup/${encodeURIComponent(eventId)}`, {
      headers: HEADERS, signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) return res.status(502).json({ source: "iddaa.com", eventId, error: `iddaa kadro servisi HTTP ${response.status}` });
    const payload = await response.json() as {
      isSuccess?: boolean;
      data?: { ei?: number; h?: IdDaaTeam; a?: IdDaaTeam; src?: string };
    };
    if (payload.isSuccess !== true || !payload.data) return res.status(502).json({ source: "iddaa.com", eventId, error: "iddaa kadro verisi geçerli değil." });
    const home = normalizeTeam(payload.data.h);
    const away = normalizeTeam(payload.data.a);
    const hasLineup = home.starters.length > 0 || away.starters.length > 0 || home.substitutes.length > 0 || away.substitutes.length > 0;
    return res.status(200).json({
      source: "iddaa.com", eventId: String(payload.data.ei ?? eventId),
      lineupType: "Muhtemel 11", lineupSource: payload.data.src || null, hasLineup,
      home, away, fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(502).json({ source: "iddaa.com", eventId, error: error instanceof Error ? error.message : "iddaa kadro verisi alınamadı." });
  }
}

async function handleMarkets(req: Req, res: Res) {
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=180");
  const eventId = queryValue(req.query.eventId).trim();
  if (!/^\d+$/.test(eventId)) return res.status(400).json({ source: "iddaa.com", error: "Geçerli eventId gerekli." });
  try {
    const [detail, configPayload] = await Promise.all([
      getJson(`${SPORTSBOOK}/event/${encodeURIComponent(eventId)}`),
      getJson(`${SPORTSBOOK}/get_market_config?st=1`)
    ]);
    const event = detail?.data;
    if (!event || !Array.isArray(event.m)) throw new Error("iddaa maç detayında tam market dizisi bulunamadı.");
    const marketConfig = configPayload?.data?.m && typeof configPayload.data.m === "object" ? configPayload.data.m : {};
    const markets = parseIddaaMarkets(event, marketConfig);
    const outcomeCount = markets.reduce((sum, market) => sum + market.outcomes.length, 0);
    return res.status(200).json({
      source: "iddaa.com", eventId, available: markets.length > 0,
      completeness: "event-detail", fetchedAt: new Date().toISOString(),
      marketCount: markets.length, outcomeCount, markets
    });
  } catch (error) {
    return res.status(502).json({ source: "iddaa.com", eventId, error: error instanceof Error ? error.message : "iddaa marketleri okunamadı." });
  }
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  switch (queryValue(req.query.resource) || "superlig") {
    case "superlig": return handleSuperlig(res);
    case "team": return handleTeam(req, res);
    case "lineups": return handleLineups(req, res);
    case "markets": return handleMarkets(req, res);
    default: return res.status(400).json({ error: "Geçersiz iddaa kaynak türü." });
  }
}
