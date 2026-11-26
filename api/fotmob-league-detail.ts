type Req = { method?: string; query: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): Res };
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36";
export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const raw = req.query.leagueId;
  const leagueId = Array.isArray(raw) ? raw[0] : raw;
  const rawMatchId = req.query.matchId;
  const matchId = Array.isArray(rawMatchId) ? rawMatchId[0] : rawMatchId;
  if (!leagueId || !/^\d{1,12}$/.test(leagueId)) return res.status(400).json({ error: "Geçersiz lig kimliği." });
  if (matchId && !/^\d{5,12}$/.test(matchId)) return res.status(400).json({ error: "Geçersiz FotMob maç kimliği." });
  try {
    let dataLeagueId = Number(leagueId);
    if (matchId) {
      const matchDetailsResponse = await fetch(`https://www.fotmob.com/api/data/matchDetails?matchId=${encodeURIComponent(matchId)}`, {
        headers: { Accept: "application/json", "User-Agent": UA, Referer: "https://www.fotmob.com/" },
        signal: AbortSignal.timeout(15000)
      });
      if (matchDetailsResponse.ok && (matchDetailsResponse.headers.get("content-type") || "").includes("json")) {
        const matchDetails = await matchDetailsResponse.json();
        dataLeagueId = Number(matchDetails?.general?.parentLeagueId || matchDetails?.general?.leagueId || dataLeagueId);
      }
    }
    const upstream = await fetch(`https://www.fotmob.com/api/data/leagues?id=${encodeURIComponent(String(dataLeagueId))}`, {
      headers: { Accept: "application/json", "User-Agent": UA, Referer: "https://www.fotmob.com/" },
      signal: AbortSignal.timeout(18000)
    });
    const contentType = upstream.headers.get("content-type") || "";
    if (!upstream.ok || !contentType.includes("json")) return res.status(502).json({ error: `FotMob lig verisi alınamadı (HTTP ${upstream.status}).` });
    const data = await upstream.json();
    const allFixtures = Array.isArray(data?.fixtures?.allMatches) ? data.fixtures.allMatches : [];
    const tableGroups = Array.isArray(data?.table) ? data.table.map((group: any) => ({
      name: group?.data?.tableName || group?.data?.leagueName || group?.data?.ccode || data?.details?.name || "Puan durumu",
      rows: (group?.data?.table?.all || group?.table?.all || []).map((row: any) => {
        const teamId = Number(row?.id) || null;
        const teamName = String(row?.name || row?.shortName || "");
        const recentForm = allFixtures
          .filter((match: any) => {
            if (!match?.status?.finished) return false;
            const homeId = Number(match?.home?.id || match?.homeTeam?.id) || null;
            const awayId = Number(match?.away?.id || match?.awayTeam?.id) || null;
            const homeName = String(match?.home?.name || match?.homeTeam?.name || "").toLocaleLowerCase();
            const awayName = String(match?.away?.name || match?.awayTeam?.name || "").toLocaleLowerCase();
            return teamId ? homeId === teamId || awayId === teamId
              : teamName.toLocaleLowerCase() === homeName || teamName.toLocaleLowerCase() === awayName;
          })
          .map((match: any) => {
            const scoreParts = String(match?.status?.scoreStr || "").match(/(\d+)\s*[-–:]\s*(\d+)/);
            const homeScore = Number.isFinite(Number(match?.home?.score)) ? Number(match.home.score) : scoreParts ? Number(scoreParts[1]) : null;
            const awayScore = Number.isFinite(Number(match?.away?.score)) ? Number(match.away.score) : scoreParts ? Number(scoreParts[2]) : null;
            if (homeScore === null || awayScore === null) return null;
            const homeId = Number(match?.home?.id || match?.homeTeam?.id) || null;
            const isHome = teamId ? homeId === teamId
              : String(match?.home?.name || match?.homeTeam?.name || "").toLocaleLowerCase() === teamName.toLocaleLowerCase();
            const scored = isHome ? homeScore : awayScore;
            const conceded = isHome ? awayScore : homeScore;
            return { date: String(match?.status?.utcTime || ""), result: scored > conceded ? "G" : scored < conceded ? "Y" : "B" };
          })
          .filter(Boolean)
          .sort((a: any, b: any) => b.date.localeCompare(a.date))
          .slice(0, 5)
          .map((item: any) => item.result)
          .reverse();
        return { ...row, recentForm };
      })
    })).filter((group: any) => group.rows.length) : [];
    const upcoming = allFixtures.filter((match: any) => !match?.status?.finished && !match?.status?.cancelled)
      .sort((a: any, b: any) => String(a?.status?.utcTime || "").localeCompare(String(b?.status?.utcTime || "")));
    const recent = allFixtures.filter((match: any) => match?.status?.finished)
      .sort((a: any, b: any) => String(b?.status?.utcTime || "").localeCompare(String(a?.status?.utcTime || "")));
    const fixtureList = (upcoming.length ? upcoming : recent).slice(0, 12);
    const players = Array.isArray(data?.stats?.players) ? data.stats.players : [];
    const playerLeaders = players.filter((item: any) =>
      /top scorer|goals|assists|assist|rating|average rating|puan/i.test(String(item?.header || item?.name || ""))
    ).map((item: any) => ({
      header: item.header || item.name,
      topThree: (item.topThree || item.top || []).slice(0, 3)
    }));
    const seasons = Array.isArray(data?.allAvailableSeasons) ? data.allAvailableSeasons :
      Array.isArray(data?.seasons) ? data.seasons.map((item: any) => typeof item === "string" ? item : item?.seasonName || item?.name).filter(Boolean) : [];
    return res.status(200).json({
      source: "FotMob",
      leagueId: Number(leagueId),
      dataLeagueId,
      details: data?.details ? { id: data.details.id, name: data.details.name, selectedSeason: data.details.selectedSeason, country: data.details.country, leagueColor: data.details.leagueColor } : null,
      seasons,
      tableGroups,
      fixtures: fixtureList,
      stats: { players: playerLeaders }
    });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Lig verisi alınamadı." });
  }
}
