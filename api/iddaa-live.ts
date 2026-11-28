import { transformIddaaPayload } from "../scripts/iddaa/transform.js";

type Req = { method?: string };
type Res = { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): Res };

const SPORTSBOOK = "https://sportsbookv2.iddaa.com/sportsbook";
const HEADERS = {
  Accept: "application/json, text/plain, */*",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
  Origin: "https://www.iddaa.com",
  Referer: "https://www.iddaa.com/"
};

let metadataCache: {
  expiresAt: number;
  marketConfig: Record<string, { n?: string }>;
  competitionMap: Record<string, string>;
} | null = null;

async function getJson(url: string): Promise<any> {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`iddaa HTTP ${response.status}`);
  const payload = await response.json();
  if (payload?.isSuccess !== true) throw new Error("iddaa geçerli yanıt döndürmedi.");
  return payload;
}

async function getMetadata() {
  if (metadataCache && metadataCache.expiresAt > Date.now()) return metadataCache;
  const [marketResult, competitionResult] = await Promise.allSettled([
    getJson(`${SPORTSBOOK}/get_market_config?st=1`),
    getJson(`${SPORTSBOOK}/competitions?st=1`)
  ]);
  const marketPayload = marketResult.status === "fulfilled" ? marketResult.value : null;
  const competitionPayload = competitionResult.status === "fulfilled" ? competitionResult.value : null;
  const marketConfig = marketPayload?.data?.m && typeof marketPayload.data.m === "object"
    ? marketPayload.data.m : {};
  const competitionRows = Array.isArray(competitionPayload?.data)
    ? competitionPayload.data
    : Array.isArray(competitionPayload?.data?.competitions) ? competitionPayload.data.competitions : [];
  const competitionMap: Record<string, string> = {};
  for (const row of competitionRows) {
    if (row?.i == null || !row?.n) continue;
    if (row.si != null && String(row.si) !== "1") continue;
    competitionMap[String(row.i)] = String(row.n);
  }
  metadataCache = { expiresAt: Date.now() + 10 * 60_000, marketConfig, competitionMap };
  return metadataCache;
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=10");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const payload = await getJson(`${SPORTSBOOK}/events?st=1&type=1&version=0`);
    const root = Array.isArray(payload.data) ? payload.data[0] : payload.data;
    const events = Array.isArray(root?.events) ? root.events : [];
    const liveEvents = events.filter((event: any) => Number(event.sid) === 1 && Number(event.s) === 1);
    const scoreMap = root?.sc && typeof root.sc === "object" ? root.sc : {};
    const enrichedEvents = liveEvents.map((event: any) => ({
      ...event,
      liveScore: scoreMap[String(event.i)] || scoreMap[event.i] || null
    }));

    if (!enrichedEvents.length) {
      return res.status(200).json({
        source: "iddaa.com", matches: [], liveCount: 0,
        sourceEventCount: events.length, fetchedAt: new Date().toISOString()
      });
    }

    const metadata = await getMetadata();
    const transformed = transformIddaaPayload(
      { isSuccess: true, data: { ...root, events: enrichedEvents } },
      metadata.marketConfig,
      metadata.competitionMap
    );
    return res.status(200).json({
      source: "iddaa.com",
      matches: transformed.matches,
      liveCount: transformed.matches.length,
      sourceEventCount: events.length,
      scoreCount: Object.keys(scoreMap).length,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(502).json({
      source: "iddaa.com",
      error: error instanceof Error ? error.message : "Canlı maç verisi alınamadı."
    });
  }
}
