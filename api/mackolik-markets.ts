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
    .replace(/\bolympiacos\b/g, "olympiakos")
    .replace(/\buniversitatea\b|\buniversidad\b|\buniv\.?\b/g, "univ")
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
  if (common.length > 0 && common.length / Math.min(aTokens.size, bTokens.size) >= 0.6) return true;

  if (Math.min(a.length, b.length) < 6) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row++) {
    const current = [row];
    for (let column = 1; column <= b.length; column++) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  const similarity = 1 - previous[b.length] / Math.max(a.length, b.length);
  return similarity >= 0.78;
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

function pageTeamSlug(value: string): string {
  return normalizeName(value)
    .replace(/\buniv\b/g, "universidad")
    .replace(/\s+/g, "-");
}

function parseMarkets(html: string): MackolikMarket[] {
  // Yeni Mackolik maç detayındaki gerçek market kartları: her market bir
  // widget-iddaa-markets__market-item LI elemanıdır.
  const starts = [...html.matchAll(/<li\\b(?=[^>]*\\bclass=["'][^"']*\\bwidget-iddaa-markets__market-item\\b[^"']*["'])[^>]*>/gi)];
  const markets: MackolikMarket[] = [];

  for (let index = 0; index < starts.length; index++) {
    const start = starts[index].index ?? 0;
    const end = starts[index + 1]?.index ?? html.length;
    const block = html.slice(start, end);

    const titleMatch = block.match(/<span\\b(?=[^>]*\\bclass=["'][^"']*\\bwidget-iddaa-markets__header-text\\b[^"']*["'])[^>]*>([\\s\\S]*?)<\\/span>/i);
    if (!titleMatch) continue;
    const name = textContent(titleMatch[1]);
    if (!name) continue;

    // Ana iddaa oran listesi ilk option-list'tir. type2 hidden listeler
    // sağlayıcı reklam/partner oranlarıdır; ana markete karıştırılmaz.
    const listMatch = block.match(/<ul\\b(?=[^>]*\\bclass=["'][^"']*\\bwidget-iddaa-markets__option-list\\b[^"']*["'])(?![^>]*\\btype2\\b)[^>]*>([\\s\\S]*?)<\\/ul>/i);
    if (!listMatch) continue;

    const outcomes: MarketOutcome[] = [];
    const optionStarts = [...listMatch[1].matchAll(/<li\\b(?=[^>]*\\bclass=["'][^"']*\\bwidget-iddaa-markets__option\\b[^"']*["'])[^>]*>([\\s\\S]*?)<\\/li>/gi)];
    for (const option of optionStarts) {
      const labelMatch = option[1].match(/<span\\b(?=[^>]*\\bclass=["'][^"']*\\bwidget-iddaa-markets__label\\b[^"']*["'])[^>]*>([\\s\\S]*?)<\\/span>/i);
      const valueMatch = option[1].match(/<span\\b(?=[^>]*\\bclass=["'][^"']*\\bwidget-iddaa-markets__value\\b[^"']*["'])[^>]*>([\\s\\S]*?)<\\/span>/i);
      if (!labelMatch || !valueMatch) continue;
      const outcomeName = textContent(labelMatch[1]);
      const rawOdd = textContent(valueMatch[1]);
      if (!outcomeName) continue;
      const normalized = rawOdd.replace(",", ".").trim();
      const parsed = normalized && normalized !== "-" ? Number(normalized) : NaN;
      outcomes.push({
        name: outcomeName,
        odd: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
        rawOdd
      });
    }

    if (!outcomes.length) continue;
    const marketType = block.match(/\\bdata-market=["']([^"']+)["']/i)?.[1] || "";
    const marketId = block.match(/\\bdata-market-id=["']([^"']+)["']/i)?.[1] || "";
    markets.push({
      name,
      code: marketType ? (marketId ? marketType + "-" + marketId : marketType) : slugify(name) + "-" + (index + 1),
      outcomes
    });
  }

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
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36",
      "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
      "Referer": "https://www.mackolik.com/",
      "Origin": "https://www.mackolik.com",
      "sec-ch-ua": '"Chromium";v="158", "Google Chrome";v="158", "Not_A Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
      "Upgrade-Insecure-Requests": "1"
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

    const pageSlugs = [...new Set([
      match.matchSlug,
      `${pageTeamSlug(home)}-vs-${pageTeamSlug(away)}`,
      `${pageTeamSlug(match.homeTeam?.name || "")}-vs-${pageTeamSlug(match.awayTeam?.name || "")}`
    ].filter(Boolean))];
    let pageResponse: Response | null = null;
    let lastPageStatus = 0;
    for (const pageSlug of pageSlugs) {
      const matchUrl = new URL(`/mac/${pageSlug}/iddaa/${match.id}`, "https://www.mackolik.com");
      for (let attempt = 0; attempt < 2; attempt++) {
        pageResponse = await fetch(matchUrl, {
          headers: {
            ...commonHeaders,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Cache-Control": "no-cache",
            Pragma: "no-cache"
          },
          redirect: "follow",
          signal: AbortSignal.timeout(20000)
        });
        if (pageResponse.ok) break;
        lastPageStatus = pageResponse.status;
        if (![403, 408, 429, 500, 502, 503, 504].includes(pageResponse.status)) break;
        await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
      }
      if (pageResponse?.ok) break;
    }
    if (!pageResponse?.ok) {
      return res.status(502).json({
        source: "Mackolik",
        matchId,
        error: `Mackolik oran sayfası alınamadı (HTTP ${lastPageStatus || pageResponse?.status || 502}).`
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
