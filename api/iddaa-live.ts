import { parseIddaaMarkets } from "../lib/iddaaMarkets.js";

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

function scoreValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function localDateTime(epochSeconds: unknown) {
  const date = new Date(Number(epochSeconds) * 1000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: string) => parts.find(part => part.type === type)?.value || "";
  return {
    date: `${value("day")}.${value("month")}.${value("year")}`,
    time: `${value("hour")}:${value("minute")}`
  };
}

function outcomeOdd(markets: any[], code: string, outcomeNo: number): number | null {
  const market = markets.find(item => item.code === code);
  const outcome = market?.outcomes?.find((item: any) => Number(item.no) === outcomeNo);
  return outcome?.odd == null ? null : Number(outcome.odd);
}

function toLiveMatch(event: any, score: any, marketConfig: Record<string, { n?: string }>, competitionMap: Record<string, string>, index: number) {
  const matchId = String(event.i);
  const homeName = String(event.hn || "");
  const awayName = String(event.an || "");
  const { date, time } = localDateTime(event.d);
  const markets = parseIddaaMarkets(event, marketConfig);
  const league = competitionMap[String(event.ci)] || String(event.cn || event.ci || "Lig");
  const minute = Number(score?.s) === 4
    ? "HT"
    : Number(score?.s) === 12
      ? "PEN"
      : score?.min != null && Number.isFinite(Number(score.min))
        ? `${Number(score.min)}'`
        : "CANLI";
  const ms = markets.find(item => item.code === "1:1:");
  const dc = markets.find(item => item.code === "2:92:");
  const scoreHome = scoreValue(score?.ht?.c);
  const scoreAway = scoreValue(score?.at?.c);
  const fields: Record<string, any> = {
    matchId, homeName, awayName, status: 1, time, date,
    mbs: event.mbc ?? null,
    ms1: outcomeOdd(markets, "1:1:", 1),
    msX: outcomeOdd(markets, "1:1:", 2),
    ms2: outcomeOdd(markets, "1:1:", 3),
    doubleChance1X: outcomeOdd(markets, "2:92:", 1),
    doubleChance12: outcomeOdd(markets, "2:92:", 2),
    doubleChanceX2: outcomeOdd(markets, "2:92:", 3),
    leagueCode: league,
    groupId: String(event.ci ?? ""),
    subgroupId: String(event.sgi ?? "0"),
    eventId: matchId,
    marketMs: ms?.code ?? null,
    marketDoubleChance: dc?.code ?? null,
    competitionId: event.ci ?? null,
    competitionName: league,
    iddaaEventState: event.s ?? null,
    iddaaInPlayFlag: event.il ?? null,
    iddaaLiveState: score?.s ?? null,
    scoreHome,
    scoreAway,
    iddaaMarkets: markets,
    marketCount: markets.length
  };
  return {
    matchId, homeName, awayName, date, time, status: 1, liveMinute: minute,
    fields, raw: [], source: { groupIndex: 0, matchIndex: index }
  };
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
    const metadata = await getMetadata();
    const matches = liveEvents.map((event: any, index: number) =>
      toLiveMatch(event, scoreMap[String(event.i)] || scoreMap[event.i] || null,
        metadata.marketConfig, metadata.competitionMap, index)
    );
    return res.status(200).json({
      source: "iddaa.com",
      matches,
      liveCount: matches.length,
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
