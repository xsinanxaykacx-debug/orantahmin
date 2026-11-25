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

  if (matchId && !/^\d{5,12}$/.test(matchId)) {
    return res.status(400).json({ error: "Invalid FotMob matchId" });
  }
  if (!/^\d{8}$/.test(date)) {
    return res.status(400).json({ error: "date must be YYYYMMDD" });
  }

  const url = matchId
    ? `https://www.fotmob.com/api/data/matchDetails?matchId=${encodeURIComponent(matchId)}`
    : `https://www.fotmob.com/api/data/matches?date=${date}`;

  try {
    const upstream = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36",
        Referer: "https://www.fotmob.com/"
      },
      signal: AbortSignal.timeout(15000)
    });
    const type = upstream.headers.get("content-type") || "";
    if (!upstream.ok || !type.includes("json")) {
      return res.status(502).json({
        source: "fotmob",
        upstreamStatus: upstream.status,
        contentType: type,
        error: "FotMob did not return JSON"
      });
    }
    const data = await upstream.json();
    if (matchId) {
      const content = data?.content || {};
      const lineup = content?.lineup || content?.lineups || null;
      return res.status(200).json({
        source: "fotmob",
        matchId,
        general: data?.general || null,
        header: data?.header || null,
        lineup,
        lineupKeys: lineup && typeof lineup === "object" ? Object.keys(lineup) : [],
        contentKeys: Object.keys(content || {}),
        hasLineup: !!lineup,
        raw: data
      });
    }
    return res.status(200).json({ source: "fotmob", date, data });
  } catch (error) {
    return res.status(502).json({
      source: "fotmob",
      error: error instanceof Error ? error.message : "FotMob request failed"
    });
  }
}
