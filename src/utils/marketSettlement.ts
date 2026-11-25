export type Settlement = "won" | "lost" | "unknown";

export type MatchResult = {
  home: number;
  away: number;
  finished: boolean;
};

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function selectionResult(selection: string, home: number, away: number): Settlement {
  const value = normalize(selection).replace(/\s/g, "");
  const result = home > away ? "1" : home === away ? "x" : "2";
  if (value === "1") return result === "1" ? "won" : "lost";
  if (value === "x" || value === "0") return result === "x" ? "won" : "lost";
  if (value === "2") return result === "2" ? "won" : "lost";
  if (value === "1x" || value === "1/x") return home >= away ? "won" : "lost";
  if (value === "12" || value === "1/2") return home !== away ? "won" : "lost";
  if (value === "x2" || value === "x/2") return home <= away ? "won" : "lost";
  return "unknown";
}

function thresholdFromTitle(title: string): number | null {
  const match = title.match(/(\d+(?:[,.]\d+)?)/);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function rangeFromSelection(selection: string): [number, number] | null {
  const match = selection.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

export function settleMarketOutcome(
  marketName: string,
  outcomeName: string,
  result: MatchResult | null
): Settlement {
  if (!result?.finished) return "unknown";
  const { home, away } = result;
  const total = home + away;
  const market = normalize(marketName);
  const outcome = normalize(outcomeName);

  // Half-time and second-half markets require a verified period score.
  if (/ilk yari|ikinci yari|devre|yari sonucu|yari alt ust/.test(market)) return "unknown";

  if (/karsilikli gol|kg var|kg yok/.test(market)) {
    if (/var/.test(outcome)) return home > 0 && away > 0 ? "won" : "lost";
    if (/yok/.test(outcome)) return home === 0 || away === 0 ? "won" : "lost";
  }

  if (/cifte sans/.test(market)) return selectionResult(outcomeName, home, away);

  if (/tek cift/.test(market)) {
    if (/tek/.test(outcome)) return total % 2 === 1 ? "won" : "lost";
    if (/cift/.test(outcome)) return total % 2 === 0 ? "won" : "lost";
  }

  if (/toplam gol araligi|gol araligi/.test(market)) {
    const range = rangeFromSelection(outcomeName);
    if (range) return total >= range[0] && total <= range[1] ? "won" : "lost";
    if (/7\+|7 ve uzeri|7 ustu/.test(outcome)) return total >= 7 ? "won" : "lost";
  }

  if (/mac sonucu/.test(market) && !/handikap|ilk gol|daha cok gol|ilk yari|ikinci yari|alt ust/.test(market)) {
    return selectionResult(outcomeName, home, away);
  }

  if (/alt ust|\bgol\b/.test(market) && !/araligi|karsilikli|ilk yari|ikinci yari|ev sahibi|deplasman/.test(market)) {
    const threshold = thresholdFromTitle(marketName);
    if (threshold !== null) {
      if (/alt/.test(outcome)) return total < threshold ? "won" : "lost";
      if (/ust|over/.test(outcome)) return total > threshold ? "won" : "lost";
    }
  }

  if (/ev sahibi|evsahibi|deplasman/.test(market) && /alt ust|gol/.test(market)) {
    const teamTotal = /deplasman/.test(market) ? away : home;
    const threshold = thresholdFromTitle(marketName);
    if (threshold !== null) {
      if (/alt/.test(outcome)) return teamTotal < threshold ? "won" : "lost";
      if (/ust|over/.test(outcome)) return teamTotal > threshold ? "won" : "lost";
    }
  }

  return "unknown";
}
