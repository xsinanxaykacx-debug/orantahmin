import type { MatchOdds } from "./odds";
import type { MatchStats } from "./statistics";

export type MatchStatus =
  | "scheduled"
  | "live"
  | "finished"
  | "postponed"
  | "cancelled";

export interface MatchLeague {
  code: string;
  name: string;
  country: string | null;
}

export interface MatchScore {
  home: number | null;
  away: number | null;
}

export interface Match {
  id: string;
  external_id: string;
  league: MatchLeague;
  kickoff: string;
  status: MatchStatus;
  minute: number | null;
  score: MatchScore | null;
  home_team: string;
  away_team: string;
  odds: MatchOdds | null;
  stats: MatchStats | null;
}

export interface BulletinMeta {
  source: "mackolik" | string;
  fetched_at: string;
  bulletin_date: string;
  version: string;
}

export interface BulletinDocument {
  meta: BulletinMeta;
  matches: Match[];
}

export interface MatchFilters {
  status?: MatchStatus | "all";
  league?: string;
  team?: string;
}