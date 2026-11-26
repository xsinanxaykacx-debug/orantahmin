type Req = {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
};
type Res = {
  setHeader(name: string, value: string): void;
  status(code: number): Res;
  json(body: unknown): Res;
};

type BulletinMarket = {
  name: string;
  code: string;
  outcomes: Array<{ name: string; odd: number | null; rawOdd: string }>;
};

type BulletinMatch = {
  matchId: string | number;
  fields?: Record<string, unknown>;
};

type BulletinDocument = {
  meta?: { generatedAt?: string; schemaVersion?: string };
  matches?: BulletinMatch[];
};

type MarketDefinition = {
  key: string;
  name: string;
  marketField: string;
  outcomes: Array<{ name: string; oddField: string }>;
};

const MARKET_DEFINITIONS: MarketDefinition[] = [
  {
    key: "ms",
    name: "Maç Sonucu",
    marketField: "marketMs",
    outcomes: [
      { name: "1", oddField: "ms1" },
      { name: "X", oddField: "msX" },
      { name: "2", oddField: "ms2" }
    ]
  },
  {
    key: "double-chance",
    name: "Çifte Şans",
    marketField: "marketDoubleChance",
    outcomes: [
      { name: "1X", oddField: "doubleChance1X" },
      { name: "12", oddField: "doubleChance12" },
      { name: "X2", oddField: "doubleChanceX2" }
    ]
  },
  {
    key: "goals-25",
    name: "2,5 Gol Alt/Üst",
    marketField: "marketGoals25",
    outcomes: [
      { name: "Alt", oddField: "goals25Under" },
      { name: "Üst", oddField: "goals25Over" }
    ]
  },
  {
    key: "half-time",
    name: "İlk Yarı Sonucu",
    marketField: "marketHalfTimeResult",
    outcomes: [
      { name: "1", oddField: "halfTimeResult1" },
      { name: "X", oddField: "halfTimeResultX" },
      { name: "2", oddField: "halfTimeResult2" }
    ]
  },
  {
    key: "total-goals",
    name: "Toplam Gol Aralığı",
    marketField: "marketTotalGoals",
    outcomes: [
      { name: "0–1", oddField: "totalGoals01" },
      { name: "2–3", oddField: "totalGoals23" },
      { name: "4–6", oddField: "totalGoals46" },
      { name: "7+", oddField: "totalGoals7Plus" }
    ]
  },
  {
    key: "btts",
    name: "Karşılıklı Gol",
    marketField: "marketBtts",
    outcomes: [
      { name: "Var", oddField: "bttsYes" },
      { name: "Yok", oddField: "bttsNo" }
    ]
  },
  {
    key: "handicap",
    name: "Handikaplı Maç Sonucu",
    marketField: "marketHandicapMs",
    outcomes: [
      { name: "1", oddField: "handicapMs1" },
      { name: "X", oddField: "handicapMsX" },
      { name: "2", oddField: "handicapMs2" }
    ]
  },
  {
    key: "goals-15",
    name: "1,5 Gol Alt/Üst",
    marketField: "marketGoals15",
    outcomes: [
      { name: "Alt", oddField: "goals15Under" },
      { name: "Üst", oddField: "goals15Over" }
    ]
  },
  {
    key: "goals-35",
    name: "3,5 Gol Alt/Üst",
    marketField: "marketGoals35",
    outcomes: [
      { name: "Alt", oddField: "goals35Under" },
      { name: "Üst", oddField: "goals35Over" }
    ]
  },
  {
    key: "half-time-goals-15",
    name: "İlk Yarı 1,5 Gol Alt/Üst",
    marketField: "marketHalfTimeGoals15",
    outcomes: [
      { name: "Alt", oddField: "halfTimeGoals15Under" },
      { name: "Üst", oddField: "halfTimeGoals15Over" }
    ]
  }
];

function asOdd(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(",", "."));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function buildMarkets(fields: Record<string, unknown>): BulletinMarket[] {
  const markets: BulletinMarket[] = [];

  for (const definition of MARKET_DEFINITIONS) {
    const marketId = fields[definition.marketField];
    if (marketId === null || marketId === undefined || String(marketId).trim() === "") continue;

    const outcomes = definition.outcomes.map(outcome => {
      const odd = asOdd(fields[outcome.oddField]);
      return {
        name: outcome.name,
        odd,
        rawOdd: odd === null ? "" : String(odd)
      };
    });

    // Market kimliği ve en az bir gerçek oran yoksa marketi varmış gibi göstermeyiz.
    if (!outcomes.some(outcome => outcome.odd !== null)) continue;

    let name = definition.name;
    if (definition.key === "handicap") {
      const homeLine = fields.handicapHome;
      const awayLine = fields.handicapAway;
      if (homeLine !== null && homeLine !== undefined && awayLine !== null && awayLine !== undefined) {
        name += ` (${String(homeLine)}:${String(awayLine)})`;
      }
    }

    markets.push({ name, code: String(marketId), outcomes });
  }

  return markets;
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const rawId = req.query.matchId;
  const matchId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!matchId || !/^\\d{5,12}$/.test(matchId)) {
    return res.status(400).json({ error: "Geçersiz Mackolik maç kimliği." });
  }

  try {
    const hostHeader = req.headers["x-forwarded-host"] || req.headers.host;
    const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
    if (!host) return res.status(500).json({ error: "Bülten kaynağı belirlenemedi." });

    const protoHeader = req.headers["x-forwarded-proto"];
    const protocol = (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader) || "https";
    const bulletinUrl = `${protocol}://${host}/data/mackolik-bulletin.json`;
    const response = await fetch(bulletinUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return res.status(502).json({
        source: "Mackolik",
        matchId,
        error: `Yerel Mackolik bülteni okunamadı (HTTP ${response.status}).`
      });
    }

    const bulletin = await response.json() as BulletinDocument;
    if (!Array.isArray(bulletin.matches)) {
      return res.status(502).json({ source: "Mackolik", matchId, error: "Mackolik bülten biçimi geçersiz." });
    }

    const match = bulletin.matches.find(item => String(item.matchId) === matchId);
    if (!match || !match.fields || typeof match.fields !== "object") {
      return res.status(200).json({
        source: "Mackolik",
        matchId,
        available: false,
        markets: [],
        reason: "Bu maç günlük Mackolik bülteninde bulunamadı."
      });
    }

    const markets = buildMarkets(match.fields);
    if (!markets.length) {
      return res.status(200).json({
        source: "Mackolik",
        matchId,
        available: false,
        markets: [],
        reason: "Bu maç için 61 alanlı Mackolik bülteninde ek market oranı bulunmuyor."
      });
    }

    return res.status(200).json({
      source: "Mackolik",
      matchId,
      available: true,
      fetchedAt: bulletin.meta?.generatedAt || null,
      marketCount: markets.length,
      markets
    });
  } catch (error) {
    return res.status(502).json({
      source: "Mackolik",
      matchId,
      error: error instanceof Error ? error.message : "Mackolik bülten marketleri okunamadı."
    });
  }
}
