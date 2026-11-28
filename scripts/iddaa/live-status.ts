export type IddaaLiveMatch = {
  eventId: string;
  status: number;
  rawStatus: number;
  homeScore: string | null;
  awayScore: string | null;
  minute: string | null;
};

const LIVE_STATUS_CODES = new Set([2, 3, 4, 11, 12, 49]);

function scoreValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 ? String(score) : null;
}

export function normalizeIddaaLiveResults(payload: any): IddaaLiveMatch[] {
  if (payload?.isSuccess !== true) {
    throw new Error("İddaa canlı sonuç servisi isSuccess=true döndürmedi.");
  }
  const scores = payload?.data?.sc;
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) return [];

  const matches: IddaaLiveMatch[] = [];
  for (const [eventId, value] of Object.entries(scores) as Array<[string, any]>) {
    const rawStatus = Number(value?.s);
    const finished = rawStatus === 6;
    const live = LIVE_STATUS_CODES.has(rawStatus);
    if (!finished && !live) continue;

    const minuteValue = value?.min;
    matches.push({
      eventId,
      status: finished ? 4 : 1,
      rawStatus,
      homeScore: scoreValue(value?.ht?.c),
      awayScore: scoreValue(value?.at?.c),
      minute: live && minuteValue != null && Number.isFinite(Number(minuteValue))
        ? `${Number(minuteValue)}'`
        : null
    });
  }
  return matches;
}
