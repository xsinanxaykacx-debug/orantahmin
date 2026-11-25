type Req = { method?: string; query: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): Res };
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36";
export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
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
    // FotMob's canonical season fixture list is fixtures.allMatches. Other
    // collections can be partial (or contain only a subset of finished games).
    const fallbackFixtureLists = [
      data?.fixtures?.results,
      data?.fixtures?.finished,
      data?.fixtures?.pastMatches,
      data?.fixtures?.recentMatches
    ].filter((items: any) => Array.isArray(items));
    const sourceFixtures = allFixtures.length ? allFixtures : fallbackFixtureLists.flat();
    const resultFixtures = sourceFixtures
      .filter((item: any) => item?.status?.finished === true && !item?.status?.cancelled)
      .sort((a: any, b: any) => String(a?.status?.utcTime || "").localeCompare(String(b?.status?.utcTime || "")));
    const parseGoals = (value: unknown) => {
      if (typeof value !== "string") return null;
      const match = value.match(/(\d+)\s*[-–:]\s*(\d+)/);
      return match ? { for: Number(match[1]), against: Number(match[2]) } : null;
    };
    const formByTeam = new Map<number, Array<{ result: "W" | "D" | "L"; score: string; date: string }>>();
    for (const match of resultFixtures) {
      if (match?.status?.finished !== true || match?.status?.cancelled) continue;
      const homeId = Number(match?.home?.id || match?.homeTeam?.id);
      const awayId = Number(match?.away?.id || match?.awayTeam?.id);
      const scoreText = match?.status?.scoreStr || match?.scoreStr || "";
      const parsed = parseGoals(scoreText);
      const homeScore = match?.home?.score;
      const awayScore = match?.away?.score;
      const homeGoals = homeScore !== null && homeScore !== undefined && homeScore !== "" && Number.isFinite(Number(homeScore)) ? Number(homeScore) : parsed?.for;
      const awayGoals = awayScore !== null && awayScore !== undefined && awayScore !== "" && Number.isFinite(Number(awayScore)) ? Number(awayScore) : parsed?.against;
      if (!homeId || !awayId || homeGoals === undefined || homeGoals === null || awayGoals === undefined || awayGoals === null) continue;
      const date = String(match?.status?.utcTime || match?.status?.utcDate || "");
      const addForm = (teamId: number, scored: number, conceded: number) => {
        const form = formByTeam.get(teamId) || [];
        form.push({ result: scored > conceded ? "W" : scored < conceded ? "L" : "D", score: `${scored}-${conceded}`, date });
        formByTeam.set(teamId, form);
      };
      addForm(homeId, homeGoals, awayGoals);
      addForm(awayId, awayGoals, homeGoals);
    }
    for (const form of formByTeam.values()) form.sort((a, b) => a.date.localeCompare(b.date));
    const tableGroups = Array.isArray(data?.table) ? data.table.map((group: any) => ({
      name: group?.data?.tableName || group?.data?.leagueName || group?.data?.ccode || data?.details?.name || "Puan durumu",
      rows: (group?.data?.table?.all || group?.table?.all || []).map((row: any) => {
        const goals = parseGoals(row?.scoresStr || row?.scores || row?.goalStats);
        const teamId = Number(row?.id);
        const recentForm = formByTeam.get(teamId) || [];
        return {
          ...row,
          goalsFor: goals?.for ?? null,
          goalsAgainst: goals?.against ?? null,
          recentForm: recentForm.slice(-5)
        };
      })
    })).filter((group: any) => group.rows.length) : [];
    const upcoming = allFixtures.filter((match: any) => !match?.status?.finished && !match?.status?.cancelled)
      .sort((a: any, b: any) => String(a?.status?.utcTime || "").localeCompare(String(b?.status?.utcTime || "")));
    const recent = allFixtures.filter((match: any) => match?.status?.finished)
      .sort((a: any, b: any) => String(b?.status?.utcTime || "").localeCompare(String(a?.status?.utcTime || "")));
    const fixtureList = (upcoming.length ? upcoming : recent).slice(0, 12);
    const topScorer = null;
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
      stats: { players: [] }
    });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Lig verisi alınamadı." });
  }
}
