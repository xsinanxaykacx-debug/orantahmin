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
function normalizeForm(teamData: any) {
  const raw = teamData?.overview?.form ?? teamData?.form ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map((item: any) => {
    const score = parseScore(firstValue(item?.score, item?.scoreStr, item?.status?.scoreStr));
    const result = normalizeResult(firstValue(item?.result, item?.resultString, item?.outcome), score);
    const opponent = typeof item?.opponent === "string" ? item.opponent : item?.opponent?.name;
    return {
      result,
      score: score ? `${score.scored} - ${score.conceded}` : null,
      scored: score?.scored ?? null,
      conceded: score?.conceded ?? null,
      opponent: opponent || null,
      date: item?.date || item?.utcTime || item?.status?.utcTime || null
    };
  }).filter((item: any) => item.result).slice(0, 5);
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
    const homeForm = normalizeForm(homeData);
    const awayForm = normalizeForm(awayData);
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
