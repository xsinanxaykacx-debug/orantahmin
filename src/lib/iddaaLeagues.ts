export type IddaaLeague = {
  id: number;
  name: string;
  country: string;
  seasonId: number;
  uniqueTournamentId: number;
  seasonName: string;
  slug: string;
  hasStandings: boolean;
};

export const IDDAA_LEAGUES: IddaaLeague[] = [
  // İddaa ana sayfasındaki puan durumu bağlantıları
  { id: 52, name: "Türkiye Süper Lig", country: "Türkiye", seasonId: 143916, uniqueTournamentId: 52, seasonName: "Süper Lig 26/27", slug: "turkiye-super-lig", hasStandings: true },
  { id: 98, name: "Türkiye 1. Lig", country: "Türkiye", seasonId: 143948, uniqueTournamentId: 98, seasonName: "1. Lig 26/27", slug: "turkiye-1-lig", hasStandings: true },
  { id: 17, name: "İngiltere Premier Lig", country: "İngiltere", seasonId: 140756, uniqueTournamentId: 17, seasonName: "Premier Lig 26/27", slug: "ingiltere-premier-lig", hasStandings: true },
  { id: 8, name: "İspanya La Liga", country: "İspanya", seasonId: 142176, uniqueTournamentId: 8, seasonName: "La Liga 26/27", slug: "ispanya-la-liga", hasStandings: true },
  { id: 7, name: "UEFA Şampiyonlar Ligi", country: "Avrupa", seasonId: 140786, uniqueTournamentId: 7, seasonName: "Şampiyonlar Ligi 26/27", slug: "uefa-sampiyonlar-ligi", hasStandings: true },
  { id: 679, name: "UEFA Avrupa Ligi", country: "Avrupa", seasonId: 142776, uniqueTournamentId: 679, seasonName: "Avrupa Ligi 26/27", slug: "uefa-avrupa-ligi", hasStandings: true },
  { id: 34480, name: "UEFA Konferans Ligi", country: "Avrupa", seasonId: 142778, uniqueTournamentId: 34480, seasonName: "Konferans Ligi 26/27", slug: "uefa-konferans-ligi", hasStandings: true },
  { id: 23755, name: "UEFA Uluslar Ligi", country: "Avrupa", seasonId: 139802, uniqueTournamentId: 23755, seasonName: "Uluslar Ligi 26/27", slug: "uefa-uluslar-ligi", hasStandings: true },
  { id: 23, name: "İtalya Serie A", country: "İtalya", seasonId: 140782, uniqueTournamentId: 23, seasonName: "Serie A 26/27", slug: "italya-serie-a", hasStandings: true },
  { id: 35, name: "Almanya Bundesliga", country: "Almanya", seasonId: 140768, uniqueTournamentId: 35, seasonName: "Bundesliga 26/27", slug: "almanya-bundesliga", hasStandings: true },
  { id: 34, name: "Fransa Ligue 1", country: "Fransa", seasonId: 140780, uniqueTournamentId: 34, seasonName: "Ligue 1 26/27", slug: "fransa-ligue-1", hasStandings: true },

  // İddaa ana sayfasındaki fikstür bağlantıları
  { id: 238, name: "Portekiz Liga Portugal", country: "Portekiz", seasonId: 143496, uniqueTournamentId: 238, seasonName: "Liga Portugal 26/27", slug: "portekiz-liga-portugal", hasStandings: false },
  { id: 37, name: "Hollanda Eredivisie", country: "Hollanda", seasonId: 142628, uniqueTournamentId: 37, seasonName: "Eredivisie 26/27", slug: "hollanda-eredivisie", hasStandings: false },
  { id: 325, name: "Brezilya Serie A", country: "Brezilya", seasonId: 137706, uniqueTournamentId: 325, seasonName: "Serie A 2026", slug: "brezilya-serie-a", hasStandings: false },
  { id: 38, name: "Belçika Pro Lig", country: "Belçika", seasonId: 142844, uniqueTournamentId: 38, seasonName: "Pro Lig 26/27", slug: "belcika-pro-lig", hasStandings: false },
  { id: 18, name: "İngiltere Championship", country: "İngiltere", seasonId: 140810, uniqueTournamentId: 18, seasonName: "Championship 26/27", slug: "ingiltere-championship", hasStandings: false },
  { id: 44, name: "Almanya 2. Bundesliga", country: "Almanya", seasonId: 140770, uniqueTournamentId: 44, seasonName: "2. Bundesliga 26/27", slug: "almanya-2-bundesliga", hasStandings: false },
  { id: 182, name: "Fransa Ligue 2", country: "Fransa", seasonId: 142622, uniqueTournamentId: 182, seasonName: "Ligue 2 26/27", slug: "fransa-ligue-2", hasStandings: false },
  { id: 54, name: "İspanya La Liga 2", country: "İspanya", seasonId: 143416, uniqueTournamentId: 54, seasonName: "La Liga 2 26/27", slug: "ispanya-la-liga-2", hasStandings: false },
  { id: 25, name: "İngiltere 2. Lig", country: "İngiltere", seasonId: 140814, uniqueTournamentId: 25, seasonName: "League Two 26/27", slug: "ingiltere-2-lig", hasStandings: false },
  { id: 53, name: "İtalya Serie B", country: "İtalya", seasonId: 144488, uniqueTournamentId: 53, seasonName: "Serie B 26/27", slug: "italya-serie-b", hasStandings: false },
  { id: 131, name: "Hollanda Eerste Divisie", country: "Hollanda", seasonId: 142636, uniqueTournamentId: 131, seasonName: "Eerste Divisie 26/27", slug: "hollanda-eerste-divisie", hasStandings: false },
  { id: 96, name: "Türkiye Kupası", country: "Türkiye", seasonId: 145956, uniqueTournamentId: 96, seasonName: "Türkiye Kupası 26/27", slug: "turkiye-kupasi", hasStandings: false }
];

export function getIddaaLeague(id: number): IddaaLeague | undefined {
  return IDDAA_LEAGUES.find(league => league.id === id);
}
