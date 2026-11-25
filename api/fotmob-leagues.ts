type Req = { method?: string; query: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): Res };

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36";
async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA, Referer: "https://www.fotmob.com/" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok || !(response.headers.get("content-type") || "").includes("json")) throw new Error(`FotMob yanıtı alınamadı (HTTP ${response.status}).`);
  return response.json();
}
function dateKey(value: string): string | null {
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return match ? `${match[3]}${match[2]}${match[1]}` : null;
}
export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=1800");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const mappingUrl = "https://raw.githubusercontent.com/xsinanxaykacx-debug/orantahmin/feature/fotmob-team-form/public/data/fotmob-event-map.json";
    const mappingResponse = await fetch(mappingUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    if (!mappingResponse.ok) throw new Error(`Eşleştirme dosyası alınamadı (HTTP ${mappingResponse.status}).`);
    const mapping = JSON.parse(await mappingResponse.text());
    const mapped = (mapping.matches || []).filter((item: any) => item.state === "matched" && item.fotmobMatchId);
    const dateKeys = [...new Set(mapped.map((item: any) => dateKey(item.date)).filter(Boolean))] as string[];
    const daily = await Promise.all(dateKeys.map(async date => ({ date, data: await fetchJson(`https://www.fotmob.com/api/data/matches?date=${date}`) })));
    const mapByFotMobId = new Map<number, any>(mapped.map((item: any) => [Number(item.fotmobMatchId), item]));
    const leagues = new Map<number, any>();
    for (const day of daily) {
      for (const league of day.data?.leagues || []) {
        const id = Number(league.id || league.primaryId);
        if (!id) continue;
        const matches = (league.matches || []).flatMap((match: any) => {
          const mappedMatch = mapByFotMobId.get(Number(match.id));
          if (!mappedMatch) return [];
          return [{
            mackolikMatchId: mappedMatch.mackolikMatchId,
            fotmobMatchId: Number(match.id),
            date: mappedMatch.date,
            time: mappedMatch.time,
            home: match.home?.name || mappedMatch.fotmobHome || mappedMatch.homeName,
            away: match.away?.name || mappedMatch.fotmobAway || mappedMatch.awayName,
            homeScore: match.home?.score ?? null,
            awayScore: match.away?.score ?? null,
            status: match.status?.reason?.short || match.status?.utcTime || null,
            started: !!match.status?.started,
            finished: !!match.status?.finished
          }];
        });
        if (!matches.length) continue;
        const existing = leagues.get(id);
        if (existing) existing.matches.push(...matches);
        else leagues.set(id, {
          id, name: league.name || mapped[0]?.league || "Lig",
          country: league.ccode || league.ccode3 || null,
          logo: `https://images.fotmob.com/image_resources/logo/leaguelogo/${id}.png`,
          matches
        });
      }
    }
    const result = [...leagues.values()].map(league => ({
      ...league,
      matches: league.matches.sort((a: any, b: any) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),
      matchCount: league.matches.length
    })).sort((a, b) => a.name.localeCompare(b.name, "tr"));
    return res.status(200).json({ source: "FotMob", generatedAt: new Date().toISOString(), leagueCount: result.length, matchCount: result.reduce((sum, league) => sum + league.matchCount, 0), leagues: result });
  } catch (error) {
    return res.status(502).json({ source: "FotMob", error: error instanceof Error ? error.message : "Lig listesi alınamadı." });
  }
}
