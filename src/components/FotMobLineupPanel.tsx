import { useEffect, useState } from "react";
import "./FotMobLineupPanel.css";

type MapRecord = {
  mackolikMatchId: string;
  state: "matched" | "unmatched" | "ambiguous" | "invalid_bulletin_team";
  fotmobMatchId: number | null;
  fotmobHome: string | null;
  fotmobAway: string | null;
  league: string | null;
  confidence: number;
  lineupAvailable: boolean;
};
type EventMap = { matches: MapRecord[] };
type Player = { id?: number; name?: string; shirtNumber?: number; positionId?: number | string; captain?: boolean };
type Team = {
  name?: string;
  formation?: string;
  starterCount: number;
  starters: Player[];
  benchCount: number;
  bench: Player[];
  unavailableCount: number;
};
type LineupResponse = {
  source: string;
  matchId: string;
  lineupType?: string | null;
  lineupSource?: string | null;
  hasLineup: boolean;
  home: Team | null;
  away: Team | null;
};

function PlayerList({ players }: { players: Player[] }) {
  return <ol className="fotmob-player-list">{players.map((player, index) => (
    <li key={player.id ?? index}>
      <span className="fotmob-shirt">{player.shirtNumber ?? "—"}</span>
      <span className="fotmob-player-name">{player.name || "Oyuncu adı yok"}{player.captain && <b className="fotmob-captain">K</b>}</span>
      <small>{player.positionId == null ? "—" : `Pozisyon ${player.positionId}`}</small>
    </li>
  ))}</ol>;
}

function TeamColumn({ title, team }: { title: string; team: Team | null }) {
  if (!team) return <section className="fotmob-team"><header><strong>{title}</strong></header><p className="fotmob-muted">Takım kadrosu yok.</p></section>;
  return <section className="fotmob-team">
    <header><strong>{team.name || title}</strong><span>{team.formation || "Formasyon yok"}</span></header>
    <div className="fotmob-list-heading"><strong>İlk 11</strong><small>{team.starterCount}/11</small></div>
    {team.starters.length ? <PlayerList players={team.starters}/> : <p className="fotmob-muted">İlk 11 açıklanmadı.</p>}
    <div className="fotmob-list-heading"><strong>Yedekler</strong><small>{team.benchCount}</small></div>
    {team.bench.length ? <PlayerList players={team.bench}/> : <p className="fotmob-muted">Yedek listesi açıklanmadı.</p>}
    {team.unavailableCount > 0 && <p className="fotmob-unavailable">Eksik oyuncu: {team.unavailableCount}</p>}
  </section>;
}

export function FotMobLineupPanel({ matchId }: { matchId: string | number }) {
  const [loading, setLoading] = useState(true);
  const [mapping, setMapping] = useState<MapRecord | null>(null);
  const [lineup, setLineup] = useState<LineupResponse | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMapping(null);
    setLineup(null);
    setMessage("");
    (async () => {
      try {
        const mapResponse = await fetch("/data/fotmob-event-map.json", { cache: "no-store" });
        if (!mapResponse.ok) throw new Error("FotMob eşleştirme dosyası okunamadı.");
        const map = await mapResponse.json() as EventMap;
        const record = map.matches.find(item => item.mackolikMatchId === String(matchId));
        if (!record) throw new Error("Bu maç için eşleştirme kaydı bulunamadı.");
        if (!active) return;
        setMapping(record);
        if (record.state !== "matched" || !record.fotmobMatchId) {
          setMessage(record.state === "invalid_bulletin_team"
            ? "Bültende takım adı eksik; güvenilir eşleştirme yapılamadı."
            : record.state === "ambiguous"
              ? "Birden fazla olası FotMob maçı bulundu; yanlış kadro göstermemek için eşleştirme beklemeye alındı."
              : "Bu karşılaşma FotMob fikstüründe güvenilir biçimde eşleşmedi.");
          return;
        }
        if (!record.lineupAvailable) {
          setMessage("Maç FotMob'da bulundu ancak şu anda yayınlanmış kadro verisi yok.");
          return;
        }
        const response = await fetch(`/api/fotmob-test?matchId=${record.fotmobMatchId}`, { cache: "no-store" });
        const data = await response.json() as LineupResponse & { error?: string };
        if (!response.ok) throw new Error(data.error || `FotMob kadrosu alınamadı (HTTP ${response.status}).`);
        if (!active) return;
        if (!data.hasLineup) {
          setMessage("FotMob maçı bulundu ancak kadro ayrıntısı şu anda mevcut değil.");
          return;
        }
        setLineup(data);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "Kadro verisi alınamadı.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [matchId]);

  if (loading) return <div className="placeholder-wrap"><div className="data-empty"><strong>FotMob kadrosu</strong><p>Eşleşme ve kadro bilgisi yükleniyor…</p></div></div>;
  if (!mapping || !lineup) return <div className="detail-content">
    <section className="info-card fotmob-status-card">
      <div className="card-heading"><span>FOTMOB KADRO DURUMU</span><small>{mapping?.state === "matched" ? "Maç eşleşti" : "Kadro gösterilemiyor"}</small></div>
      <strong>{message || "Kadro bilgisi bulunamadı."}</strong>
      {mapping?.fotmobMatchId && <p>{mapping.fotmobHome} – {mapping.fotmobAway} · FotMob ID: {mapping.fotmobMatchId}</p>}
      {mapping?.league && <small>{mapping.league}</small>}
    </section>
  </div>;

  return <div className="detail-content">
    <section className="info-card fotmob-panel">
      <div className="card-heading"><span>FOTMOB KADROSU</span><small>{lineup.lineupType || "Kadro verisi"} · Doğrudan kaynak</small></div>
      <div className="fotmob-source-meta">
        <span>FotMob ID: {mapping.fotmobMatchId}</span>
        <span>Eşleşme güveni: {Math.round(mapping.confidence * 100)}%</span>
        {lineup.lineupSource && <span>Kaynak: {lineup.lineupSource}</span>}
      </div>
      <div className="fotmob-lineup-grid">
        <TeamColumn title="Ev sahibi" team={lineup.home}/>
        <TeamColumn title="Deplasman" team={lineup.away}/>
      </div>
    </section>
  </div>;
}
