export function getIstanbulDateKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function getIstanbulDateKeyFromEpoch(epochSeconds: unknown): string | null {
  const epoch = Number(epochSeconds);
  if (!Number.isFinite(epoch) || epoch <= 0) return null;
  return getIstanbulDateKey(new Date(epoch * 1000));
}

export function filterIddaaEventsForDate<T extends { sid?: unknown; d?: unknown }>(
  events: T[],
  dateKey: string,
): T[] {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dateKey)) {
    throw new Error(`Geçersiz Türkiye tarihi: ${dateKey}`);
  }
  return events.filter((event) =>
    Number(event.sid) !== 1 || getIstanbulDateKeyFromEpoch(event.d) === dateKey,
  );
}
