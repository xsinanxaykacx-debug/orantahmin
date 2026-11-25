export function isValidOdds(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function uniqueOdds(values: unknown[]): number[] {
  return [...new Set(values.filter(isValidOdds))];
}

export function hasMarketOdds(values: unknown[]): boolean {
  return values.some(isValidOdds);
}

export function isUnverifiedHandicap(fields: Record<string, unknown>): boolean {
  return Boolean(fields.marketHandicapMs) &&
    ![fields.handicapMs1, fields.handicapMsX, fields.handicapMs2].some(isValidOdds);
}

export function dedupeByMatchId<T extends { matchId: string | number }>(
  records: T[]
): Array<T & { sourceRecords: T[] }> {
  const grouped = new Map<string, T[]>();
  for (const record of records) {
    const key = String(record.matchId);
    const group = grouped.get(key);
    if (group) group.push(record);
    else grouped.set(key, [record]);
  }
  return [...grouped.values()].map((sourceRecords) => ({
    ...sourceRecords[0],
    sourceRecords
  }));
}
