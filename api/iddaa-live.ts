import { normalizeIddaaLiveResults } from "../scripts/iddaa/live-status.ts";

type Req = { method?: string; query: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): Res };

function queryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=15");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const date = queryValue(req.query.date);
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) {
    return res.status(400).json({ source: "iddaa.com", error: "Geçerli tarih gerekli (YYYY-MM-DD)." });
  }

  try {
    const url = `https://statisticsv2.iddaa.com/live-results?sportId=1&date=${encodeURIComponent(date)}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
        Origin: "https://www.iddaa.com",
        Referer: "https://www.iddaa.com/"
      },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`iddaa canlı sonuç HTTP ${response.status}`);
    const payload = await response.json();
    const matches = normalizeIddaaLiveResults(payload);
    return res.status(200).json({
      source: "iddaa.com",
      date,
      matches,
      liveCount: matches.filter(match => match.status === 1).length,
      finishedCount: matches.filter(match => match.status === 4).length,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(502).json({
      source: "iddaa.com",
      date,
      error: error instanceof Error ? error.message : "İddaa canlı maç durumları alınamadı."
    });
  }
}
