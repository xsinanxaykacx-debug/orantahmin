type Req = { method?: string; query: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): Res; end(): void };

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const one = (key: string) => {
    const value = req.query[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const matchId = one("matchId");
  const date = one("date") || "20261125";
  if (matchId && !/^\d{5,12}$/.test(matchId)) return res.status(400).json({ error: "Invalid FotMob matchId" });
  if (!/^\d{8}$/.test(date)) return res.status(400).json({ error: "date must be YYYYMMDD" });

  const url = matchId
    ? `https://www.fotmob.com/api/data/matchDetails?matchId=${encodeURIComponent(matchId)}`
    : `https://www.fotmob.com/api/data/matches?date=${date}`;

  try {
    const upstream = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36", Referer: "https://www.fotmob.com/" },
      signal: AbortSignal.timeout(15000)
    });
    const type = upstream.headers.get("content-type") || "";
    if (!upstream.ok || !type.includes("json")) return res.status(502).json({ source: "fotmob", upstreamStatus: upstream.status, contentType: type, error: "FotMob did not return JSON" });
    const data = await upstream.json();

    if (!matchId) {
      const matches = (data?.leagues || []).flatMap((league: any) => (league.matches || []).map((match: any) => ({
        id: match.id, league: league.name, home: match.home?.name, away: match.away?.name,
        dateTime: match.time, status: match.status
      })));
      return res.status(200).json({ source: "fotmob", date, count: matches.length, matches });
    }

    const lineup = data?.content?.lineup || null;
    const teamSummary = (team: any) => {
      if (!team) return null;
      const starters = team.starters || [];
      const bench = team.substitutes || team.subs || team.bench || [];
      return {
        name: team.name, formation: team.formation, keys: Object.keys(team),
        starterCount: starters.length, starters: starters.map((p: any) => ({ id: p.id, name: p.name, shirtNumber: p.shirtNumber, positionId: p.positionId, captain: !!p.isCaptain })),
        benchCount: bench.length, bench: bench.map((p: any) => ({ id: p.id, name: p.name, shirtNumber: p.shirtNumber, positionId: p.positionId })),
        unavailableCount: (team.unavailable || []).length
      };
    };
    return res.status(200).json({
      source: "fotmob", matchId, general: data?.general || null,
      lineupType: lineup?.lineupType || null, lineupSource: lineup?.source || null,
      homeTeamId: Number(data?.general?.homeTeam?.id) || null, awayTeamId: Number(data?.general?.awayTeam?.id) || null,
      hasLineup: !!lineup, home: teamSummary(lineup?.homeTeam), away: teamSummary(lineup?.awayTeam)
    });
  } catch (error) {
    return res.status(502).json({ source: "fotmob", error: error instanceof Error ? error.message : "FotMob request failed" });
  }
}
