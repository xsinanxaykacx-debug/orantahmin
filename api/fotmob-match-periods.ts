type Req = { method?: string; query: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): Res };

const headers = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36",
  Referer: "https://www.fotmob.com/"
};

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const raw = req.query.matchId;
  const matchId = Array.isArray(raw) ? raw[0] : raw;
  if (!matchId || !/^\d{5,12}$/.test(matchId)) {
    return res.status(400).json({ error: "Geçersiz FotMob maç kimliği." });
  }

  try {
    const response = await fetch(`https://www.fotmob.com/api/data/matchDetails?matchId=${encodeURIComponent(matchId)}`, {
      headers,
      signal: AbortSignal.timeout(15000)
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("json")) {
      return res.status(502).json({ error: `FotMob maç detayları alınamadı (HTTP ${response.status}).` });
    }

    const data = await response.json();
    const finished = Boolean(data?.general?.finished ?? data?.header?.status?.finished);
    if (!finished) return res.status(200).json({ available: false, finished: false });

    const events = data?.content?.matchFacts?.events?.events;
    const finalTeams = data?.header?.teams || [];
    const finalHome = Number(finalTeams[0]?.score);
    const finalAway = Number(finalTeams[1]?.score);
    if (!Array.isArray(events)) {
      if (finalHome === 0 && finalAway === 0) return res.status(200).json({ source: "FotMob final score", available: true, finished: true, firstHalfHomeScore: 0, firstHalfAwayScore: 0 });
      return res.status(200).json({ available: false, finished: true });
    }

    let home = 0;
    let away = 0;
    let allHomeGoals = 0;
    let allAwayGoals = 0;

    for (const event of events) {
      if (String(event?.type || "").toLowerCase() !== "goal") continue;
      if (event?.isPenaltyShootoutEvent === true) continue;

      const ownGoal = Boolean(event?.ownGoal);
      const isHome = Boolean(event?.isHome);
      const scoringHome = ownGoal ? !isHome : isHome;
      if (scoringHome) allHomeGoals++;
      else allAwayGoals++;

      const halfLabel = String(event?.halfStrShort || event?.halfStrKey || "").toLowerCase();
      const time = Number(event?.time);
      const firstHalf = /first|1st|1h|firsthalf|first_half|ilk/.test(halfLabel) ||
        (!/second|2nd|2h|secondhalf|second_half|ikinci/.test(halfLabel) && Number.isFinite(time) && time <= 45);
      if (!firstHalf) continue;

      if (scoringHome) home++;
      else away++;
    }

    // Confirm the event list accounts for the official full-time score before trusting a derived half-time score.
    if (!Number.isFinite(finalHome) || !Number.isFinite(finalAway) ||
        allHomeGoals !== finalHome || allAwayGoals !== finalAway) {
      return res.status(200).json({ available: false, finished: true });
    }

    return res.status(200).json({
      source: "FotMob matchDetails goal events",
      available: true,
      finished: true,
      firstHalfHomeScore: home,
      firstHalfAwayScore: away
    });
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : "İlk yarı skoru alınamadı."
    });
  }
}
