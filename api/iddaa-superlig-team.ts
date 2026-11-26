import { fetchIddaaFeed, IDDAA_SEASON_ID } from "./_lib/iddaaGismo";

type Req = { method?: string; query: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): Res };

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const raw = req.query.teamUid;
  const teamUid = Array.isArray(raw) ? raw[0] : raw;
  if (!teamUid || !/^\d{1,12}$/.test(teamUid)) return res.status(400).json({ error: "Geçersiz takım kimliği." });
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
      source: "iddaa.com",
      teamUid,
      seasonId: IDDAA_SEASON_ID,
      team: squad?.team || null,
      players: Array.isArray(squad?.players) ? squad.players : [],
      squadInfo: squad?.squadinfo || null,
      roles: squad?.roles || null,
      managers: squad?.managers || [],
      facts: facts || {},
      injuries: selectedInjuries,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(502).json({
      source: "iddaa.com",
      teamUid,
      error: error instanceof Error ? error.message : "Takım kadrosu alınamadı."
    });
  }
}
