type VercelRequest = {
  method?: string;
  query: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
  end(): void;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const rawId = req.query.eventId;
  const eventId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!eventId || !/^\d{5,12}$/.test(eventId)) {
    return res.status(400).json({ error: "Geçerli bir Sofascore eventId gerekli." });
  }

  try {
    const upstream = await fetch(`https://www.sofascore.com/api/v1/event/${eventId}/lineups`, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36",
        Referer: `https://www.sofascore.com/event/${eventId}`,
        Origin: "https://www.sofascore.com",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin"
      },
      signal: AbortSignal.timeout(12000)
    });
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: upstream.status === 403
          ? "Sofascore sunucu erişimini reddetti (403)."
          : `Sofascore HTTP ${upstream.status}`,
        upstreamStatus: upstream.status
      });
    }
    return res.status(200).json(await upstream.json());
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : "Sofascore bağlantısı kurulamadı."
    });
  }
}