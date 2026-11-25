import { useEffect, useState } from "react";
import "./FotMobTeamFormPanel.css";

type FormMatch = { result: "W" | "D" | "L"; score: string | null; scored: number | null; conceded: number | null; opponent: string | null; date: string | null };
type TeamStats = { sampleSize: number; scoredMatches: number; goalsForAvg: number | null; goalsAgainstAvg: number | null; over25Pct: number | null; bttsPct: number | null };
type TeamForm = { name: string; form: FormMatch[]; stats: TeamStats };
type FormResponse = { source: string; available: boolean; home?: TeamForm; away?: TeamForm; reason?: string; error?: string };

function stat(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${value.toLocaleString("tr-TR")}${suffix}`;
}
function FormSquares({ form }: { form: FormMatch[] }) {
  if (!form.length) return <span className="form-no-data">Veri yok</span>;
  return <div className="form-squares">{form.slice(0, 5).map((item, index) => (
    <i key={`${item.date || ""}-${index}`} className={`form-${item.result.toLowerCase()}`} title={`${item.opponent || "Rakip"} · ${item.score || item.result}`}>
      {item.result}
    </i>
  ))}</div>;
}
function TeamStatColumn({ team }: { team: TeamForm }) {
  const stats = [
    ["Attığı gol", stat(team.stats.goalsForAvg)],
    ["Yediği gol", stat(team.stats.goalsAgainstAvg)],
    ["2,5 üst", stat(team.stats.over25Pct, "%")],
    ["Karşılıklı gol", stat(team.stats.bttsPct, "%")]
  ];
  return <div className="team-stat-column">
    <strong>{team.name}</strong>
    <small>Son {team.stats.sampleSize} maç · skor verisi: {team.stats.scoredMatches}</small>
    {stats.map(([label, value]) => <div className="team-stat-item" key={label}><span>{label}</span><b>{value}</b></div>)}
  </div>;
}

export function FotMobTeamFormPanel({ matchId }: { matchId: string | number }) {
  const [data, setData] = useState<FormResponse | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setData(null);
    (async () => {
      try {
        const mapResponse = await fetch("/data/fotmob-event-map.json", { cache: "no-store" });
        if (!mapResponse.ok) throw new Error("FotMob eşleştirme dosyası okunamadı.");
        const eventMap = await mapResponse.json() as { matches: Array<{ mackolikMatchId: string; state: string; fotmobMatchId: number | null }> };
        const mapping = eventMap.matches.find(item => item.mackolikMatchId === String(matchId));
        if (!mapping || mapping.state !== "matched" || !mapping.fotmobMatchId) {
          if (active) setData({ source: "FotMob", available: false, reason: "Bu maç FotMob'da güvenilir biçimde eşleştirilmedi." });
          return;
        }
        const response = await fetch(`/api/fotmob-team-form?matchId=${encodeURIComponent(String(mapping.fotmobMatchId))}`, { cache: "no-store" });
        const payload = await response.json() as FormResponse;
        if (!response.ok) throw new Error(payload.error || `Geçmiş maç verisi alınamadı (HTTP ${response.status}).`);
        if (active) setData(payload);
      } catch (error) {
        if (active) setData({ source: "FotMob", available: false, error: error instanceof Error ? error.message : "Veri alınamadı." });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [matchId]);

  if (loading) return <div className="data-empty"><strong>Takım formu yükleniyor</strong><p>FotMob geçmiş maçları getiriliyor…</p></div>;
  if (!data?.available || !data.home || !data.away) return <div className="data-empty"><strong>Geçmiş maç verisi bulunamadı</strong><p>{data?.error || data?.reason || "Bu karşılaşma için doğrulanmış takım formu mevcut değil."}</p></div>;

  return <div className="fotmob-form-panel">
    <section className="info-card form-card">
      <div className="card-heading"><span>SON 5 MAÇ FORMU</span><small>FotMob · tamamlanmış maçlar</small></div>
      <div className="form-columns">
        <div><strong>{data.home.name}</strong><FormSquares form={data.home.form}/></div>
        <div><strong>{data.away.name}</strong><FormSquares form={data.away.form}/></div>
      </div>
    </section>
    <section className="info-card stat-card">
      <div className="card-heading"><span>TAKIM İSTATİSTİKLERİ</span><small>Geçmiş maç verisine göre</small></div>
      <div className="team-stats-grid">
        <TeamStatColumn team={data.home}/>
        <TeamStatColumn team={data.away}/>
      </div>
      <p className="data-footnote">Gol ortalamaları maç başınadır. Yüzdeler, skoru bulunan maçlar içindeki 2,5 üst ve karşılıklı gol oranıdır; örneklem sayısı takımın altında gösterilir.</p>
    </section>
  </div>;
}
