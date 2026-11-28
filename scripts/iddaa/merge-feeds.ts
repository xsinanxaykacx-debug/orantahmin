type RawEvent = Record<string, any>;

export function extractIddaaEvents(response: any): RawEvent[] {
  const data = response?.data;
  const roots = Array.isArray(data) ? data : [data];
  const grouped = roots.flatMap((root: any) =>
    Array.isArray(root?.events) ? root.events : []
  );
  if (grouped.length) return grouped;
  return roots.filter((row: any) =>
    row && typeof row === "object" && row.i != null && row.sid != null
  );
}

function extractScoreMap(response: any): Record<string, any> {
  const data = response?.data;
  const roots = [response, ...(Array.isArray(data) ? data : [data])];
  const scores: Record<string, any> = {};
  for (const root of roots) {
    if (root?.sc && typeof root.sc === "object") {
      Object.assign(scores, root.sc);
    }
  }
  return scores;
}

export function mergeIddaaEventFeeds(responses: any[]): RawEvent[] {
  const merged = new Map<string, RawEvent>();

  for (const response of responses) {
    const scores = extractScoreMap(response);
    for (const event of extractIddaaEvents(response)) {
      if (event?.i == null) continue;
      const id = String(event.i);
      const previous = merged.get(id);

      if (!previous) {
        merged.set(id, {
          ...event,
          ...(scores[id] ? { liveScore: scores[id] } : {})
        });
        continue;
      }

      const previousMarkets = Array.isArray(previous.m) ? previous.m : [];
      const incomingMarkets = Array.isArray(event.m) ? event.m : [];
      const preferredMarkets = incomingMarkets.length >= previousMarkets.length
        ? incomingMarkets
        : previousMarkets;
      const next: RawEvent = { ...previous, ...event, m: preferredMarkets };

      // A live state from any feed must not be overwritten by a stale pre-match row.
      if (Number(previous.s) === 1 || Number(event.s) === 1) next.s = 1;
      if (!(Number(event.d) > 0) && Number(previous.d) > 0) next.d = previous.d;

      const liveScore = scores[id] || previous.liveScore;
      if (liveScore) next.liveScore = liveScore;
      merged.set(id, next);
    }
  }

  return [...merged.values()];
}
