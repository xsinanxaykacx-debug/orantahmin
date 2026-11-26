export type StandingsMode = "total" | "home" | "away";

export function readStandingsRows(data: any, mode: StandingsMode): any[] {
  const tables = Array.isArray(data?.season?.tables) ? data.season.tables : Array.isArray(data?.tables) ? data.tables : [];
  const getRows = (table: any) => Array.isArray(table?.tablerows) ? table.tablerows : Array.isArray(table?.rows) ? table.rows : [];
  const patterns: Record<StandingsMode, RegExp> = {
    total: /total|overall|toplam/i,
    home: /home|home.?team|ev sahibi|iç saha/i,
    away: /away|away.?team|deplasman/i
  };
  const selected = tables.find((table: any) => patterns[mode].test(String(table?.name ?? table?.tabletype ?? table?.type ?? "")));
  if (selected && getRows(selected).length) return getRows(selected);
  // Gismo's live season_dynamictable response normally contains one table.
  // Its rows include total, home and away fields together.
  const fallback = tables.find((table: any) => getRows(table).length);
  if (fallback) return getRows(fallback);
  if (mode === "total") return Array.isArray(data?.tablerows) ? data.tablerows : Array.isArray(data?.dynamicTable?.rows) ? data.dynamicTable.rows : Array.isArray(data?.rows) ? data.rows : [];
  return [];
}

const first = (...values: any[]) => values.find(value => value !== undefined && value !== null && value !== "");

const MODE_KEYS: Record<StandingsMode, string[]> = {
  total: ["total", "overall", "stats", "_total", "_overall", "_stats"],
  home: ["home", "homestats", "homeStats", "_home", "_homestats"],
  away: ["away", "awaystats", "awayStats", "_away", "_awaystats"]
};

function gismoFieldKeys(alias: string, mode: StandingsMode): string[] {
  const suffix = mode === "total" ? "Total" : mode === "home" ? "Home" : "Away";
  const key = alias.replace(/^_/, "").toLowerCase().replace(/[^a-z]/g, "");
  const fields: Record<string, string[]> = {
    played: [mode === "total" ? "total" : mode],
    matches: [mode === "total" ? "total" : mode],
    matchplayed: [mode === "total" ? "total" : mode],
    won: ["win" + suffix],
    wins: ["win" + suffix],
    win: ["win" + suffix],
    drawn: ["draw" + suffix],
    draws: ["draw" + suffix],
    draw: ["draw" + suffix],
    lost: ["loss" + suffix],
    losses: ["loss" + suffix],
    loss: ["loss" + suffix],
    goalsdiff: ["goalDiff" + suffix],
    goaldifference: ["goalDiff" + suffix],
    goaldiff: ["goalDiff" + suffix],
    points: ["points" + suffix],
    pts: ["points" + suffix],
    goalsfor: ["goalsFor" + suffix],
    goalsagainst: ["goalsAgainst" + suffix],
    goalsconceded: ["goalsAgainst" + suffix]
  };
  return fields[key] || [];
}

export function readStandingsStat(row: any, mode: StandingsMode, aliases: string[], localized?: string): any {
  const nested = first(...MODE_KEYS[mode].map(key => row?.[key]));
  const groups = nested && typeof nested === "object" ? [nested, row] : [row];
  const mappedKeys = aliases.flatMap(alias => gismoFieldKeys(alias, mode));
  const keys = [...mappedKeys, ...aliases, ...aliases.map(key => "_" + key.replace(/^_/, ""))];
  for (const group of groups) {
    const value = first(...keys.map(key => group?.[key]), localized ? group?.[localized] : undefined);
    if (value !== undefined) return value;
  }
  return undefined;
}

export function readStandingsGoals(row: any, mode: StandingsMode): [any, any] {
  const nested = first(...MODE_KEYS[mode].map(key => row?.[key]));
  const groups = nested && typeof nested === "object" ? [nested, row] : [row];
  const suffix = mode === "total" ? "Total" : mode === "home" ? "Home" : "Away";
  for (const group of groups) {
    const raw = String(first(group?.["AG:YG"], group?.goals, group?.goalsForAgainst, group?._goals, "") ?? "");
    const match = raw.match(/(-?\d+)\s*:\s*(-?\d+)/);
    if (match) return [match[1], match[2]];
    const scored = first(group?.["goalsFor" + suffix], group?.goalsfor, group?.goals_for, group?._goalsfor, group?._goals_for, group?.gf);
    const conceded = first(group?.["goalsAgainst" + suffix], group?.goalsagainst, group?.goals_against, group?.goalsconceded, group?._goalsagainst, group?._goals_against, group?._goalsconceded, group?.ga);
    if (scored !== undefined || conceded !== undefined) return [scored, conceded];
  }
  return [undefined, undefined];
}

export function readStandingsPosition(row: any, fallback: number, mode: StandingsMode = "total"): any {
  const modePosition = mode === "home" ? first(row?.posHome, row?.positionHome, row?._posHome) : mode === "away" ? first(row?.posAway, row?.positionAway, row?._posAway) : undefined;
  return first(modePosition, row?.position, row?.pos, row?.rank, row?._position, row?._pos, row?._rank, fallback);
}
