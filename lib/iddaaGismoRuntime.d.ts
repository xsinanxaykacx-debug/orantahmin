export const IDDAA_CLIENT_ID: string;
export const IDDAA_SEASON_ID: number;
export const IDDAA_UNIQUE_TOURNAMENT_ID: number;
export function fetchIddaaFeed(feed: string, params: string | number): Promise<any>;
export function fetchIddaaUpcomingFixtures(seasonId?: number): Promise<any>;
export function resetIddaaTokenCacheForTests(): void;
