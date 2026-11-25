type Req = { method?: string; query: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): Res };

type MarketOutcome = { name: string; odd: number | null; rawOdd: string };
type MackolikMarket = { name: string; code: string; outcomes: MarketOutcome[] };

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36";

function textFromHtml(value: string): string {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function findDivEnd(html: string, start: number): number {
  const token = /<\/?div\b[^>]*>/gi;
  token.lastIndex = start;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = token.exec(html))) {
    if (/^<\//.test(match[0])) depth -= 1;
    else if (!/\/\s*>$/.test(match[0])) depth += 1;
    if (depth === 0) return token.lastIndex;
  }
  return -1;
}

function parseMarkets(html: string): MackolikMarket[] {
  const containerMatch = /<div\b(?=[^>]*\bid=["']compare-left-coll["'])[^>]*>/i.exec(html);
  if (!containerMatch || containerMatch.index === undefined) return [];
  const containerEnd = findDivEnd(html, containerMatch.index);
  if (containerEnd < 0) return [];
  const container = html.slice(containerMatch.index, containerEnd);
  const starts = /<div\b(?=[^>]*\bclass=["'][^"']*\bmd\b[^"']*["'])[^>]*>/gi;
  const markets: MackolikMarket[] = [];
  let startMatch: RegExpExecArray | null;

  while ((startMatch = starts.exec(container))) {
    const blockEnd = findDivEnd(container, startMatch.index);
    if (blockEnd < 0) break;
    const block = container.slice(startMatch.index, blockEnd);
    const titleMatch = /<div\b[^>]*class=["'][^"']*\bdetail-title\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(block);
    if (!titleMatch) continue;
    const titleText = textFromHtml(titleMatch[1]);
    const codeMatch = titleText.match(/\b(\d{5,})\b/);
    const code = codeMatch?.[1] || "";
    const name = titleText.replace(/\b\d{5,}\b/g, "").trim();
    if (!name || !code) continue;

    const names = [...block.matchAll(/<div\b[^>]*class=["'][^"']*\bsgoutcome-name\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)]
      .map(match => textFromHtml(match[1]));
    const values = [...block.matchAll(/<div\b[^>]*class=["'][^"']*\bsgoutcome-value\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)]
      .map(match => textFromHtml(match[1]));

    const outcomes = names.map((outcomeName, index) => {
      const rawOdd = values[index] || "";
      const normalized = rawOdd.replace(",", ".").trim();
      const parsed = normalized && normalized !== "-" ? Number(normalized) : NaN;
      return {
        name: outcomeName,
        odd: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
        rawOdd
      };
    }).filter(outcome => outcome.name);

    if (outcomes.length) markets.push({ name, code, outcomes });
    starts.lastIndex = blockEnd;
  }
  return markets;
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const rawId = req.query.matchId;
  const matchId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!matchId || !/^\d{5,12}$/.test(matchId)) {
    return res.status(400).json({ error: "Geçersiz Mackolik maç kimliği." });
  }

  try {
    const url = `https://arsiv.mackolik.com/Match/Default.aspx?id=${encodeURIComponent(matchId)}`;
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
        "User-Agent": UA,
        Referer: "https://arsiv.mackolik.com/"
      },
      signal: AbortSignal.timeout(18000)
    });
    if (!response.ok) {
      return res.status(502).json({ source: "Mackolik", matchId, error: `Mackolik sayfası alınamadı (HTTP ${response.status}).` });
    }
    const html = await response.text();
    const markets = parseMarkets(html);
    if (!markets.length) {
      return res.status(200).json({
        source: "Mackolik",
        matchId,
        available: false,
        markets: [],
        reason: "Bu maç için Mackolik detay sayfasında okunabilir oran marketi bulunamadı."
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
      error: error instanceof Error ? error.message : "Mackolik oranları alınamadı."
    });
  }
}
