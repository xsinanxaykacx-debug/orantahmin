type Req = {
  method?: string;
  query: Record<string, string | string[] | undefined>;
};
type Res = {
  setHeader(name: string, value: string): void;
  status(code: number): Res;
  json(body: unknown): Res;
};

type MarketOutcome = { name: string; odd: number | null; rawOdd: string };
type MackolikMarket = { name: string; code: string; outcomes: MarketOutcome[] };
type MackolikMatch = {
  id: string;
  matchName?: string;
  matchSlug?: string;
  mstUtc?: number;
  homeTeam?: { name?: string };
  awayTeam?: { name?: string };
};
type FeedResponse = {
  status?: string;
  data?: { matches?: Record<string, MackolikMatch> };
};

function queryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/\b(fc|ac|cf|sc|fk|sk|afc|club|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function sameTeam(source: string, requested: string): boolean {
  const a = normalizeName(source);
  const b = normalizeName(requested);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;

  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  const common = [...aTokens].filter(token => bTokens.has(token));
  return common.length > 0 && common.length / Math.min(aTokens.size, bTokens.size) >= 0.6;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function textContent(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]*>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

function parseOutcome(html: string): MarketOutcome | null {
  const value = textContent(html);
  const oddMatch = value.match(/(-|\d+(?:[.,]\d+)?)\s*$/);
  if (!oddMatch || oddMatch.index === undefined) return null;

  const name = value.slice(0, oddMatch.index).trim();
  if (!name) return null;

  const rawOdd = oddMatch[1];
  const numeric = rawOdd === "-" ? NaN : Number(rawOdd.replace(",", "."));
  return {
    name,
    odd: Number.isFinite(numeric) && numeric > 0 ? numeric : null,
    rawOdd
  };
}

function slugify(value: string): string {
  return normalizeName(value).replace(/\s+/g, "-") || "market";
}

function parseMarkets(html: string): MackolikMarket[] {
  const headings = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)];
  const markets: MackolikMarket[] = [];

  headings.forEach((heading, index) => {
    const headingEnd = (heading.index ?? 0) + heading[0].length;
    const nextHeadingStart = headings[index + 1]?.index ?? html.length;
    const section = html.slice(headingEnd, nextHeadingStart);
    const name = textContent(heading[1]).replace(/\s*MBS\s*\d+\s*$/i, "").trim();
    if (!name) return;

    // Mackolik renders the current market selections in the first list after its heading.
    const firstList = section.match(/<ul\b[^>]*>([\s\S]*?)<\/ul>/i);
    if (!firstList) return;

    const outcomes = [...firstList[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
      .map(item => parseOutcome(item[1]))
      .filter((item): item is MarketOutcome => item !== null);

    if (!outcomes.length) return;
    markets.push({
      name,
      code: `${slugify(name)}-${index + 1}`,
      outcomes
    });
  });

  return markets;
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const date = queryValue(req.query.date);
  const home = queryValue(req.query.home);
  const away = queryValue(req.query.away);
  const matchId = queryValue(req.query.matchId);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !home.trim() || !away.trim()) {
    return res.status(400).json({
      source: "Mackolik",
      matchId,
      error: "Maç tarihi ve iki takım adı gerekli."
    });
  }

  try {
    const feedUrl = new URL("https://www.mackolik.com/perform/p0/ajax/components/competition/livescores/json");
    feedUrl.searchParams.set("sports[]", "Soccer");
    feedUrl.searchParams.set("matchDate", date);

    const commonHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
      "Referer": "https://www.mackolik.com/"
    };

    const feedResponse = await fetch(feedUrl, {
      headers: { ...commonHeaders, Accept: "application/json, text/plain, */*" },
      signal: AbortSignal.timeout(15000)
    });
    if (!feedResponse.ok) {
      return res.status(502).json({
        source: "Mackolik",
        matchId,
        error: `Mackolik maç listesi alınamadı (HTTP ${feedResponse.status}).`
      });
    }

    const feed = await feedResponse.json() as FeedResponse;
    const candidates = Object.values(feed.data?.matches || {});
    const match = candidates.find(candidate =>
      sameTeam(candidate.homeTeam?.name || "", home) &&
      sameTeam(candidate.awayTeam?.name || "", away)
    );

    if (!match?.id || !match.matchSlug) {
      return res.status(200).json({
        source: "Mackolik",
        matchId,
        available: false,
        markets: [],
        reason: "Bu tarih ve takım eşleşmesi Mackolik maç listesinde bulunamadı."
      });
    }

    const matchUrl = new URL(`/mac/${match.matchSlug}/iddaa/${match.id}`, "https://www.mackolik.com");
    const pageResponse = await fetch(matchUrl, {
      headers: { ...commonHeaders, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      signal: AbortSignal.timeout(20000)
    });
    if (!pageResponse.ok) {
      return res.status(502).json({
        source: "Mackolik",
        matchId,
        error: `Mackolik oran sayfası alınamadı (HTTP ${pageResponse.status}).`
      });
    }

    const html = await pageResponse.text();
    const markets = parseMarkets(html);
    if (!markets.length) {
      return res.status(200).json({
        source: "Mackolik",
        matchId,
        available: false,
        markets: [],
        reason: "Mackolik maç sayfası açıldı ancak okunabilir market bulunamadı."
      });
    }

    return res.status(200).json({
      source: "Mackolik",
      matchId,
      available: true,
      fetchedAt: new Date().toISOString(),
      marketCount: markets.length,
      markets
    });
  } catch (error) {
    return res.status(502).json({
      source: "Mackolik",
      matchId,
      error: error instanceof Error ? error.message : "Mackolik marketleri okunamadı."
    });
  }
}
