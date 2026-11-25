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
    homeScore: number | null;
    awayScore: number | null;
    status: string | null;
    started: boolean;
    finished: boolean;
  }>;
};
type TableRow = { idx?: number; name?: string; shortName?: string; id?: number; played?: number; wins?: number; draws?: number; losses?: number; scoresStr?: string; goalConDiff?: number; pts?: number };
type LeagueDetail = { details?: { name?: string; selectedSeason?: string; country?: string; leagueColor?: string }; tableGroups?: Array<{ name: string; rows: TableRow[] }>; fixtures?: any; stats?: any; error?: string };

function extractFixtures(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value.fixtures)) return value.fixtures;
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
function Table({ rows }: { rows: TableRow[] }) {
  return <div className="league-table-scroll"><table className="league-table">
    <thead><tr><th>#</th><th>Takım</th><th>O</th><th>G</th><th>B</th><th>M</th><th>AV</th><th> P</th></tr></thead>
    <tbody>{rows.map((row, index) => <tr key={row.id || row.name || index}>
      <td>{row.idx ?? index + 1}</td><td className="league-team-cell"><span>{row.name || "Takım"}</span></td>
      <td>{row.played ?? "—"}</td><td>{row.wins ?? "—"}</td><td>{row.draws ?? "—"}</td><td>{row.losses ?? "—"}</td>
      <td>{row.goalConDiff ?? "—"}</td><td><b>{row.pts ?? "—"}</b></td>
    </tr>)}</tbody>
  </table></div>;
}
function FixtureList({ matches }: { matches: any[] }) {
  if (!matches.length) return <div className="league-empty">Bu lig için listelenebilir maç verisi bulunamadı.</div>;
  return <div className="league-fixtures">{matches.map((match, index) => {
    const home = match.home?.name || match.home || "Ev sahibi";
    const away = match.away?.name || match.away || "Deplasman";
    const hs = match.homeScore ?? match.home?.score;
    const as = match.awayScore ?? match.away?.score;
    const hasScore = hs !== null && hs !== undefined && as !== null && as !== undefined;
    return <div className="league-fixture" key={match.id || match.fotmobMatchId || index}>
      <div className="league-fixture-time">{match.time || match.matchDate || "—"}<small>{formatFixtureStatus(match)}</small></div>
      <div className="league-fixture-teams"><span>{home}</span><span>{away}</span></div>
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
    fetch(`/api/fotmob-league-detail?leagueId=${league.id}`)
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
    return seasonFixtures.length ? seasonFixtures : league.matches;
  }, [detail, league.matches]);
  const topScorers = useMemo(() => {
    const players = detail?.stats?.players || [];
    const scorer = players.find((item: any) => /goal|gol|scorer/i.test(String(item.header || item.name || ""))) || players[0];
    return (scorer?.topThree || scorer?.top || []).slice(0, 3);
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
        <section className="info-card league-panel league-scorers-panel">
          <div className="card-heading"><span>GOL KRALLIĞI</span><small>FotMob</small></div>
          {topScorers.length ? <div className="league-scorers">{topScorers.map((player: any, index: number) => <div key={player.id || player.name || index}><span>{index + 1}</span><b>{player.name || player.participant?.name || "Oyuncu"}</b><strong>{player.value ?? player.statValue ?? "—"}</strong></div>)}</div>
            : <div className="league-empty">Gol krallığı verisi bu lig yanıtında bulunmuyor.</div>}
        </section>
      </div>}
    <p className="league-source-note">Kaynak: FotMob. Yalnızca kaynakta bulunan lig tablosu ve fikstür bilgileri gösterilir.</p>
  </div>;
}
