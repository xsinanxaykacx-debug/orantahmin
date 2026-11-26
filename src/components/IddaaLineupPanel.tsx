import { useEffect, useState } from "react";
import "./FotMobLineupPanel.css";

type Player = {
  name: string;
  shirtNumber: number | string | null;
  role: string | null;
  pitchPosition: string | null;
  x: number | null;
  y: number | null;
};
type Team = {
  name: string | null;
  logo: string | null;
  formation: string | null;
  starters: Player[];
  substitutes: Player[];
};
type LineupResponse = {
  source: string;
  eventId: string;
  lineupType: string;
  lineupSource: string | null;
  hasLineup: boolean;
  home: Team;
  away: Team;
  fetchedAt?: string;
  error?: string;
};

function PlayerList({ players }: { players: Player[] }) {
  return <ol className="fotmob-player-list">{players.map((player, index) => (
    <li key={`${player.shirtNumber ?? "x"}-${player.name}-${index}`}>
      <span className="fotmob-shirt">{player.shirtNumber ?? "—"}</span>
      <span className="fotmob-player-name">{player.name || "Oyuncu adı yok"}</span>
      <small>{player.role || player.pitchPosition || "—"}</small>
    </li>
  ))}</ol>;
}

function TeamColumn({ title, team }: { title: string; team: Team }) {
  const [logoFailed, setLogoFailed] = useState(false);
  return <section className="fotmob-team">
    <header>
      <strong className="fotmob-lineup-team-name">
        {team.logo && !logoFailed ? <img src={team.logo} alt="" loading="lazy" onError={() => setLogoFailed(true)} /> : null}
        {team.name || title}
      </strong>
      <span>{team.formation || "Diziliş yok"}</span>
    </header>
    <div className="fotmob-list-heading"><strong>Muhtemel 11</strong><small>{team.starters.length}/11</small></div>
    {team.starters.length ? <PlayerList players={team.starters} /> : <p className="fotmob-muted">Muhtemel 11 henüz yayınlanmadı.</p>}
    <div className="fotmob-list-heading"><strong>Yedekler</strong><small>{team.substitutes.length}</small></div>
    {team.substitutes.length ? <PlayerList players={team.substitutes} /> : <p className="fotmob-muted">Yedek listesi bulunmuyor.</p>}
  </section>;
}

export function IddaaLineupPanel({ matchId }: { matchId: string | number }) {
  const [loading, setLoading] = useState(true);
  const [lineup, setLineup] = useState<LineupResponse | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setLineup(null);
    setMessage("");
    fetch(`/api/iddaa-lineups?eventId=${encodeURIComponent(String(matchId))}`, {
      cache: "no-store",
      signal: controller.signal
    }).then(async response => {
      const payload = await response.json() as LineupResponse;
      if (!response.ok) throw new Error(payload.error || `iddaa kadrosu alınamadı (HTTP ${response.status}).`);
      return payload;
    }).then(payload => {
      if (!active) return;
      if (!payload.hasLineup) {
        setMessage("iddaa.com bu maç için henüz Muhtemel 11 verisi yayınlamadı.");
        return;
      }
      setLineup(payload);
    }).catch(error => {
      if (active && !(error instanceof DOMException && error.name === "AbortError")) {
        setMessage(error instanceof Error ? error.message : "Kadro verisi alınamadı.");
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [matchId]);

  if (loading) return <div className="placeholder-wrap"><div className="data-empty"><strong>İddaa kadrosu</strong><p>Muhtemel 11 ve yedekler yükleniyor…</p></div></div>;
  if (!lineup) return <div className="detail-content">
    <section className="info-card fotmob-status-card">
      <div className="card-heading"><span>İDDAA · KADRO</span><small>Tek kaynak</small></div>
      <strong>{message || "Kadro bilgisi bulunamadı."}</strong>
    </section>
  </div>;

  return <div className="detail-content">
    <section className="info-card fotmob-panel">
      <div className="card-heading"><span>İDDAA · MUHTEMEL 11</span><small>{lineup.lineupSource || "iddaa.com"}</small></div>
      <div className="fotmob-source-meta">
        <span>Maç ID: {lineup.eventId}</span>
        <span>Kaynak: iddaa.com</span>
        {lineup.fetchedAt && <span>Son kontrol: {new Date(lineup.fetchedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>}
      </div>
      <div className="fotmob-lineup-grid">
        <TeamColumn title="Ev sahibi" team={lineup.home} />
        <TeamColumn title="Deplasman" team={lineup.away} />
      </div>
      <p className="fotmob-muted">Not: İddaa verisi Muhtemel 11 olarak sunulur; kesinleşmiş resmî kadro anlamına gelmez.</p>
    </section>
  </div>;
}
