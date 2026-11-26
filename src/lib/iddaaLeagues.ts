export type IddaaLeague = {
  id: number;
  name: string;
  country: string;
  seasonId: number;
  uniqueTournamentId: number;
  seasonName: string;
  slug: string;
};

export const IDDAA_LEAGUES: IddaaLeague[] = [
  { id: 52, name: "Türkiye Süper Lig", country: "Türkiye", seasonId: 143916, uniqueTournamentId: 52, seasonName: "Süper Lig 26/27", slug: "turkiye-super-lig" },
  { id: 98, name: "Türkiye 1. Lig", country: "Türkiye", seasonId: 143948, uniqueTournamentId: 98, seasonName: "1. Lig 26/27", slug: "turkiye-1-lig" },
  { id: 17, name: "İngiltere Premier Lig", country: "İngiltere", seasonId: 140756, uniqueTournamentId: 17, seasonName: "Premier Lig 26/27", slug: "ingiltere-premier-lig" },
  { id: 8, name: "İspanya La Liga", country: "İspanya", seasonId: 142176, uniqueTournamentId: 8, seasonName: "La Liga 26/27", slug: "ispanya-la-liga" }
];

export function getIddaaLeague(id: number): IddaaLeague | undefined {
  return IDDAA_LEAGUES.find(league => league.id === id);
}
