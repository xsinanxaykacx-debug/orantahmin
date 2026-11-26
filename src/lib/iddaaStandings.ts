export type StandingsMode = "total" | "home" | "away";

const first = (...values: any[]) => values.find(value => value !== undefined && value !== null && value !== "");

const MODE_KEYS: Record<StandingsMode, string[]> = {
  total: ["total", "overall", "stats", "_total", "_overall"],
  home: ["home", "homestats", "homeStats", "_home", "_homestats"],
  away: ["away", "awaystats", "awayStats", "_away", "_awaystats"]
};

export function readStandingsStat(row: any, mode: StandingsMode, aliases: string[], localized?: string): any {
  const nested = first(...MODE_KEYS[mode].map(key => row?.[key]));
  const groups = nested && typeof nested === "object" ? [nested, row] : [row];
  const keys = [...aliases, ...aliases.map(key => "_" + key)];
  for (const group of groups) {
    const value = first(...keys.map(key => group?.[key]), localized ? group?.[localized] : undefined);
    if (value !== undefined) return value;
  }
  return undefined;
}

export function readStandingsGoals(row: any, mode: StandingsMode): [any, any] {
  const nested = first(...MODE_KEYS[mode].map(key => row?.[key]));
  const groups = nested && typeof nested === "object" ? [nested, row] : [row];
  for (const group of groups) {
    const raw = String(first(group?.["AG:YG"], group?.goals, group?.goalsForAgainst, group?._goals, "") ?? "");
    const match = raw.match(/(-?\\d+)\\s*:\\s*(-?\\d+)/);
    if (match) return [match[1], match[2]];
    const scored = first(group?.goalsfor, group?.goals_for, group?._goalsfor, group?._goals_for, group?.gf);
    const conceded = first(group?.goalsagainst, group?.goals_against, group?.goalsconceded, group?._goalsagainst, group?._goals_against, group?._goalsconceded, group?.ga);
    if (scored !== undefined || conceded !== undefined) return [scored, conceded];
  }
  return [undefined, undefined];
}

export function readStandingsPosition(row: any, fallback: number): any {
  return first(row?.position, row?.pos, row?.rank, row?._position, row?._pos, row?._rank, fallback);
}
