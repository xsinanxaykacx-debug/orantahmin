export type BulletinMatch = {
  matchId: string | number | null;
  homeName?: string | null;
  awayName?: string | null;
  date?: string | null;
  time?: string | null;
  fields?: Record<string, unknown>;
};

export type FotMobFixture = {
  id: number;
  date: string;
  home: string;
  away: string;
  league: string;
  status?: unknown;
  time?: unknown;
};

type MatchState =
  | "matched"
  | "ambiguous"
  | "unmatched"
  | "invalid_bulletin_team"
  | "invalid_bulletin_date";

type RankedCandidate = {
  fixture: FotMobFixture;
  homeScore: number;
  awayScore: number;
  score: number;
};

const MATCH_THRESHOLD = 0.76;
const TEAM_THRESHOLD = 0.58;
const AMBIGUITY_GAP = 0.055;

const requestHeaders = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36",
  Referer: "https://www.fotmob.com/",
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function similarity(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;

  if (x.startsWith(y) || y.startsWith(x)) {
    return (
      (Math.min(x.length, y.length) / Math.max(x.length, y.length)) * 0.18 +
      0.78
    );
  }

  const leftTokens = x.split(" ");
  const rightTokens = y.split(" ");
  const tokenScore =
    leftTokens.filter((token) => rightTokens.includes(token)).length /
    Math.max(leftTokens.length, rightTokens.length);

  const previous = Array.from({ length: y.length + 1 }, (_, index) => index);
  for (let i = 1; i <= x.length; i++) {
    const current = [i];
    for (let j = 1; j <= y.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= y.length; j++) previous[j] = current[j];
  }

  const editScore =
    1 - previous[y.length] / Math.max(x.length, y.length);
  return Math.max(editScore, tokenScore * 0.88);
}

export function toFotMobDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${match[3]}${match[2]}${match[1]}`;
}

export function getFotMobDates(rows: BulletinMatch[]): string[] {
  return [
    ...new Set(
      rows
        .map((row) => toFotMobDate(row.date))
        .filter((date): date is string => date !== null),
    ),
  ];
}

function ageMarkers(value: string): string[] {
  return [...value.matchAll(/U\s*(17|18|19|20|21|23)\b/gi)].map(
    (match) => `U${match[1]}`.toUpperCase(),
  );
}

function categoryTags(
  home: string,
  away: string,
  leagueOrCode: string,
  isFotMob: boolean,
): Set<string> {
  const combined = `${home} ${away} ${leagueOrCode}`;
  const tags = new Set<string>();

  for (const age of ageMarkers(combined)) tags.add(age);
  if ([...tags].some((tag) => /^U\d+$/.test(tag))) tags.add("youth");
  if (/\b(women|woman|ladies|femenino|feminin|femmes)\b/i.test(combined)) {
    tags.add("women");
  }
  if (/\b(reserves?|second team|b team|ii)\b/i.test(combined)) {
    tags.add("reserve");
  }
  if (/\bfutsal\b/i.test(combined)) tags.add("futsal");

  if (
    (isFotMob && /\byouth\b/i.test(leagueOrCode)) ||
    (!isFotMob && /UEGL/i.test(leagueOrCode))
  ) {
    tags.add("youth");
  }

  return tags;
}

function compatibleCategories(
  row: BulletinMatch,
  fixture: FotMobFixture,
): boolean {
  const sourceTags = categoryTags(
    row.homeName || "",
    row.awayName || "",
    String(row.fields?.leagueCode || ""),
    false,
  );
  const fixtureTags = categoryTags(
    fixture.home,
    fixture.away,
    fixture.league,
    true,
  );

  for (const tag of sourceTags) {
    if (!fixtureTags.has(tag)) return false;
  }

  for (const tag of fixtureTags) {
    if (tag === "youth" && !sourceTags.has("youth")) return false;
    if (tag === "women" || tag === "reserve" || tag === "futsal") {
      if (!sourceTags.has(tag)) return false;
    }
  }

  const sourceAges = [...sourceTags].filter((tag) => /^U\d+$/.test(tag));
  const fixtureAges = [...fixtureTags].filter((tag) => /^U\d+$/.test(tag));
  if (sourceAges.length && sourceAges.some((age) => !fixtureAges.includes(age))) {
    return false;
  }

  return true;
}

function normalizeLeagueKey(league: string): string {
  return normalize(league)
    .replace(/\b(?:group|grp)\s+[a-z0-9]+\b/g, "")
    .replace(/\s+[a-h]$/, "")
    .trim();
}

function sourceGroupKey(row: BulletinMatch): string | null {
  const groupId = row.fields?.groupId;
  const subgroupId = row.fields?.subgroupId;
  if (groupId === null || groupId === undefined || subgroupId === null || subgroupId === undefined) {
    return null;
  }
  return String(groupId) + "/" + String(subgroupId);
}

function rankCandidates(
  row: BulletinMatch,
  fixtures: FotMobFixture[],
  expectedLeagueKey?: string,
): RankedCandidate[] {
  const matchDate = toFotMobDate(row.date);
  if (!matchDate || !row.homeName || !row.awayName) return [];

  return fixtures
    .filter(
      (fixture) =>
        fixture.date === matchDate &&
        compatibleCategories(row, fixture) &&
        (!expectedLeagueKey || normalizeLeagueKey(fixture.league) === expectedLeagueKey),
    )
    .map((fixture) => {
      const homeScore = similarity(row.homeName!, fixture.home);
      const awayScore = similarity(row.awayName!, fixture.away);
      return {
        fixture,
        homeScore,
        awayScore,
        score: (homeScore + awayScore) / 2,
      };
    })
    .filter(
      (candidate) =>
        candidate.homeScore >= TEAM_THRESHOLD &&
        candidate.awayScore >= TEAM_THRESHOLD,
    )
    .sort((a, b) => b.score - a.score);
}

function inferGroupLeagueConsensus(
  rows: BulletinMatch[],
  fixtures: FotMobFixture[],
): Map<string, string> {
  const votes = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const groupKey = sourceGroupKey(row);
    if (!groupKey || !row.homeName || !row.awayName || !toFotMobDate(row.date)) {
      continue;
    }

    const ranked = rankCandidates(row, fixtures);
    const best = ranked[0];
    const second = ranked[1];
    if (!best || best.score < 0.93) continue;
    if (second && best.score - second.score < 0.08) continue;

    const leagueKey = normalizeLeagueKey(best.fixture.league);
    if (!leagueKey) continue;

    const groupVotes = votes.get(groupKey) || new Map<string, number>();
    groupVotes.set(leagueKey, (groupVotes.get(leagueKey) || 0) + 1);
    votes.set(groupKey, groupVotes);
  }

  const consensus = new Map<string, string>();
  for (const [groupKey, groupVotes] of votes) {
    const rankedVotes = [...groupVotes.entries()].sort((a, b) => b[1] - a[1]);
    const topVote = rankedVotes[0];
    if (!topVote) continue;
    const [topLeague, topCount] = topVote;
    const totalVotes = rankedVotes.reduce((sum, [, count]) => sum + count, 0);
    const secondCount = rankedVotes[1]?.[1] || 0;

    if (topCount >= 2 && topCount / totalVotes >= 0.8 && topCount > secondCount) {
      consensus.set(groupKey, topLeague);
    }
  }

  return consensus;
}

type InternalResult = {
  row: BulletinMatch;
  state: MatchState;
  confidence: number;
  leagueMatch: "group_consensus" | "unverified";
  selected?: FotMobFixture;
  candidates?: RankedCandidate[];
};

export function matchBulletinToFotMob(
  rows: BulletinMatch[],
  fixtures: FotMobFixture[],
) {
  const groupLeagueConsensus = inferGroupLeagueConsensus(rows, fixtures);
  const internal: InternalResult[] = rows.map((row) => {
    const expectedLeague = groupLeagueConsensus.get(sourceGroupKey(row) || "");
    const leagueMatch = expectedLeague ? "group_consensus" : "unverified";

    if (!row.homeName || !row.awayName) {
      return { row, state: "invalid_bulletin_team", confidence: 0, leagueMatch };
    }
    if (!toFotMobDate(row.date)) {
      return { row, state: "invalid_bulletin_date", confidence: 0, leagueMatch };
    }

    const ranked = rankCandidates(row, fixtures, expectedLeague);
    const best = ranked[0];
    const second = ranked[1];

    if (!best || best.score < MATCH_THRESHOLD) {
      return {
        row,
        state: "unmatched",
        confidence: best ? Number(best.score.toFixed(3)) : 0,
        leagueMatch,
        candidates: best ? [best] : [],
      };
    }

    if (second && best.score - second.score < AMBIGUITY_GAP) {
      return {
        row,
        state: "ambiguous",
        confidence: Number(best.score.toFixed(3)),
        leagueMatch,
        candidates: ranked.slice(0, 2),
      };
    }

    return {
      row,
      state: "matched",
      confidence: Number(best.score.toFixed(3)),
      leagueMatch,
      selected: best.fixture,
    };
  });

  const selectedByFixture = new Map<number, number[]>();
  internal.forEach((result, index) => {
    if (result.state !== "matched" || !result.selected) return;
    const indices = selectedByFixture.get(result.selected.id) || [];
    indices.push(index);
    selectedByFixture.set(result.selected.id, indices);
  });

  for (const indices of selectedByFixture.values()) {
    if (indices.length < 2) continue;
    for (const index of indices) {
      const result = internal[index];
      const collisionFixture = result.selected!;
      result.state = "ambiguous";
      result.candidates = [
        {
          fixture: collisionFixture,
          homeScore: 1,
          awayScore: 1,
          score: result.confidence,
        },
      ];
      result.selected = undefined;
    }
  }

  return internal.map(({ row, state, confidence, leagueMatch, selected, candidates }) => {
    const leagueCode = String(row.fields?.leagueCode || "");
    const base = {
      iddaaEventId:
        row.matchId === null || row.matchId === undefined
          ? null
          : String(row.matchId),
      homeName: row.homeName || null,
      awayName: row.awayName || null,
      date: row.date || null,
      time: row.time || null,
      state,
      confidence,
      fotmobMatchId: state === "matched" ? selected?.id ?? null : null,
      fotmobHome: state === "matched" ? selected?.home ?? null : null,
      fotmobAway: state === "matched" ? selected?.away ?? null : null,
      league: state === "matched" ? selected?.league ?? null : null,
      leagueCode,
      groupId: row.fields?.groupId ?? null,
      subgroupId: row.fields?.subgroupId ?? null,
      leagueMatch,
      lineupAvailable: false,
      homeStarters: null,
      awayStarters: null,
      homeBench: null,
      awayBench: null,
    };

    if (state === "ambiguous") {
      return {
        ...base,
        candidates: (candidates || []).map((candidate) => ({
          fotmobMatchId: candidate.fixture.id,
          home: candidate.fixture.home,
          away: candidate.fixture.away,
          league: candidate.fixture.league,
          confidence: Number(candidate.score.toFixed(3)),
        })),
      };
    }

    if (state === "unmatched" && candidates?.[0]) {
      return {
        ...base,
        candidate: {
          fotmobMatchId: candidates[0].fixture.id,
          home: candidates[0].fixture.home,
          away: candidates[0].fixture.away,
          league: candidates[0].fixture.league,
        },
      };
    }

    return base;
  });
}

export function createFotMobEventMap(
  rows: BulletinMatch[],
  fixtures: FotMobFixture[],
) {
  const matches = matchBulletinToFotMob(rows, fixtures);
  const summary = {
    bulletinRows: rows.length,
    fixtureRows: fixtures.length,
    matched: matches.filter((match) => match.state === "matched").length,
    unmatched: matches.filter((match) => match.state === "unmatched").length,
    ambiguous: matches.filter((match) => match.state === "ambiguous").length,
    invalidBulletinTeam: matches.filter(
      (match) => match.state === "invalid_bulletin_team",
    ).length,
    invalidBulletinDate: matches.filter(
      (match) => match.state === "invalid_bulletin_date",
    ).length,
    leagueGroupVerified: matches.filter(
      (match) => match.leagueMatch === "group_consensus",
    ).length,
    lineupAvailable: 0,
    bothTeamsStartingXI: 0,
    bothTeamsBench: 0,
  };

  return {
    source: "Mackolik 61-field bulletin + FotMob",
    generatedAt: new Date().toISOString(),
    summary,
    matches,
  };
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        output[index] = await fn(items[index]);
      }
    }),
  );
  return output;
}

export async function fetchFotMobFixtures(
  dates: string[],
  fetcher: typeof fetch = fetch,
): Promise<FotMobFixture[]> {
  const uniqueDates = [...new Set(dates)];
  const fixtureSets = await mapLimit(uniqueDates, 3, async (date) => {
    const response = await fetcher(
      `https://www.fotmob.com/api/data/matches?date=${encodeURIComponent(date)}`,
      {
        headers: requestHeaders,
        signal: AbortSignal.timeout(15000),
      },
    );
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.toLowerCase().includes("json")) {
      throw new Error(
        `FotMob HTTP ${response.status} (${contentType || "no content-type"}) for ${date}`,
      );
    }

    const data = (await response.json()) as {
      leagues?: Array<{
        name?: string;
        matches?: Array<{
          id?: number | string;
          home?: { name?: string };
          away?: { name?: string };
          status?: unknown;
          time?: unknown;
        }>;
      }>;
    };

    if (!Array.isArray(data.leagues)) {
      throw new Error(`FotMob response has no leagues array for ${date}`);
    }

    return data.leagues.flatMap((league) =>
      (league.matches || []).flatMap((match) => {
        const id = Number(match.id);
        const home = match.home?.name;
        const away = match.away?.name;
        if (!Number.isSafeInteger(id) || id <= 0 || !home || !away) return [];
        return [
          {
            id,
            date,
            home,
            away,
            league: league.name || "",
            status: match.status,
            time: match.time,
          },
        ];
      }),
    );
  });

  return [...new Map(fixtureSets.flat().map((fixture) => [fixture.id, fixture])).values()];
}
