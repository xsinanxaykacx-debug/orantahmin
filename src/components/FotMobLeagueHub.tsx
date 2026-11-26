import { useEffect, useMemo, useState } from "react";
import "./FotMobLeagueHub.css";

export type LeagueSummary = {
  id: number;
  name: string;
  country: string | null;
  logo: string;
  matchCount: number;
  matches: Array<{
    mackolikMatchId: string;
    fotmobMatchId: number;
    date: string;
    time: string;
    home: string;
    away: string;
    homeTeamId?: number | null;
    awayTeamId?: number | null;
    homeScore: number | null;
    awayScore: number | null;
    status: string | null;
    started: boolean;
    finished: boolean;
  }>;
};
type TableRow = { idx?: number; name?: string; shortName?: string; id?: number; played?: number; wins?: number; draws?: number; losses?: number; scoresStr?: string; goalConDiff?: number; pts?: number; recentForm?: string[] };
type LeagueDetail = { details?: { name?: string; selectedSeason?: string; country?: string; leagueColor?: string }; tableGroups?: Array<{ name: string; rows: TableRow[] }>; fixtures?: any; stats?: any; error?: string };

function extractFixtures(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value.fixtures)) return value.fixtures;
  if (Array.isArray(value.allMatches)) return value.allMatches;
  if (Array.isArray(value.allFixtures?.fixtures)) return value.allFixtures.fixtures;
  if (Array.isArray(value.matches)) return value.matches;
  for (const key of ["allFixtures", "upcoming", "results", "data"]) {
    const found = extractFixtures(value[key]);
    if (found.length) return found;
  }
  return [];
}
function formatFixtureStatus(match: any): string {
  if (match.finished || match.status?.finished) return "MS";
  if (match.started || match.status?.started) return match.status?.reason?.short || "CANLI";
  return match.status?.reason?.short || match.time || match.matchDate || "—";
}
function TeamLogo({ id, name, className = "" }: { id?: number | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return <span className={`fotmob-team-logo ${className}`}>
    {id && !failed ? <img src={`https://images.fotmob.com/image_resources/logo/teamlogo/${id}.png`} alt="" loading="lazy" onError={() => setFailed(true)} /> : null}
    {(!id || failed) ? <span>{name.slice(0, 1).toLocaleUpperCase("tr-TR")}</span> : null}
  </span>;
}
function Table({ rows }: { rows: TableRow[] }) {
  return <div className="league-table-scroll"><table className="league-table">
    <thead><tr><th>#</th><th>Takım</th><th>O</th><th>G</th><th>B</th><th>M</th><th>AG</th><th>YG</th><th>AV</th><th>P</th><th>Son 5</th></tr></thead>
    <tbody>{rows.map((row, index) => {
      const score = String(row.scoresStr || "").match(/(\d+)\s*[:–-]\s*(\d+)/);
      const form = Array.isArray(row.recentForm) ? row.recentForm.slice(-5) : [];
      const goalDiff = row.goalConDiff;
      const goalDiffText = goalDiff == null ? "—" : Number.isFinite(Number(goalDiff))
        ? `${Number(goalDiff) > 0 ? "+" : ""}${goalDiff}` : String(goalDiff);
      return <tr key={row.id || row.name || index}>
        <td>{row.idx ?? index + 1}</td><td className="league-team-cell"><TeamLogo id={row.id} name={row.name || "Takım"} /><span>{row.name || "Takım"}</span></td>
        <td>{row.played ?? "—"}</td><td>{row.wins ?? "—"}</td><td>{row.draws ?? "—"}</td><td>{row.losses ?? "—"}</td>
        <td>{score ? score[1] : "—"}</td><td>{score ? score[2] : "—"}</td><td>{goalDiffText}</td><td><b>{row.pts ?? "—"}</b></td>
        <td><span className="league-form">{form.length ? form.map((result, formIndex) => <i key={formIndex} className={`league-form-${result.toLowerCase()}`} title={result === "G" ? "Galibiyet" : result === "B" ? "Beraberlik" : "Mağlubiyet"}>{result}</i>) : "—"}</span></td>
      </tr>;
    })}</tbody>
  </table></div>;
}
function FixtureList({ matches }: { matches: any[] }) {
  if (!matches.length) return <div className="league-empty">Bu lig için listelenebilir maç verisi bulunamadı.</div>;
  return <div className="league-fixtures">{matches.map((match, index) => {
    const home = match.home?.name || match.home || "Ev sahibi";
    const away = match.away?.name || match.away || "Deplasman";
    const homeId = Number(match.home?.id || match.homeTeam?.id || match.homeTeamId || match.homeId) || null;
    const awayId = Number(match.away?.id || match.awayTeam?.id || match.awayTeamId || match.awayId) || null;
    const scoreText = match.status?.scoreStr || "";
    const scoreParts = scoreText.match(/(\d+)\s*[-–:]\s*(\d+)/);
    const hs = match.homeScore ?? match.home?.score ?? (scoreParts ? Number(scoreParts[1]) : null);
    const as = match.awayScore ?? match.away?.score ?? (scoreParts ? Number(scoreParts[2]) : null);
    const hasScore = hs !== null && hs !== undefined && as !== null && as !== undefined;
    return <div className="league-fixture" key={match.id || match.fotmobMatchId || index}>
      <div className="league-fixture-time">{match.time || match.matchDate || (match.status?.utcTime ? new Date(match.status.utcTime).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—")}<small>{formatFixtureStatus(match)}</small></div>
      <div className="league-fixture-teams"><span><TeamLogo id={homeId} name={home} />{home}</span><span><TeamLogo id={awayId} name={away} />{away}</span></div>
      <b className="league-fixture-score">{hasScore ? `${hs} : ${as}` : "— : —"}</b>
    </div>;
  })}</div>;
}

export function FotMobLeagueHub({ league }: { league: LeagueSummary }) {
  const [detail, setDetail] = useState<LeagueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null); setDetail(null);
    fetch(`/api/fotmob-league-detail?leagueId=${league.id}&matchId=${league.matches[0]?.fotmobMatchId || ""}`)
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Lig detayları alınamadı.");
        return payload as LeagueDetail;
      })
      .then(payload => { if (active) setDetail(payload); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Lig verisi alınamadı."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [league.id]);

  const fixtures = useMemo(() => {
    const seasonFixtures = extractFixtures(detail?.fixtures);
    if (!seasonFixtures.length) return league.matches;
    const upcoming = seasonFixtures.filter((match: any) => !match.status?.finished && !match.status?.cancelled)
      .sort((a: any, b: any) => String(a.status?.utcTime || "").localeCompare(String(b.status?.utcTime || "")));
    if (upcoming.length) return upcoming.slice(0, 10);
    return seasonFixtures.filter((match: any) => match.status?.finished)
      .sort((a: any, b: any) => String(b.status?.utcTime || "").localeCompare(String(a.status?.utcTime || ""))).slice(0, 10);
  }, [detail, league.matches]);
  const playerLeaders = useMemo(() => {
    const players = detail?.stats?.players || [];
    const findPlayers = (pattern: RegExp) => {
      const category = players.find((item: any) => pattern.test(String(item.header || item.name || "")));
      return (category?.topThree || category?.top || []).slice(0, 3);
    };
    return {
      scorers: findPlayers(/top scorer|goals|gol/i),
      assists: findPlayers(/assist/i),
      ratings: findPlayers(/rating|puan/i)
    };
  }, [detail]);

  return <div className="league-hub">
    <header className="league-hub-header">
      <div className="league-hub-logo"><img src={league.logo} alt="" onError={event => { event.currentTarget.style.display = "none"; }} /><span>{league.name.slice(0, 1).toLocaleUpperCase("tr-TR")}</span></div>
      <div><span className="eyebrow">LİG MERKEZİ</span><h2>{detail?.details?.name || league.name}</h2><p>{detail?.details?.country || league.country || "Uluslararası"} · {detail?.details?.selectedSeason || "Güncel sezon"}</p></div>
      <div className="league-hub-count"><b>{league.matchCount}</b><span>Bültendeki maç</span></div>
    </header>
    {loading ? <div className="league-loading">Lig puan durumu ve sezon verileri yükleniyor…</div>
      : error ? <div className="league-warning">{error}</div>
      : <div className="league-hub-grid">
        <section className="info-card league-panel league-table-panel">
          <div className="card-heading"><span>LİG PUAN DURUMU</span><small>{detail?.details?.selectedSeason || "Güncel sezon"}</small></div>
          {(detail?.tableGroups || []).length ? detail!.tableGroups!.map((group, index) => <div key={`${group.name}-${index}`}><div className="league-group-title">{group.name}</div><Table rows={group.rows} /></div>)
            : <div className="league-empty">Bu organizasyon için puan tablosu yayımlanmamış veya formatı farklı.</div>}
        </section>
        <section className="info-card league-panel league-fixture-panel">
          <div className="card-heading"><span>LİG MAÇLARI</span><small>{fixtures.length ? `${fixtures.length} karşılaşma` : "Veri yok"}</small></div>
          <FixtureList matches={fixtures} />
        </section>
        {[
          { title: "EN GOLCÜLER", players: playerLeaders.scorers, empty: "Gol krallığı verisi bulunmuyor." },
          { title: "EN ÇOK ASİST", players: playerLeaders.assists, empty: "Asist verisi bulunmuyor." },
          { title: "EN YÜKSEK PUAN", players: playerLeaders.ratings, empty: "Oyuncu puan verisi bulunmuyor." }
        ].map(card => <section className="info-card league-panel league-scorers-panel" key={card.title}>
          <div className="card-heading"><span>{card.title}</span><small>FotMob · İlk 3</small></div>
          {card.players.length ? <div className="league-scorers">{card.players.map((player: any, index: number) => {
            const teamId = Number(player.teamId || player.team?.id) || null;
            return <div key={player.id || player.name || index}>
              <span>{index + 1}</span>
              <b>{player.name || player.participant?.name || "Oyuncu"}{teamId ? <TeamLogo id={teamId} name={player.teamName || player.team?.name || ""} /> : null}</b>
              <strong>{player.value ?? player.statValue ?? "—"}</strong>
            </div>;
          })}</div> : <div className="league-empty">{card.empty}</div>}
        </section>)}
      </div>}
    <p className="league-source-note">Kaynak: FotMob. Yalnızca kaynakta bulunan lig tablosu ve fikstür bilgileri gösterilir.</p>
  </div>;
}
