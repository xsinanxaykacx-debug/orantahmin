import { useEffect, useState } from "react";

type Player = { player?: { id?: number; name?: string }; position?: string; substitute?: boolean; shirtNumber?: number; captain?: boolean };
type TeamLineup = { players?: Player[]; formation?: string; missingPlayers?: unknown[] };
type LineupResponse = { confirmed?: boolean; home?: TeamLineup; away?: TeamLineup };
type EventMap = { matches?: Record<string, { eventId: number }> };

function TeamColumn({ title, team }: { title: string; team?: TeamLineup }) {
  const players = team?.players ?? [];
  const starters = players.filter(p => !p.substitute);
  const substitutes = players.filter(p => p.substitute);
  const list = (items: Player[]) => <ol>{items.map((p, i) => <li key={p.player?.id ?? i}>
    <span className="sofa-shirt">{p.shirtNumber ?? "—"}</span><span>{p.player?.name ?? "Bilinmeyen oyuncu"}</span>
    <small>{p.position ?? "—"}</small>{p.captain && <b>K</b>}
  </li>)}</ol>;
  return <section className="sofa-team">
    <header><strong>{title}</strong><span>{team?.formation || "Formasyon yok"}</span></header>
    <h4>İlk 11 <small>{starters.length}/11</small></h4>
    {starters.length ? list(starters) : <p className="sofa-muted">İlk 11 açıklanmadı.</p>}
    {substitutes.length > 0 && <><h4>Yedekler <small>{substitutes.length}</small></h4>{list(substitutes)}</>}
    {!!team?.missingPlayers?.length && <p className="sofa-muted">Eksik oyuncu: {team.missingPlayers.length}</p>}
  </section>;
}

export function SofascoreLineupPanel({ matchId }: { matchId: string | number }) {
  const [lineup, setLineup] = useState<LineupResponse | null>(null);
  const [eventId, setEventId] = useState<number | null>(null);
  const [message, setMessage] = useState("Kadro yükleniyor…");
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const mapResponse = await fetch("/data/sofascore-event-map.json", { cache: "no-store" });
        if (!mapResponse.ok) throw new Error("Sofascore eşleştirme dosyası okunamadı.");
        const map = await mapResponse.json() as EventMap;
        const id = map.matches?.[String(matchId)]?.eventId;
        if (!id) throw new Error("Bu maç için Sofascore event eşleştirmesi henüz yapılmadı.");
        const response = await fetch(`/api/sofascore-lineups?eventId=${id}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Kadro alınamadı: HTTP ${response.status}`);
        if (active) { setEventId(id); setLineup(data as LineupResponse); }
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "Kadro alınamadı.");
      }
    })();
    return () => { active = false; };
  }, [matchId]);

  if (!lineup) return <div className="placeholder-wrap"><div className="data-empty"><strong>Kadro bilgisi</strong><p>{message}</p></div></div>;
  return <div className="detail-content">
    <section className="info-card sofa-panel">
      <div className="card-heading"><span>SOFASCORE KADROSU</span><small>{lineup.confirmed ? "Kesinleşmiş" : "Kesinleşmedi · muhtemel"}</small></div>
      <p className="sofa-muted">Event ID: {eventId}</p>
      <div className="sofa-lineup-grid"><TeamColumn title="Ev sahibi" team={lineup.home}/><TeamColumn title="Deplasman" team={lineup.away}/></div>
    </section>
  </div>;
}
