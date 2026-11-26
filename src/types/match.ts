export interface BulletinMeta {
  sourceFile: string;
  sourceProvider?: "iddaa";
  generatedAt: string;
  schemaVersion: string;
  sourceFieldCount: number;
  sourceMatchCount: number;
  includedMatchCount: number;
  rejectedMatchCount: number;
  warningCount: number;
}

export interface MatchFields {
  matchId: number;
  homeName: string | null;
  awayName: string | null;
  homeId: number | string;
  awayId: number | string;
  status: number;
  time: string;
  date: string;
  scoreHome: string | null;
  scoreAway: string | null;
  leagueCode: string | null;
  groupId: string | null;
  subgroupId: string | null;
  ms1: number | null;
  msX: number | null;
  ms2: number | null;
  doubleChance1X: number | null;
  doubleChance12: number | null;
  doubleChanceX2: number | null;
  goals25Under: number | null;
  goals25Over: number | null;
  totalGoals01: number | null;
  totalGoals23: number | null;
  totalGoals46: number | null;
  totalGoals7Plus: number | null;
  halfTimeResult1: number | null;
  halfTimeResultX: number | null;
  halfTimeResult2: number | null;
  bttsYes: number | null;
  bttsNo: number | null;
  halfTimeGoals15Under: number | null;
  halfTimeGoals15Over: number | null;
  goals15Under: number | null;
  goals15Over: number | null;
  goals35Under: number | null;
  goals35Over: number | null;
  marketMs: string | null;
  marketDoubleChance: string | null;
  marketGoals25: string | null;
  marketHalfTimeResult: string | null;
  marketTotalGoals: string | null;
  marketBtts: string | null;
  marketHandicapMs: string | null;
  marketGoals15: string | null;
  marketGoals35: string | null;
  marketHalfTimeGoals15: string | null;
  [key: string]: unknown;
}

export interface BulletinWarning {
  code: string;
  message: string;
  matchId: string;
  sourceGroup: number;
  sourceIndex: number;
}

export interface BulletinMatch {
  matchId: string | number;
  homeName: string | null;
  awayName: string | null;
  date: string;
  time: string;
  status: number;
  fields: MatchFields;
  /** Optional legacy projection; complete provider markets live in fields.iddaaMarkets. */
  raw?: unknown[];
  source: {
    groupIndex: number;
    matchIndex: number;
  };
}

export interface BulletinDocument {
  meta: BulletinMeta;
  matches: BulletinMatch[];
  diagnostics: {
    handicapMarketIdMatchCount: number;
    warningCounts: Record<string, number>;
    warnings: BulletinWarning[];
  };
}

/** UI-only sections. Provider market data is dynamically sized. */
export type MatchDetailTab =
  | "overview"
  | "odds"
  | "squad"
  | "ai";
