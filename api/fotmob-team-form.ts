type Req = { method?: string; query: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): Res };

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36";
async function jsonFetch(url: string): Promise<any> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA, Referer: "https://www.fotmob.com/" },
    signal: AbortSignal.timeout(15000)
  });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("json")) {
    throw new Error(`FotMob yanıt vermedi (HTTP ${response.status}).`);
  }
  return response.json();
}
function firstValue(...values: unknown[]): unknown {
  return values.find(value => value !== null && value !== undefined && value !== "");
}
function parseScore(value: unknown): { scored: number; conceded: number } | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const match = String(value).match(/(\d+)\s*[-–:]\s*(\d+)/);
  return match ? { scored: Number(match[1]), conceded: Number(match[2]) } : null;
}
function normalizeResult(value: unknown, score: { scored: number; conceded: number } | null): "W" | "D" | "L" | null {
  const raw = String(value ?? "").trim().toUpperCase();
  if (["W", "WIN", "WON", "1"].includes(raw)) return "W";
  if (["D", "DRAW", "0", "X"].includes(raw)) return "D";
  if (["L", "LOSS", "LOST", "-1", "2"].includes(raw)) return "L";
  if (!score) return null;
  return score.scored > score.conceded ? "W" : score.scored < score.conceded ? "L" : "D";
}
function scoreNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return null;
}
type FormItem = { result: "W" | "D" | "L"; score: string; scored: number; conceded: number; opponent: string | null; date: string | null };
function normalizeOverviewForm(teamData: any): FormItem[] {
  const items = teamData?.overview?.form || teamData?.overview?.teamForm;
  if (!Array.isArray(items)) return [];
  return items.map((item: any) => {
    const score = parseScore(item?.score);
    const result = normalizeResult(item?.resultString ?? item?.result, score);
    if (!score || !result) return null;
    const dateValue = item?.date?.utcTime || item?.date || null;
    return {
      result,
      score: String(score.scored) + " - " + String(score.conceded),
      scored: score.scored,
      conceded: score.conceded,
      opponent: typeof item?.opponent === "string" ? item.opponent : item?.opponent?.name || null,
      date: typeof dateValue === "string" ? dateValue : null
    };
  }).filter((item: FormItem | null): item is FormItem => item !== null);
}
function mergeRecentForms(primary: FormItem[], fallback: FormItem[]): FormItem[] {
  const merged = [...primary];
  const seen = new Set(merged.filter(item => item.opponent || item.date).map(item =>
    (item.opponent || "").toLocaleLowerCase("tr-TR") + "|" + (item.date || "") + "|" + item.score
  ));
  for (const item of fallback) {
    const key = (item.opponent || "").toLocaleLowerCase("tr-TR") + "|" + (item.date || "") + "|" + item.score;
    if ((item.opponent || item.date) && seen.has(key)) continue;
    merged.push(item);
    if (item.opponent || item.date) seen.add(key);
    if (merged.length === 5) break;
  }
  return merged.slice(0, 5);
}
function normalizeForm(teamData: any, teamId: number, beforeDate: string) {
  const fixtures = teamData?.fixtures?.allFixtures?.fixtures || teamData?.fixtures?.recent?.fixtures || teamData?.fixtures?.fixtures;
  if (!Array.isArray(fixtures)) return [];
  return fixtures
    .filter((item: any) => {
      const kickoff = item?.status?.utcTime;
      return item?.status?.finished === true && !item?.status?.cancelled &&
        typeof kickoff === "string" && kickoff < beforeDate;
    })
    .map((item: any) => {
      const homeId = Number(item?.home?.id ?? item?.homeTeam?.id);
      const awayId = Number(item?.away?.id ?? item?.awayTeam?.id);
      const homeScore = scoreNumber(item?.home?.score ?? item?.homeScore);
      const awayScore = scoreNumber(item?.away?.score ?? item?.awayScore);
      if (homeScore === null || awayScore === null) return null;
      const isHome = homeId === teamId;
      const isAway = awayId === teamId;
      if (!isHome && !isAway) return null;
      const scored = isHome ? homeScore : awayScore;
      const conceded = isHome ? awayScore : homeScore;
      const opponent = typeof item?.opponent === "string" ? item.opponent : item?.opponent?.name || (isHome ? item?.away?.name : item?.home?.name);
      return {
        result: scored > conceded ? "W" as const : scored < conceded ? "L" as const : "D" as const,
        score: `${scored} - ${conceded}`,
        scored,
        conceded,
        opponent: opponent || null,
        date: item?.status?.utcTime || null
      };
    })
    .filter((item: any) => item !== null)
    .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 5);
}
function summarize(form: ReturnType<typeof normalizeForm>) {
  const scoredMatches = form.filter(item => item.scored !== null && item.conceded !== null);
  const count = scoredMatches.length;
  if (!count) return { sampleSize: form.length, scoredMatches: 0, goalsForAvg: null, goalsAgainstAvg: null, over25Pct: null, bttsPct: null };
  const goalsFor = scoredMatches.reduce((sum, item) => sum + (item.scored ?? 0), 0);
  const goalsAgainst = scoredMatches.reduce((sum, item) => sum + (item.conceded ?? 0), 0);
  const over25 = scoredMatches.filter(item => (item.scored ?? 0) + (item.conceded ?? 0) >= 3).length;
  const btts = scoredMatches.filter(item => (item.scored ?? 0) > 0 && (item.conceded ?? 0) > 0).length;
  return {
    sampleSize: form.length,
    scoredMatches: count,
    goalsForAvg: Number((goalsFor / count).toFixed(2)),
    goalsAgainstAvg: Number((goalsAgainst / count).toFixed(2)),
    over25Pct: Math.round(over25 / count * 100),
    bttsPct: Math.round(btts / count * 100)
  };
}
export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const rawId = req.query.matchId;
  const matchId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!matchId || !/^\d{5,12}$/.test(matchId)) return res.status(400).json({ error: "Geçersiz FotMob maç kimliği." });
  try {
    const details = await jsonFetch(`https://www.fotmob.com/api/data/matchDetails?matchId=${encodeURIComponent(matchId)}`);
    const general = details?.general;
    const homeId = general?.homeTeam?.id;
    const awayId = general?.awayTeam?.id;
    if (!homeId || !awayId) return res.status(200).json({ source: "FotMob", matchId, available: false, reason: "Takım kimlikleri kaynak yanıtında bulunamadı." });
    const [homeData, awayData] = await Promise.all([
      jsonFetch(`https://www.fotmob.com/api/data/teams?id=${encodeURIComponent(homeId)}`),
      jsonFetch(`https://www.fotmob.com/api/data/teams?id=${encodeURIComponent(awayId)}`)
    ]);
    const beforeDate = general?.matchTimeUTCDate || general?.matchTimeUTC || new Date().toISOString();
    const homeForm = mergeRecentForms(normalizeForm(homeData, Number(homeId), beforeDate), normalizeOverviewForm(homeData));
    const awayForm = mergeRecentForms(normalizeForm(awayData, Number(awayId), beforeDate), normalizeOverviewForm(awayData));
    const homeName = homeData?.details?.name || general?.homeTeam?.name || "Ev sahibi";
    const awayName = awayData?.details?.name || general?.awayTeam?.name || "Deplasman";
    return res.status(200).json({
      source: "FotMob", matchId, available: true,
      home: { teamId: homeId, name: homeName, form: homeForm, stats: summarize(homeForm) },
      away: { teamId: awayId, name: awayName, form: awayForm, stats: summarize(awayForm) }
    });
  } catch (error) {
    return res.status(502).json({ source: "FotMob", matchId, available: false, error: error instanceof Error ? error.message : "Geçmiş maç verisi alınamadı." });
  }
}
