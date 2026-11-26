type Req = {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
};
type Res = { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): Res };

type MarketOutcome = { name: string; odd: number | null; rawOdd: string };
type MackolikMarket = { name: string; code: string; outcomes: MarketOutcome[] };

type BulletinMatch = {
  matchId: string | number;
  fields?: Record<string, unknown>;
};
type BulletinDocument = {
  meta?: { generatedAt?: string };
  matches?: BulletinMatch[];
};

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function positiveOdd(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function market(
  name: string,
  marketId: unknown,
  selections: Array<{ name: string; value: unknown }>
): MackolikMarket | null {
  const outcomes = selections.map(selection => {
    const odd = positiveOdd(selection.value);
    return {
      name: selection.name,
      odd,
      rawOdd: odd === null ? "" : String(selection.value)
    };
  });

  if (!outcomes.some(outcome => outcome.odd !== null)) return null;

  const code = marketId === null || marketId === undefined || String(marketId).trim() === ""
    ? name.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]+/g, "-")
    : String(marketId);

  return { name, code, outcomes };
}

function buildMarkets(fields: Record<string, unknown>): MackolikMarket[] {
  const definitions: Array<MackolikMarket | null> = [
    market("Maç Sonucu", fields.marketMs, [
      { name: "1", value: fields.ms1 },
      { name: "X", value: fields.msX },
      { name: "2", value: fields.ms2 }
    ]),
    market("Çifte Şans", fields.marketDoubleChance, [
      { name: "1X", value: fields.doubleChance1X },
      { name: "12", value: fields.doubleChance12 },
      { name: "X2", value: fields.doubleChanceX2 }
    ]),
    market("2,5 Gol", fields.marketGoals25, [
      { name: "Alt", value: fields.goals25Under },
      { name: "Üst", value: fields.goals25Over }
    ]),
    market("İlk Yarı Sonucu", fields.marketHalfTimeResult, [
      { name: "1", value: fields.halfTimeResult1 },
      { name: "X", value: fields.halfTimeResultX },
      { name: "2", value: fields.halfTimeResult2 }
    ]),
    market("Toplam Gol", fields.marketTotalGoals, [
      { name: "0–1", value: fields.totalGoals01 },
      { name: "2–3", value: fields.totalGoals23 },
      { name: "4–6", value: fields.totalGoals46 },
      { name: "7+", value: fields.totalGoals7Plus }
    ]),
    market("Karşılıklı Gol", fields.marketBtts, [
      { name: "Var", value: fields.bttsYes },
      { name: "Yok", value: fields.bttsNo }
    ]),
    market("Handikaplı Maç Sonucu", fields.marketHandicapMs, [
      { name: `1 (${fields.handicapHome ?? "handikap"})`, value: fields.handicapMs1 },
      { name: "X", value: fields.handicapMsX },
      { name: `2 (${fields.handicapAway ?? "handikap"})`, value: fields.handicapMs2 }
    ]),
    market("1,5 Gol", fields.marketGoals15, [
      { name: "Alt", value: fields.goals15Under },
      { name: "Üst", value: fields.goals15Over }
    ]),
    market("3,5 Gol", fields.marketGoals35, [
      { name: "Alt", value: fields.goals35Under },
      { name: "Üst", value: fields.goals35Over }
    ]),
    market("İlk Yarı 1,5 Gol", fields.marketHalfTimeGoals15, [
      { name: "Alt", value: fields.halfTimeGoals15Under },
      { name: "Üst", value: fields.halfTimeGoals15Over }
    ])
  ];

  return definitions.filter((item): item is MackolikMarket => item !== null);
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
    // Bülten, aynı Vercel dağıtımında statik dosya olarak yayınlanır.
    // Mackolik arşivine maç başına istek gönderilmez.
    const forwardedHost = headerValue(req.headers?.["x-forwarded-host"]);
    const requestHost = headerValue(req.headers?.host);
    const host = (forwardedHost || requestHost).split(",")[0].trim();
    if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
      return res.status(500).json({ source: "Mackolik", matchId, error: "Bülten kaynağı için geçerli dağıtım adresi belirlenemedi." });
    }

    const bulletinUrl = `https://${host}/data/mackolik-bulletin.json`;
    const response = await fetch(bulletinUrl, {
      headers: { Accept: "application/json" },
      cache: "force-cache",
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) {
      return res.status(502).json({
        source: "Mackolik",
        matchId,
        error: `Günlük Mackolik bülteni okunamadı (HTTP ${response.status}).`
      });
    }

    const bulletin = await response.json() as BulletinDocument;
    if (!Array.isArray(bulletin.matches)) {
      return res.status(502).json({ source: "Mackolik", matchId, error: "Mackolik bülteninde maç kayıtları bulunamadı." });
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
        reason: "Bu maçın 61 alanlı Mackolik bülten kaydında kullanılabilir ek market oranı bulunmuyor."
      });
    }

    return res.status(200).json({
      source: "Mackolik",
      matchId,
      available: true,
      fetchedAt: bulletin.meta?.generatedAt || new Date().toISOString(),
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
