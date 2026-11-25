import type {
  BulletinDocument,
  Match,
  MatchFilters
} from "../types/match";

type BulletinPayload = BulletinDocument | BulletinDocument[];

const DATA_URL = "/data/mackolik-bulletin.json";

function normalizeBulletin(payload: BulletinPayload): BulletinDocument {
  const bulletin = Array.isArray(payload) ? payload[0] : payload;

  if (
    !bulletin ||
    !bulletin.meta ||
    !Array.isArray(bulletin.matches)
  ) {
    throw new Error("Maçkolik JSON formatı geçersiz.");
  }

  return bulletin;
}

export const OddsService = {
  async getBulletin(): Promise<BulletinDocument> {
    const response = await fetch(DATA_URL, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? "Maçkolik bülten dosyası henüz bulunamadı."
          : `Bülten yüklenemedi: HTTP ${response.status}`
      );
    }

    const payload = (await response.json()) as BulletinPayload;

    return normalizeBulletin(payload);
  },

  filterMatches(
    matches: Match[],
    filters: MatchFilters
  ): Match[] {
    const teamQuery = filters.team?.trim().toLocaleLowerCase("tr-TR");

    return matches.filter((match) => {
      if (
        filters.status &&
        filters.status !== "all" &&
        match.status !== filters.status
      ) {
        return false;
      }

      if (
        filters.league &&
        filters.league !== "all" &&
        match.league.code !== filters.league
      ) {
        return false;
      }

      if (
        teamQuery &&
        !match.home_team.toLocaleLowerCase("tr-TR").includes(teamQuery) &&
        !match.away_team.toLocaleLowerCase("tr-TR").includes(teamQuery)
      ) {
        return false;
      }

      return true;
    });
  }
};