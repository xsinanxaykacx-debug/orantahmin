export const config = { regions: ["fra1"] };

type VercelRequest = {
  method?: string;
  query: Record<string, string | string[] | undefined>;
};
type VercelResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
};

type IdDaaPlayer = {
  n?: string;
  j?: number | string;
  p?: string;
  r?: boolean;
  ps?: string;
  px?: string | number;
  py?: string | number;
};
type IdDaaTeam = {
  n?: string;
  lu?: string;
  f?: string;
  p?: IdDaaPlayer[];
};

function normalizeTeam(team: IdDaaTeam | undefined) {
  const players = Array.isArray(team?.p) ? team.p : [];
  const mapPlayer = (player: IdDaaPlayer) => ({
    name: player.n || "",
    shirtNumber: player.j ?? null,
    role: player.p || null,
    pitchPosition: player.ps || null,
    x: player.px == null ? null : Number(player.px),
    y: player.py == null ? null : Number(player.py)
  });
  return {
    name: team?.n || null,
    logo: team?.lu || null,
    formation: team?.f || null,
    starters: players.filter(player => player.r === false).map(mapPlayer),
    substitutes: players.filter(player => player.r === true).map(mapPlayer)
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const rawId = req.query.eventId;
  const eventId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!eventId || !/^\\d{1,12}$/.test(eventId)) {
    return res.status(400).json({ source: "iddaa.com", error: "Geçerli iddaa maç numarası gerekli." });
  }

  try {
    const response = await fetch(`https://statisticsv2.iddaa.com/statistics/soccer/lineup/${encodeURIComponent(eventId)}`, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
        Origin: "https://www.iddaa.com",
        Referer: "https://www.iddaa.com/"
      },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) return res.status(502).json({
      source: "iddaa.com",
      eventId,
      error: `iddaa kadro servisi HTTP ${response.status}`
    });
    const payload = await response.json() as {
      isSuccess?: boolean;
      data?: { ei?: number; h?: IdDaaTeam; a?: IdDaaTeam; pl?: boolean; pm?: boolean; src?: string };
    };
    if (payload.isSuccess !== true || !payload.data) {
      return res.status(502).json({ source: "iddaa.com", eventId, error: "iddaa kadro verisi geçerli değil." });
    }
    const home = normalizeTeam(payload.data.h);
    const away = normalizeTeam(payload.data.a);
    const hasLineup = home.starters.length > 0 || away.starters.length > 0 ||
      home.substitutes.length > 0 || away.substitutes.length > 0;
    return res.status(200).json({
      source: "iddaa.com",
      eventId: String(payload.data.ei ?? eventId),
      lineupType: "Muhtemel 11",
      lineupSource: payload.data.src || null,
      hasLineup,
      home,
      away,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(502).json({
      source: "iddaa.com",
      eventId,
      error: error instanceof Error ? error.message : "iddaa kadro verisi alınamadı."
    });
  }
}
