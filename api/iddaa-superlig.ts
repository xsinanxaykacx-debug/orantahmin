import { fetchIddaaFeed, fetchIddaaUpcomingFixtures, IDDAA_SEASON_ID, IDDAA_UNIQUE_TOURNAMENT_ID } from "../lib/iddaaGismo";

type Req = { method?: string; query: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): Res };

async function optionalFeed(feed: string, params: string | number) {
  try { return { data: await fetchIddaaFeed(feed, params), error: null }; }
  catch (error) { return { data: null, error: error instanceof Error ? error.message : String(error) }; }
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
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
    const values = await Promise.all(feeds.map(async ([key, feed, params]) => [key, await optionalFeed(feed, params)] as const));
    const fixtureResult = await (async () => { try { return { data: await fetchIddaaUpcomingFixtures(), error: null }; } catch (error) { return { data: null, error: error instanceof Error ? error.message : String(error) }; } })();
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
    return res.status(502).json({
      source: "iddaa.com",
      error: error instanceof Error ? error.message : "Süper Lig verileri alınamadı."
    });
  }
}
