type Req = { method?: string; query: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): Res };

const headers = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36",
  Referer: "https://www.sofascore.com/"
};

function queryValue(query: Req["query"], key: string): string {
  const value = query[key];
  return (Array.isArray(value) ? value[0] : value || "").trim();
}
function normalizeTeam(value: string): string {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function teamSimilarity(left: string, right: string): number {
  const a = normalizeTeam(left), b = normalizeTeam(right);
  if (!a || !b) return 0;
  if (a === b || a.includes(b) || b.includes(a)) return 1;
  const aa = new Set(a.split(" ")), bb = new Set(b.split(" "));
  const shared = [...aa].filter(token => bb.has(token)).length;
  // Common source suffixes such as "FK" may be absent from the other provider.
  // Treat a complete shorter-name token match as strong, but still rely on
  // both teams and the exact match date to disambiguate the fixture.
  if (shared === Math.min(aa.size, bb.size)) return 0.9;
  return shared / Math.max(aa.size, bb.size);
}
async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`SofaScore HTTP ${response.status}`);
  return response.json();
}
function numeric(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(String(value).replace(",", ".").replace("%", "").trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
function collectStats(payload: any, periods: string[]) {
  const entries: Array<{ period: string; name: string; home: number; away: number }> = [];
  const groups = payload?.statistics || payload?.data?.statistics || [];
  for (const block of groups) {
    const period = String(block?.period || block?.periodName || "").toUpperCase();
    if (!periods.includes(period)) continue;
    const groupList = block?.groups || [];
    for (const group of groupList) {
      for (const item of group?.statisticsItems || group?.items || []) {
        const home = numeric(item?.home), away = numeric(item?.away);
        if (home == null || away == null) continue;
        entries.push({ period, name: String(item?.name || item?.key || "").toLowerCase(), home, away });
      }
    }
  }
  return entries;
}
function findStat(entries: ReturnType<typeof collectStats>, patterns: RegExp[]): { home: number; away: number } | null {
  for (const pattern of patterns) {
    const item = entries.find(entry => pattern.test(entry.name));
    if (item) return { home: item.home, away: item.away };
  }
  return null;
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const date = queryValue(req.query, "date");
  const homeName = queryValue(req.query, "home");
  const awayName = queryValue(req.query, "away");
  const finalHome = Number(queryValue(req.query, "finalHome"));
  const finalAway = Number(queryValue(req.query, "finalAway"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !homeName || !awayName ||
      !Number.isInteger(finalHome) || !Number.isInteger(finalAway) || finalHome < 0 || finalAway < 0) {
    return res.status(400).json({ error: "Maç tarihi, takımlar ve bitiş skoru gerekli." });
  }

  try {
    const schedule = await fetchJson(`https://www.sofascore.com/api/v1/sport/football/scheduled-events/${date}`);
    const candidates = (schedule?.events || []).map((event: any) => ({
      event,
      home: teamSimilarity(homeName, event?.homeTeam?.name || ""),
      away: teamSimilarity(awayName, event?.awayTeam?.name || "")
    })).filter((item: any) => item.home >= 0.75 && item.away >= 0.75)
      .sort((a: any, b: any) => (b.home + b.away) - (a.home + a.away));
    const best = candidates[0], second = candidates[1];
    if (!best || (second && (best.home + best.away) - (second.home + second.away) < 0.12)) {
      return res.status(200).json({ available: false, reason: "SofaScore maç eşleşmesi doğrulanamadı." });
    }

    const eventId = Number(best.event?.id);
    if (!Number.isSafeInteger(eventId) || eventId <= 0) {
      return res.status(200).json({ available: false, reason: "SofaScore maç kimliği bulunamadı." });
    }
    const [eventPayload, statisticsPayload, incidentsPayload] = await Promise.all([
      fetchJson(`https://www.sofascore.com/api/v1/event/${eventId}`),
      fetchJson(`https://www.sofascore.com/api/v1/event/${eventId}/statistics`).catch(() => null),
      fetchJson(`https://www.sofascore.com/api/v1/event/${eventId}/incidents`).catch(() => null)
    ]);
    const event = eventPayload?.event;
    const status = String(event?.status?.type || "").toLowerCase();
    const scoreHome = numeric(event?.homeScore?.current);
    const scoreAway = numeric(event?.awayScore?.current);
    if (status !== "finished" || scoreHome !== finalHome || scoreAway !== finalAway) {
      return res.status(200).json({ available: false, reason: "Maçın tamamlanmış durumu ve skoru doğrulanamadı." });
    }

    const allStats = collectStats(statisticsPayload, ["ALL", "TOTAL"]);
    const firstStats = collectStats(statisticsPayload, ["1ST", "FIRST", "1H"]);
    const allCorners = findStat(allStats, [/corner kicks?/, /corners/]);
    const firstCorners = findStat(firstStats, [/corner kicks?/, /corners/]);

    const incidents = Array.isArray(incidentsPayload?.incidents) ? incidentsPayload.incidents : [];
    let yellow = 0, red = 0;
    for (const incident of incidents) {
      const incidentType = String(incident?.incidentType || incident?.type || "").toLowerCase();
      if (incidentType !== "card" || incident?.rescinded === true) continue;
      const cardClass = String(incident?.incidentClass || incident?.class || incident?.card || "").toLowerCase();
      if (cardClass.includes("yellowred") || cardClass.includes("yellow_red") || cardClass.includes("red")) red++;
      else if (cardClass.includes("yellow")) yellow++;
    }
    const statYellow = findStat(allStats, [/yellow cards?/]);
    const statRed = findStat(allStats, [/red cards?/]);
    if (statYellow) yellow = statYellow.home + statYellow.away;
    if (statRed) red = statRed.home + statRed.away;

    const goalEvents = incidents.filter((incident: any) =>
      String(incident?.incidentType || incident?.type || "").toLowerCase() === "goal" && incident?.isHome != null
    ).sort((a: any, b: any) =>
      Number(a.minute || 0) - Number(b.minute || 0) ||
      Number(a.addedTime || a.added_time || 0) - Number(b.addedTime || b.added_time || 0)
    );
    let firstGoal: "home" | "away" | "none" | null = null;
    if (goalEvents.length) {
      const first = goalEvents[0];
      const goalClass = String(first.incidentClass || first.goalType || "").toLowerCase();
      const isOwnGoal = first.ownGoal === true || goalClass.includes("own");
      const scoringHome = isOwnGoal ? !Boolean(first.isHome) : Boolean(first.isHome);
      firstGoal = scoringHome ? "home" : "away";
    } else if (finalHome === 0 && finalAway === 0) {
      firstGoal = "none";
    }

    const corners = allCorners ? {
      home: allCorners.home,
      away: allCorners.away,
      ...(firstCorners ? { firstHalfHome: firstCorners.home, firstHalfAway: firstCorners.away } : {})
    } : null;
    const hasIncidentTimeline = Array.isArray(incidentsPayload?.incidents) && incidentsPayload.incidents.length > 0;
    const cards = hasIncidentTimeline || statYellow || statRed ? { yellow, red, total: yellow + red } : null;
    const facts = {
      eventId,
      ...(corners ? { corners } : {}),
      ...(cards ? { cards } : {}),
      ...(firstGoal != null ? { firstGoal } : {})
    };
    return res.status(200).json({
      available: Boolean(corners || cards || firstGoal != null),
      ...facts
    });
  } catch (error) {
    return res.status(502).json({
      available: false,
      error: error instanceof Error ? error.message : "Maç olay verileri alınamadı."
    });
  }
}
