type Req = { method?: string; query: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): Res };

const fotmobHeaders = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36",
  Referer: "https://www.fotmob.com/"
};
const sofaHeaders = {
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
  const a = normalizeTeam(left);
  const b = normalizeTeam(right);
  if (!a || !b) return 0;
  if (a === b || a.includes(b) || b.includes(a)) return 1;
  const aa = new Set(a.split(" "));
  const bb = new Set(b.split(" "));
  const common = [...aa].filter(token => bb.has(token)).length;
  return common / Math.max(aa.size, bb.size);
}
async function fetchJson(url: string, headers: Record<string, string>) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function getSofaScoreHalfTime(date: string, homeName: string, awayName: string, finalHome: number, finalAway: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !homeName || !awayName) return null;
  try {
    const payload = await fetchJson(`https://www.sofascore.com/api/v1/sport/football/scheduled-events/${date}`, sofaHeaders);
    const candidates = (payload?.events || []).map((event: any) => ({
      event,
      homeScore: teamSimilarity(homeName, event?.homeTeam?.name || ""),
      awayScore: teamSimilarity(awayName, event?.awayTeam?.name || "")
    })).filter((item: any) => item.homeScore >= 0.75 && item.awayScore >= 0.75)
      .sort((a: any, b: any) => (b.homeScore + b.awayScore) - (a.homeScore + a.awayScore));
    const best = candidates[0];
    const second = candidates[1];
    if (!best || (second && (best.homeScore + best.awayScore) - (second.homeScore + second.awayScore) < 0.12)) return null;

    const eventId = Number(best.event?.id);
    if (!Number.isSafeInteger(eventId) || eventId <= 0) return null;
    const detail = await fetchJson(`https://www.sofascore.com/api/v1/event/${eventId}`, sofaHeaders);
    const event = detail?.event;
    const score = event?.homeScore && event?.awayScore ? event : best.event;
    const scoreHome = Number(score?.homeScore?.current);
    const scoreAway = Number(score?.awayScore?.current);
    const firstHome = Number(score?.homeScore?.period1);
    const firstAway = Number(score?.awayScore?.period1);
    if (scoreHome !== finalHome || scoreAway !== finalAway ||
        !Number.isInteger(firstHome) || !Number.isInteger(firstAway) ||
        firstHome < 0 || firstAway < 0 || firstHome > finalHome || firstAway > finalAway) return null;
    return { firstHalfHomeScore: firstHome, firstHalfAwayScore: firstAway };
  } catch {
    return null;
  }
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const matchId = queryValue(req.query, "matchId");
  if (!matchId || !/^\d{5,12}$/.test(matchId)) {
    return res.status(400).json({ error: "Geçersiz FotMob maç kimliği." });
  }

  const date = queryValue(req.query, "date");
  const homeName = queryValue(req.query, "home");
  const awayName = queryValue(req.query, "away");

  try {
    const response = await fetch(`https://www.fotmob.com/api/data/matchDetails?matchId=${encodeURIComponent(matchId)}`, {
      headers: fotmobHeaders,
      signal: AbortSignal.timeout(15000)
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("json")) {
      return res.status(502).json({ error: `FotMob maç detayları alınamadı (HTTP ${response.status}).` });
    }

    const data = await response.json();
    const finished = Boolean(data?.general?.finished ?? data?.header?.status?.finished);
    if (!finished) return res.status(200).json({ available: false, finished: false });

    const events = data?.content?.matchFacts?.events?.events;
    const finalTeams = data?.header?.teams || [];
    const finalHome = Number(finalTeams[0]?.score);
    const finalAway = Number(finalTeams[1]?.score);

    if (Number.isFinite(finalHome) && Number.isFinite(finalAway) && Array.isArray(events)) {
      let firstHome = 0;
      let firstAway = 0;
      let allHome = 0;
      let allAway = 0;
      let validEventData = true;

      for (const event of events) {
        const eventType = String(event?.type || event?.eventType || "").toLowerCase();
        if (eventType !== "goal" && event?.isGoal !== true) continue;
        if (event?.isPenaltyShootoutEvent === true) continue;

        const ownGoal = Boolean(event?.ownGoal);
        const isHome = typeof event?.isHome === "boolean" ? event.isHome :
          Number(event?.teamId) === Number(finalTeams[0]?.id);
        if (typeof event?.isHome !== "boolean" && !event?.teamId) {
          validEventData = false;
          break;
        }
        const scoringHome = ownGoal ? !isHome : isHome;
        if (scoringHome) allHome++;
        else allAway++;

        const halfLabel = String(event?.halfStrShort || event?.halfStrKey || event?.period || "").toLowerCase();
        const rawTime = String(event?.time ?? event?.timeStr ?? "");
        const minute = Number(rawTime.match(/^\d+/)?.[0]);
        const isFirstHalf = /first|1st|1h|firsthalf|first_half|ilk|1\. yari/.test(halfLabel) ||
          (!/second|2nd|2h|secondhalf|second_half|ikinci|2\. yari/.test(halfLabel) && Number.isFinite(minute) && minute <= 45);
        if (isFirstHalf) {
          if (scoringHome) firstHome++;
          else firstAway++;
        }
      }

      if (validEventData && allHome === finalHome && allAway === finalAway) {
        return res.status(200).json({
          source: "FotMob matchDetails goal events",
          available: true,
          finished: true,
          firstHalfHomeScore: firstHome,
          firstHalfAwayScore: firstAway
        });
      }
    }

    // Independent fallback: SofaScore period-1 score, matched by date and both team names,
    // then reconciled against the same final score before it is accepted.
    const fallback = await getSofaScoreHalfTime(date, homeName, awayName, finalHome, finalAway);
    if (fallback) return res.status(200).json({
      source: "SofaScore verified period score",
      available: true,
      finished: true,
      ...fallback
    });

    return res.status(200).json({ available: false, finished: true });
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : "İlk yarı skoru alınamadı."
    });
  }
}
