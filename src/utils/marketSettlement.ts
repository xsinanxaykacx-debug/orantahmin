export type Settlement = "won" | "lost" | "unknown";

export type MatchResult = {
  home: number;
  away: number;
  finished: boolean;
  firstHalf?: { home: number; away: number } | null;
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

// Parse the original title before Turkish punctuation is normalized: 1,5 must stay 1.5.
function thresholdFromTitle(title: string): number | null {
  const matches = [...title.matchAll(/(\d+(?:[,.]\d+)?)/g)];
  const raw = matches[matches.length - 1]?.[1];
  if (!raw) return null;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function rangeFromSelection(selection: string): [number, number] | null {
  const match = selection.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

function overUnder(outcome: string, goals: number, threshold: number): Settlement {
  if (/alt|under/.test(outcome)) return goals < threshold ? "won" : "lost";
  if (/ust|over/.test(outcome)) return goals > threshold ? "won" : "lost";
  return "unknown";
}

export function settleMarketOutcome(
  marketName: string,
  outcomeName: string,
  result: MatchResult | null
): Settlement {
  if (!result?.finished) return "unknown";

  const { home, away, firstHalf } = result;
  const total = home + away;
  const market = normalize(marketName);
  const outcome = normalize(outcomeName);

  // No period-specific market is settled unless the half-time score is verified.
  if (/daha cok gol olacak yari/.test(market)) {
    if (!firstHalf) return "unknown";
    const firstGoals = firstHalf.home + firstHalf.away;
    const secondHome = home - firstHalf.home;
    const secondAway = away - firstHalf.away;
    if (secondHome < 0 || secondAway < 0) return "unknown";
    const secondGoals = secondHome + secondAway;
    if (/esit/.test(outcome)) return firstGoals === secondGoals ? "won" : "lost";
    if (/1\s*y|1 y|ilk yari/.test(outcome)) return firstGoals > secondGoals ? "won" : "lost";
    if (/2\s*y|2 y|ikinci yari/.test(outcome)) return secondGoals > firstGoals ? "won" : "lost";
    return "unknown";
  }

  if (/iki yari(?:da)? da gol/.test(market)) {
    if (!firstHalf) return "unknown";
    const secondHome = home - firstHalf.home;
    const secondAway = away - firstHalf.away;
    if (secondHome < 0 || secondAway < 0) return "unknown";
    const isHomeMarket = /ev sahibi|evsahibi/.test(market);
    const firstTeamGoals = isHomeMarket ? firstHalf.home : firstHalf.away;
    const secondTeamGoals = isHomeMarket ? secondHome : secondAway;
    const scoredBoth = firstTeamGoals > 0 && secondTeamGoals > 0;
    if (/atar/.test(outcome)) return scoredBoth ? "won" : "lost";
    if (/atamaz/.test(outcome)) return scoredBoth ? "lost" : "won";
    return "unknown";
  }

  if (/ikinci yari|2 yari/.test(market)) {
    if (!firstHalf) return "unknown";
    const secondHome = home - firstHalf.home;
    const secondAway = away - firstHalf.away;
    if (secondHome < 0 || secondAway < 0) return "unknown";
    if (/sonucu|cifte sans/.test(market)) return selectionResult(outcomeName, secondHome, secondAway);
    if (/alt ust|gol/.test(market)) {
      const threshold = thresholdFromTitle(marketName);
      if (threshold !== null) return overUnder(outcome, secondHome + secondAway, threshold);
    }
    return "unknown";
  }

  if (/ilk yari|1 yari|devre|\biy\b/.test(market)) {
    if (!firstHalf) return "unknown";
    const halfTotal = firstHalf.home + firstHalf.away;
    if (/sonucu|cifte sans/.test(market)) return selectionResult(outcomeName, firstHalf.home, firstHalf.away);
    if (/alt ust|gol/.test(market)) {
      const threshold = thresholdFromTitle(marketName);
      if (threshold !== null) return overUnder(outcome, halfTotal, threshold);
    }
    return "unknown";
  }

  if (/handikapli mac sonucu|handikap mac sonucu/.test(market)) {
    const handicap = marketName.match(/\(\s*(-?\d+)\s*:\s*(-?\d+)\s*\)/);
    if (!handicap) return "unknown";
    const adjustedHome = home + Number(handicap[1]);
    const adjustedAway = away + Number(handicap[2]);
    return selectionResult(outcomeName, adjustedHome, adjustedAway);
  }

  if (/mac sonucu ve/.test(market)) {
    const threshold = thresholdFromTitle(marketName);
    const combined = outcome.match(/^([1x2])\s*ve\s*(alt|ust)$/);
    if (threshold === null || !combined) return "unknown";
    const resultPart = selectionResult(combined[1], home, away);
    const goalsPart = overUnder(combined[2], total, threshold);
    return resultPart === "won" && goalsPart === "won" ? "won" : "lost";
  }

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
    if (/^(?:6\s*(?:gol)?|6\s*ve\s*uzeri|6\s*ustu)$/.test(outcome)) return total >= 6 ? "won" : "lost";
    if (/^(?:7\s*(?:gol)?|7\s*ve\s*uzeri|7\s*ustu)$/.test(outcome)) return total >= 7 ? "won" : "lost";
  }

  if (/mac sonucu/.test(market) && !/ilk gol|daha cok gol|alt ust|handikap/.test(market)) {
    return selectionResult(outcomeName, home, away);
  }

  if (/alt ust|gol/.test(market) && !/araligi|karsilikli|ev sahibi|evsahibi|deplasman/.test(market)) {
    const threshold = thresholdFromTitle(marketName);
    if (threshold !== null) return overUnder(outcome, total, threshold);
  }

  if (/ev sahibi|evsahibi|deplasman/.test(market) && /alt ust|gol/.test(market)) {
    const teamTotal = /deplasman/.test(market) ? away : home;
    const threshold = thresholdFromTitle(marketName);
    if (threshold !== null) return overUnder(outcome, teamTotal, threshold);
  }

  return "unknown";
}
